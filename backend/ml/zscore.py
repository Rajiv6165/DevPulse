import math
import json
import time
from typing import List, Tuple, Dict, Any
from core.redis import async_redis_client

class ZScoreDetector:
    """Calculates rolling Z-scores using a sliding window of size 100 stored in Redis."""
    
    async def push_and_get_window(self, service_id: str, metric_type: str, value: float) -> List[float]:
        """Pushes a new value to the Redis list and returns the entire active window."""
        key = f"devpulse:window:{service_id}:{metric_type}"
        
        # Push value with timestamp and trim list to hold the latest 100 items
        payload = json.dumps({"t": time.time(), "v": value})
        await async_redis_client.lpush(key, payload)
        await async_redis_client.ltrim(key, 0, 99)
        
        # Retrieve all values currently in the window
        history_strings = await async_redis_client.lrange(key, 0, -1)
        values = []
        for val_str in history_strings:
            try:
                data = json.loads(val_str)
                values.append(float(data["v"]))
            except (json.JSONDecodeError, TypeError, KeyError):
                # Fallback for old plain float strings in Redis
                try:
                    values.append(float(val_str))
                except ValueError:
                    pass
        return values

    async def get_timestamped_window(self, service_id: str, metric_type: str) -> List[Dict[str, Any]]:
        """
        Retrieves the window of metric entries, returning a list of dicts with t (timestamp) and v (value).
        Returns them sorted chronologically (oldest first).
        """
        key = f"devpulse:window:{service_id}:{metric_type}"
        history_strings = await async_redis_client.lrange(key, 0, -1)
        
        results = []
        now_t = time.time()
        for i, val_str in enumerate(history_strings):
            try:
                data = json.loads(val_str)
                results.append({"t": float(data["t"]), "v": float(data["v"])})
            except (json.JSONDecodeError, TypeError, KeyError):
                # Fallback: mock timestamps (e.g. 10s intervals)
                try:
                    results.append({"t": now_t - (i * 10.0), "v": float(val_str)})
                except ValueError:
                    pass
        results.reverse()
        return results

    def calculate_stats(self, values: List[float]) -> Tuple[float, float]:
        """Computes the mean and standard deviation for a set of values."""
        if not values:
            return 0.0, 0.0
            
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        std_dev = math.sqrt(variance)
        return mean, std_dev

    async def score(self, service_id: str, metric_type: str, value: float) -> Tuple[float, float, float]:
        """
        Ingests a value, updates the sliding window in Redis, and scores the current reading.
        Returns a tuple of (z_score, rolling_mean, rolling_std).
        """
        values = await self.push_and_get_window(service_id, metric_type, value)
        
        # Require at least 5 historical values to prevent early false positives
        if len(values) < 5:
            return 0.0, value, 0.0
            
        mean, std_dev = self.calculate_stats(values)
        if std_dev < 1e-6:
            return 0.0, mean, std_dev
            
        z_score = abs(value - mean) / std_dev
        return z_score, mean, std_dev

