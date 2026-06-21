import os
import sys
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch, AsyncMock

# Add backend directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)


from ml.zscore import ZScoreDetector


from ml.forecaster import Forecaster
from ml.explainer import Explainer
from ml.correlator import IncidentCorrelator

# --- Test Z-Score Detector ---
@pytest.mark.asyncio
async def test_zscore_detector_push_and_get():
    detector = ZScoreDetector()
    
    mock_redis = AsyncMock()
    mock_redis.lrange.return_value = [
        '{"t": 1700000000.0, "v": 10.0}',
        '{"t": 1700000010.0, "v": 12.0}',
        '{"t": 1700000020.0, "v": 11.0}',
        '10.5' # Test fallback/backward compatibility
    ]
    
    with patch("ml.zscore.async_redis_client", mock_redis):
        values = await detector.push_and_get_window("s-1", "cpu", 15.0)
        assert len(values) == 4
        assert values == [10.0, 12.0, 11.0, 10.5]
        assert mock_redis.lpush.called
        assert mock_redis.ltrim.called

@pytest.mark.asyncio
async def test_zscore_detector_timestamped_window():
    detector = ZScoreDetector()
    mock_redis = AsyncMock()
    mock_redis.lrange.return_value = [
        '{"t": 1700000020.0, "v": 20.0}',
        '{"t": 1700000010.0, "v": 10.0}',
        '15.0' # Fallback
    ]
    
    with patch("ml.zscore.async_redis_client", mock_redis):
        window = await detector.get_timestamped_window("s-1", "cpu")
        # Should be reversed to chronological order
        assert len(window) == 3
        assert window[0]["v"] == 15.0  # fallback was at end of index (oldest after reverse)
        assert window[2]["v"] == 20.0  # first index becomes last (newest after reverse)


# --- Test Forecaster ---
def test_forecaster_no_breach():
    forecaster = Forecaster()
    # Steady line: y = 10
    history = [{"t": float(i * 10), "v": 10.0} for i in range(10)]
    res = forecaster.forecast("cpu", history)
    assert res["breached"] is False
    assert res["predicted_value_15m"] == 10.0

def test_forecaster_with_breach():
    forecaster = Forecaster()
    # Rising line: y = 2 * t + 0
    # At t = 90 (last element), value is 180 (threshold is 90) -> wait, let's make it start below 90 and cross it
    # Let's say threshold is 90. Value at t=0 is 50. Value rises by 1 per 10s.
    # At t=90, value is 59.
    history = [{"t": float(i * 10), "v": 50.0 + i} for i in range(10)]
    # slope = 0.1 per second = 6 per minute
    # At current_time = 90, value is 59.
    # Prediction in 5 min (300s): 59 + 0.1 * 300 = 89
    # Prediction in 15 min (900s): 59 + 0.1 * 900 = 149
    # This breaches the threshold of 90 (cpu threshold)
    res = forecaster.forecast("cpu", history)
    assert res["breached"] is True
    assert res["threshold"] == 90.0
    # Time to breach from current_time=90 to 90.0:
    # 90.0 = 0.1 * t_breach + 50 => t_breach = 400.
    # time_to_breach = 400 - 90 = 310s = 5.16 min
    assert 5.0 <= res["predicted_breach_in_minutes"] <= 5.3

# --- Test Explainer ---
def test_explainer_normal_anomaly():
    result = MagicMock()
    result.metadata = {"rolling_mean": 50.0, "seasonal_mean": 45.0}
    result.contributing_methods = ["zscore", "seasonal"]
    
    explanation = Explainer.generate_explanation("cpu", 90.0, result)
    assert "CPU usage hit 90.0%" in explanation
    assert "2.0x higher than the typical 45.0% seen at this hour" in explanation
    assert "both the zscore and seasonal models" in explanation

def test_explainer_predictive_alert():
    pred_context = {
        "breached": True,
        "threshold": 90.0,
        "predicted_breach_in_minutes": 12.5,
        "slope": 0.1
    }
    explanation = Explainer.generate_explanation("cpu", 85.0, MagicMock(), pred_context)
    assert "CPU usage is rising" in explanation
    assert "breach the threshold of 90.0%" in explanation
    assert "12.5 minutes" in explanation

# --- Test Incident Correlator ---
def test_correlator_grouping(mock_db_cursor):
    correlator = IncidentCorrelator()
    
    # Mock other anomalies in the 2-minute window: one for service-2
    detected_at = datetime.now(timezone.utc)
    other_anoms = [{"service_id": "service-2", "metric_type": "memory", "detected_at": detected_at}]
    
    # Mock SQL execution return values
    # First query (fetch other anomalies): returns service-2 anomaly
    # Second query (fetch active incidents): returns empty (no active incidents)
    # Third query (timeline of all services): returns timeline rows
    # Fourth query (insert incident): returns new incident
    mock_db_cursor.fetchall.side_effect = [
        other_anoms, # other anomalies query
        [],          # active incidents query
        [            # timeline query (oldest first)
            {"service_id": "service-2", "detected_at": detected_at - timedelta(seconds=10)},
            {"service_id": "service-1", "detected_at": detected_at}
        ],
        [{"id": "service-1", "name": "Service One"}, {"id": "service-2", "name": "Service Two"}] # service names query
    ]
    mock_db_cursor.fetchone.return_value = {
        "id": "inc-123",
        "root_cause_service_id": "service-2",
        "affected_service_ids": ["service-1"],
        "started_at": detected_at - timedelta(seconds=10),
        "summary": "Grouped incident: Service Two degraded..."
    }
    
    with patch("ml.correlator.get_db_cursor") as mock_ctx:
        mock_ctx.return_value.__enter__.return_value = mock_db_cursor
        inc = correlator.correlate_anomaly("service-1", "cpu", detected_at)
        assert inc is not None
        assert inc["root_cause_service_id"] == "service-2"

# --- Global Fixture for Mock DB ---
@pytest.fixture
def mock_db_cursor():
    cursor = MagicMock()
    return cursor

if __name__ == "__main__":
    import asyncio
    print("Running ML system tests...")
    
    # 1. Test Z-Score
    print("Running test_zscore_detector_push_and_get...")
    asyncio.run(test_zscore_detector_push_and_get())
    print("Running test_zscore_detector_timestamped_window...")
    asyncio.run(test_zscore_detector_timestamped_window())
    
    # 2. Test Forecaster
    print("Running test_forecaster_no_breach...")
    test_forecaster_no_breach()
    print("Running test_forecaster_with_breach...")
    test_forecaster_with_breach()
    
    # 3. Test Explainer
    print("Running test_explainer_normal_anomaly...")
    test_explainer_normal_anomaly()
    print("Running test_explainer_predictive_alert...")
    test_explainer_predictive_alert()
    
    # 4. Test Correlator
    print("Running test_correlator_grouping...")
    cursor = MagicMock()
    test_correlator_grouping(cursor)
    
    print("\nALL TESTS PASSED SUCCESSFULLY!")

