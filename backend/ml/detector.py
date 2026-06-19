from typing import Optional, Dict, Any
from pydantic import BaseModel
from ml.zscore import ZScoreDetector
from ml.isolation_forest import IsolationForestDetector

class AnomalyResult(BaseModel):
    is_anomaly: bool
    score: float
    method: str
    severity: str  # "low" | "medium" | "critical"
    metadata: Dict[str, Any] = {}

class AnomalyDetector:
    """Coordinates real-time Z-score checking and trained Isolation Forest model scoring."""
    
    def __init__(self):
        self.zscore_detector = ZScoreDetector()
        self.iforest_detector = IsolationForestDetector()

    def _get_severity(self, score: float) -> str:
        """Maps an anomaly score to a severity category."""
        if score > 4.5:
            return "critical"
        elif score > 3.5:
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
        Runs Z-score calculations and queries Isolation Forest models.
        Returns an AnomalyResult detailing if the reading is anomalous.
        """
        service_id_str = str(service_id)
        
        # 1. Real-time Z-score calculation (also updates rolling window in Redis)
        z_score, rolling_mean, rolling_std = await self.zscore_detector.score(
            service_id_str, metric_type, value
        )
        
        # 2. Check if a pre-trained Isolation Forest model is available for batch scoring
        is_if_anomaly, if_score = await self.iforest_detector.score(
            service_id_str, metric_type, value
        )
        
        # 3. Determine primary decision method
        # If Isolation Forest was successfully loaded, use it as primary. Else fallback to Z-score.
        if if_score > 0.0:
            is_anomaly = is_if_anomaly
            score = if_score
            method = "isolation_forest"
        else:
            is_anomaly = z_score > 2.5
            score = z_score
            method = "zscore"

        severity = self._get_severity(score) if is_anomaly else "low"
        
        metadata = {
            "rolling_mean": rolling_mean,
            "rolling_std": rolling_std,
            "z_score": z_score,
            "iforest_score": if_score if if_score > 0.0 else None
        }
        
        return AnomalyResult(
            is_anomaly=is_anomaly,
            score=score,
            method=method,
            severity=severity,
            metadata=metadata
        )
