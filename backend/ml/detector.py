from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from pydantic import BaseModel
from ml.zscore import ZScoreDetector
from ml.isolation_forest import IsolationForestDetector
from core.redis import async_redis_client

class AnomalyResult(BaseModel):
    is_anomaly: bool
    confidence: float  # 0 to 1
    severity: str  # "low" | "medium" | "critical"
    contributing_methods: List[str]
    explanation: str
    metadata: Dict[str, Any] = {}

class AnomalyDetector:
    """Coordinates ensemble anomaly detection: rolling z-score, seasonal time-of-day, and Isolation Forest."""
    
    def __init__(self):
        self.zscore_detector = ZScoreDetector()
        self.iforest_detector = IsolationForestDetector()

    def _get_severity(self, confidence: float) -> str:
        """Maps confidence to severity level."""
        if confidence > 0.85:
            return "critical"
        elif confidence > 0.65:
            return "medium"
        else:
            return "low"

    async def detect(
        self, 
        service_id: str, 
        metric_type: str, 
        value: float, 
        history: Optional[list] = None
    ) -> AnomalyResult:
        """
        Runs three detection methods, computes weighted confidence, and updates seasonal baseline.
        Suppresses alerts if flagged in the last 3 minutes.
        """
        service_id_str = str(service_id)
        
        # 1. Z-score (also updates rolling window in Redis)
        z_score, rolling_mean, rolling_std = await self.zscore_detector.score(
            service_id_str, metric_type, value
        )
        zscore_score = min(1.0, z_score / 4.0)

        # 2. Isolation Forest score
        is_if_anomaly, if_score = await self.iforest_detector.score(
            service_id_str, metric_type, value
        )
        # Scale iforest score (default range is up to 6.0) to 0.0 - 1.0. Fallback to zscore if no model.
        if if_score > 0.0:
            iforest_score = min(1.0, if_score / 5.0)
        else:
            iforest_score = zscore_score

        # 3. Seasonal deviation (decompose into hourly averages)
        hour_of_day = datetime.now(timezone.utc).hour
        seasonal_key = f"devpulse:seasonal:{service_id_str}:{metric_type}:{hour_of_day}"
        
        # Retrieve old hourly average
        try:
            old_seasonal = await async_redis_client.get(seasonal_key)
            if old_seasonal is not None:
                expected_val = float(old_seasonal)
            else:
                expected_val = value
        except Exception as e:
            print(f"[Detector] Redis error reading seasonal baseline: {e}")
            expected_val = value

        # Update hourly average incrementally using Exponential Moving Average (EMA, alpha = 0.1)
        new_seasonal = (0.1 * value) + (0.9 * expected_val)
        try:
            await async_redis_client.set(seasonal_key, str(new_seasonal))
        except Exception as e:
            print(f"[Detector] Redis error saving seasonal baseline: {e}")

        # Compute seasonal score
        seasonal_diff = abs(value - expected_val)
        if rolling_std > 1e-6:
            seasonal_z = seasonal_diff / rolling_std
            seasonal_score = min(1.0, seasonal_z / 4.0)
        else:
            seasonal_score = min(1.0, seasonal_diff / (expected_val + 1e-5))

        # Calculate final confidence
        confidence = (0.3 * zscore_score) + (0.4 * iforest_score) + (0.3 * seasonal_score)
        confidence = max(0.0, min(1.0, confidence))

        is_anomaly = confidence >= 0.5
        severity = self._get_severity(confidence)

        # Track contributing methods
        contributing_methods = []
        if zscore_score >= 0.5:
            contributing_methods.append("zscore")
        if iforest_score >= 0.5:
            contributing_methods.append("isolation_forest")
        if seasonal_score >= 0.5:
            contributing_methods.append("seasonal")

        # Collect detailed metadata
        metadata = {
            "rolling_mean": rolling_mean,
            "rolling_std": rolling_std,
            "z_score": z_score,
            "iforest_score": if_score if if_score > 0.0 else None,
            "seasonal_mean": expected_val,
            "zscore_score": zscore_score,
            "iforest_score_scaled": iforest_score,
            "seasonal_score": seasonal_score,
            "suppressed": False
        }

        # 4. Dedup logic (suppress if flagged in the last 3 minutes)
        if is_anomaly:
            dedup_key = f"devpulse:dedup:{service_id_str}:{metric_type}"
            try:
                already_flagged = await async_redis_client.get(dedup_key)
                if already_flagged:
                    is_anomaly = False
                    metadata["suppressed"] = True
                else:
                    # Set 3 minutes (180s) cooldown
                    await async_redis_client.set(dedup_key, "1", ex=180)
            except Exception as e:
                print(f"[Detector] Redis error during deduplication: {e}")

        # Build clean explanation using explainer
        from ml.explainer import Explainer
        explanation = Explainer.generate_explanation(metric_type, value, self, metadata)

        # Build final AnomalyResult
        return AnomalyResult(
            is_anomaly=is_anomaly,
            confidence=confidence,
            severity=severity,
            contributing_methods=contributing_methods,
            explanation=explanation,
            metadata=metadata
        )

