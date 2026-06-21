from typing import Any, Dict

class Explainer:
    """Generates plain-English explanations for anomalies and predictive alerts."""

    @staticmethod
    def generate_explanation(
        metric_type: str, 
        value: float, 
        anomaly_result: Any,
        predictive_context: Dict[str, Any] = None
    ) -> str:
        """
        Builds a deterministic, readable summary explaining why a value is flagged,
        based on active models, seasonal averages, and trend vectors.
        """
        metric_name = {
            "cpu": "CPU usage",
            "memory": "Memory usage",
            "error_rate": "Error rate",
            "response_time": "Response time",
        }.get(metric_type, metric_type.replace("_", " ").capitalize())

        unit = {
            "cpu": "%",
            "memory": "%",
            "error_rate": "%",
            "response_time": "ms",
        }.get(metric_type, "")

        # 1. Check if it's a predictive alert
        if predictive_context and predictive_context.get("breached"):
            threshold = predictive_context.get("threshold", 0.0)
            minutes = predictive_context.get("predicted_breach_in_minutes", 0.0)
            slope = predictive_context.get("slope", 0.0)
            return (
                f"{metric_name} is rising at a rate of {slope*60:.2f}{unit}/min. "
                f"It is predicted to breach the threshold of {threshold}{unit} in approximately "
                f"{minutes:.1f} minutes if current trajectory continues."
            )

        # 2. Otherwise, construct standard anomaly explanation
        metadata = getattr(anomaly_result, "metadata", {}) or {}
        contributing_methods = getattr(anomaly_result, "contributing_methods", []) or []

        rolling_mean = metadata.get("rolling_mean")
        seasonal_mean = metadata.get("seasonal_mean")

        # Seasonal comparison first (most meaningful to users)
        if seasonal_mean is not None and seasonal_mean > 0.0:
            ratio = value / seasonal_mean
            if ratio >= 1.0:
                deviation_str = f"which is {ratio:.1f}x higher than the typical {seasonal_mean:.1f}{unit} seen at this hour."
            else:
                inv_ratio = 1.0 / ratio if ratio > 0 else 1.0
                deviation_str = f"which is {inv_ratio:.1f}x lower than the typical {seasonal_mean:.1f}{unit} seen at this hour."
        elif rolling_mean is not None and rolling_mean > 0.0:
            ratio = value / rolling_mean
            if ratio >= 1.0:
                deviation_str = f"which is {ratio:.1f}x higher than the rolling average of {rolling_mean:.1f}{unit}."
            else:
                inv_ratio = 1.0 / ratio if ratio > 0 else 1.0
                deviation_str = f"which is {inv_ratio:.1f}x lower than the rolling average of {rolling_mean:.1f}{unit}."
        else:
            deviation_str = "which represents an unusual outlying value."

        # Add context from contributing methods
        method_desc = "This pattern matches a sudden load spike rather than gradual growth."
        if "isolation_forest" in contributing_methods and "zscore" not in contributing_methods:
            method_desc = "This pattern represents a rare, multi-variate anomaly detected by the Isolation Forest baseline."
        elif "seasonal" in contributing_methods and "zscore" not in contributing_methods:
            method_desc = "This pattern indicates a deviation from expected seasonal time-of-day averages."
        elif len(contributing_methods) > 1:
            methods_joined = " and ".join(contributing_methods)
            method_desc = f"This anomaly was confirmed by both the {methods_joined} models."

        return f"{metric_name} hit {value:.1f}{unit}, {deviation_str} {method_desc}"
