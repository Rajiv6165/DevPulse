import math
from typing import List, Tuple
from core.redis import async_redis_client

class ZScoreDetector:
    """Calculates rolling Z-scores using a sliding window of size 100 stored in Redis."""
    
    async def push_and_get_window(self, service_id: str, metric_type: str, value: float) -> List[float]:
        """Pushes a new value to the Redis list and returns the entire active window."""
        key = f"devpulse:window:{service_id}:{metric_type}"
        
        # Push value and trim list to hold the latest 100 items
        await async_redis_client.lpush(key, str(value))
        await async_redis_client.ltrim(key, 0, 99)
        
        # Retrieve all values currently in the window
        history_strings = await async_redis_client.lrange(key, 0, -1)
        return [float(val) for val in history_strings]

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
