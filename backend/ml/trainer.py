import base64
import pickle

from core.database import get_db_cursor
from core.redis import async_redis_client

try:
    import numpy as np
    from sklearn.ensemble import IsolationForest
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

async def train_service_metric_model(service_id: str, metric_type: str):
    """Trains an Isolation Forest model for a specific service and metric type."""
    if not SKLEARN_AVAILABLE:
        print(f"[Trainer] Skipping model training for service {service_id} (scikit-learn not available)")
        return
        
    print(f"[Trainer] Starting model training for service {service_id}, metric: {metric_type}")
    
    # 1. Fetch the last 24 hours of metric values from Supabase
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT value FROM metrics "
            "WHERE service_id = %s AND metric_type = %s AND timestamp >= NOW() - INTERVAL '24 hours' "
            "ORDER BY timestamp ASC",
            (service_id, metric_type)
        )
        rows = cur.fetchall()
        
    values = [float(row["value"]) for row in rows]
    
    # Require a minimum of 10 points to establish a training baseline
    if len(values) < 10:
        print(f"[Trainer] Not enough data points ({len(values)}/10) to train Isolation Forest for {service_id}:{metric_type}")
        return

    try:
        # 2. Reshape values into 2D array and fit Isolation Forest
        X = np.array(values).reshape(-1, 1)
        model = IsolationForest(contamination=0.05, n_estimators=100, random_state=42)
        model.fit(X)
        
        # 3. Serialize model
        serialized = pickle.dumps(model)
        encoded_str = base64.b64encode(serialized).decode("utf-8")
        
        # 4. Save to Redis
        key = f"devpulse:model:{service_id}:{metric_type}"
        await async_redis_client.set(key, encoded_str)
        print(f"[Trainer] Successfully trained and saved Isolation Forest model for {service_id}:{metric_type} (trained on {len(values)} values)")
    except Exception as e:
        print(f"[Trainer] Failed to train model for {service_id}:{metric_type}: {e}")

async def retrain_all_models():
    """Batch job designed to retrain models for all active monitored services."""
    if not SKLEARN_AVAILABLE:
        print("[Trainer] scikit-learn is not available. Retraining job skipped.")
        return

    print("[Trainer] Running batch retraining job for Isolation Forest...")
    
    # Fetch all active services
    with get_db_cursor() as cur:
        cur.execute("SELECT id FROM services WHERE is_active = TRUE")
        services = cur.fetchall()
        
    if not services:
        print("[Trainer] No active services found for retraining.")
        return
        
    # We retrain for standard metric types
    metric_types = ["cpu", "memory", "error_rate", "response_time", "custom"]
    
    for service in services:
        service_id = str(service["id"])
        for m_type in metric_types:
            await train_service_metric_model(service_id, m_type)
            
    print("[Trainer] Batch retraining job completed.")
