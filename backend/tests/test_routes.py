import os
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, AsyncMock

# Add backend directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Override security methods BEFORE importing the rest of the application
import core.security
core.security.get_password_hash = lambda password: f"hashed-{password}"
core.security.verify_password = lambda plain, hashed: hashed == f"hashed-{plain}"
core.security.create_access_token = lambda data, expires_delta=None: f"token-{data['sub']}"
core.security.decode_access_token = lambda token: {"sub": token.replace("token-", "")} if token.startswith("token-") else None

# 3. Patch anomaly workers to disable background lifespan tasks during testing
patcher_start = patch("workers.anomaly_worker.start_worker")
patcher_stop = patch("workers.anomaly_worker.stop_worker")
patcher_start.start()
patcher_stop.start()


import pytest
from psycopg2.errors import UniqueViolation
from fastapi.testclient import TestClient
from main import app
from core.security import get_password_hash, create_access_token

# Create a test client
client = TestClient(app)


# 3. Setup global fixtures
@pytest.fixture(autouse=True)
def mock_redis():
    """Mock out Upstash Redis asyncio client stream interactions."""
    with patch("core.redis.async_redis_client", new_callable=AsyncMock) as mock_async_redis:
        mock_async_redis.xadd.return_value = "msg-123"
        yield mock_async_redis


@pytest.fixture
def mock_db():
    """Mock psycopg2 database connection context managers globally."""
    with patch("psycopg2.connect") as mock_connect:
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        
        # Setup context manager return values
        mock_conn.__enter__.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cur
        mock_cur.__enter__.return_value = mock_cur
        
        mock_connect.return_value = mock_conn
        yield mock_cur


@pytest.fixture
def auth_headers():
    """Generate valid mock user JWT authorization headers."""
    token = create_access_token({"sub": "99999999-9999-9999-9999-999999999999"})
    return {"Authorization": f"Bearer {token}"}


# 4. Route verification test cases
def test_health_check_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_auth_register_success(mock_db):
    # Mock INSERT RETURNING id query result
    mock_db.fetchone.return_value = {"id": "99999999-9999-9999-9999-999999999999"}
    
    response = client.post("/auth/register", json={
        "email": "test-user@example.com",
        "password": "strongpassword123"
    })
    
    assert response.status_code == 201
    assert "access_token" in response.json()


def test_auth_register_duplicate_email(mock_db):
    # Mock unique constraint violation error on duplicate email insertion
    mock_db.execute.side_effect = UniqueViolation("Key (email)=(test-user@example.com) already exists.")
    
    response = client.post("/auth/register", json={
        "email": "test-user@example.com",
        "password": "strongpassword123"
    })
    
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_auth_login_success(mock_db):
    # Prepare mock user database entry
    hashed_pwd = get_password_hash("mypassword")
    mock_db.fetchone.return_value = {
        "id": "99999999-9999-9999-9999-999999999999",
        "hashed_password": hashed_pwd
    }
    
    response = client.post("/auth/login", json={
        "email": "test-user@example.com",
        "password": "mypassword"
    })
    
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_auth_login_failure(mock_db):
    # Simulate user not found in database
    mock_db.fetchone.return_value = None
    
    response = client.post("/auth/login", json={
        "email": "missing-user@example.com",
        "password": "mypassword"
    })
    
    assert response.status_code == 401
    assert "Incorrect email" in response.json()["detail"]


def test_list_services_route(mock_db, auth_headers):
    # Prepare dummy services list
    mock_db.fetchall.return_value = [
        {
            "id": "12345678-1234-5678-1234-567812345678",
            "name": "Frontend API Gateway",
            "description": "Vue frontend gateway",
            "api_key": "dp_abcdef",
            "owner_id": "99999999-9999-9999-9999-999999999999",
            "created_at": datetime.now(timezone.utc),
            "is_active": True
        }
    ]
    
    response = client.get("/services/", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["name"] == "Frontend API Gateway"


def test_create_service_route(mock_db, auth_headers):
    # Mock INSERT RETURNING query result for service creation
    mock_db.fetchone.return_value = {
        "id": "11111111-2222-3333-4444-555555555555",
        "name": "Database Cluster",
        "description": "Postgres replica logs",
        "api_key": "dp_xyz123",
        "owner_id": "99999999-9999-9999-9999-999999999999",
        "created_at": datetime.now(timezone.utc),
        "is_active": True
    }
    
    response = client.post("/services/", json={
        "name": "Database Cluster",
        "description": "Postgres replica logs"
    }, headers=auth_headers)
    
    assert response.status_code == 201
    assert response.json()["id"] == "11111111-2222-3333-4444-555555555555"
    assert response.json()["api_key"].startswith("dp_")


def test_ingest_metric_with_sdk_api_key(mock_db):
    # 1. Mock SDK API Key query verification select
    mock_db.fetchone.side_effect = [
        {"id": "12345678-1234-5678-1234-567812345678"}, # For API Key verification
        {                           # For INSERT RETURNING
            "id": "22222222-2222-2222-2222-222222222222",
            "service_id": "12345678-1234-5678-1234-567812345678",
            "metric_type": "cpu",
            "value": 67.5,
            "timestamp": datetime.now(timezone.utc),
            "metadata": {"source": "test"}
        }
    ]
    
    response = client.post("/metrics/ingest", json={
        "service_id": "12345678-1234-5678-1234-567812345678",
        "metric_type": "cpu",
        "value": 67.5,
        "metadata": {"source": "test"}
    }, headers={"X-API-Key": "dp_valid_key_123"})
    
    assert response.status_code == 201
    assert response.json()["id"] == "22222222-2222-2222-2222-222222222222"
    assert response.json()["value"] == 67.5


def test_get_historical_metrics(mock_db, auth_headers):
    # 1. Mock service ownership validation, then historical metrics select
    mock_db.fetchone.return_value = {"id": "12345678-1234-5678-1234-567812345678"}
    mock_db.fetchall.return_value = [
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "service_id": "12345678-1234-5678-1234-567812345678",
            "metric_type": "memory",
            "value": 45.2,
            "timestamp": datetime.now(timezone.utc),
            "metadata": {}
        }
    ]
    
    response = client.get("/metrics/12345678-1234-5678-1234-567812345678", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["metric_type"] == "memory"


def test_list_unresolved_alerts(mock_db, auth_headers):
    # Mock fetching active alerts
    mock_db.fetchall.return_value = [
        {
            "id": "98765432-5678-1234-5678-123456789abc",
            "service_id": "12345678-1234-5678-1234-567812345678",
            "metric_id": "22222222-2222-2222-2222-222222222222",
            "severity": "critical",
            "message": "High CPU utilization outlying threshold",
            "is_resolved": False,
            "created_at": datetime.now(timezone.utc),
            "resolved_at": None
        }
    ]
    
    response = client.get("/alerts/?resolved=false", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["severity"] == "critical"


def test_resolve_alert_success(mock_db, auth_headers):
    # Mock UPDATE RETURNING resolved alert entry
    mock_db.fetchone.return_value = {
        "id": "98765432-5678-1234-5678-123456789abc",
        "service_id": "12345678-1234-5678-1234-567812345678",
        "metric_id": None,
        "severity": "medium",
        "message": "Out of memory",
        "is_resolved": True,
        "created_at": datetime.now(timezone.utc),
        "resolved_at": datetime.now(timezone.utc)
    }
    
    response = client.patch("/alerts/98765432-5678-1234-5678-123456789abc/resolve", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["is_resolved"] is True
