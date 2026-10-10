import os
import sys
from unittest.mock import MagicMock


# 1. Setup mock modules for missing backend dependencies to run completely offline
class MockUniqueViolation(Exception):
    pass

class MockJWTError(Exception):
    pass

mock_psycopg2 = MagicMock()
mock_psycopg2_errors = MagicMock()
mock_psycopg2_errors.UniqueViolation = MockUniqueViolation
mock_psycopg2_extras = MagicMock()

mock_jose = MagicMock()
mock_jose.JWTError = MockJWTError
mock_jose.jwt = MagicMock()

sys.modules["psycopg2"] = mock_psycopg2
sys.modules["psycopg2.errors"] = mock_psycopg2_errors
sys.modules["psycopg2.extras"] = mock_psycopg2_extras
sys.modules["supabase"] = MagicMock()
sys.modules["upstash_redis"] = MagicMock()
sys.modules["upstash_redis.asyncio"] = MagicMock()
sys.modules["boto3"] = MagicMock()
sys.modules["resend"] = MagicMock()
sys.modules["apscheduler"] = MagicMock()
sys.modules["apscheduler.schedulers"] = MagicMock()
sys.modules["apscheduler.schedulers.asyncio"] = MagicMock()
sys.modules["jose"] = mock_jose
sys.modules["passlib"] = MagicMock()
sys.modules["passlib.context"] = MagicMock()
sys.modules["numpy"] = MagicMock()
sys.modules["sklearn"] = MagicMock()
sys.modules["sklearn.ensemble"] = MagicMock()
sys.modules["websockets"] = MagicMock()

# 2. Configure test environment variables before importing any modules
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_KEY"] = "dummykey"
os.environ["SUPABASE_DB_URL"] = "postgresql://postgres:pass@localhost:5432/postgres"
os.environ["UPSTASH_REDIS_REST_URL"] = "https://example.upstash.io"
os.environ["UPSTASH_REDIS_REST_TOKEN"] = "dummytoken"
os.environ["JWT_SECRET_KEY"] = "secretfortestingonly"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"

# Add backend directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
