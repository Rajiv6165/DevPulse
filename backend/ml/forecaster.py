from typing import Any

# Configurable thresholds for standard metrics
DEFAULT_THRESHOLDS = {
    "cpu": 90.0,
    "memory": 90.0,
    "error_rate": 5.0,
    "response_time": 2000.0,
}

class Forecaster:
    """Performs short-horizon linear forecasting and predicts threshold breaches."""

    def __init__(self, thresholds: dict[str, float] | None = None):
        self.thresholds = thresholds or DEFAULT_THRESHOLDS

    def _fit_linear_regression(self, history: list[dict[str, float]]) -> tuple[float, float]:
        """Fits a linear regression model (y = mx + c) and returns (slope, intercept)."""
        n = len(history)
        if n < 2:
            return 0.0, history[0]["v"] if history else 0.0

        sum_x = sum(d["t"] for d in history)
        sum_y = sum(d["v"] for d in history)
        sum_xx = sum(d["t"] ** 2 for d in history)
        sum_xy = sum(d["t"] * d["v"] for d in history)

        denominator = (n * sum_xx) - (sum_x ** 2)
        if abs(denominator) < 1e-9:
            # Parallel or vertical line, slope is zero
            return 0.0, sum_y / n

        slope = ((n * sum_xy) - (sum_x * sum_y)) / denominator
        intercept = (sum_y - (slope * sum_x)) / n
        return slope, intercept

    def forecast(self, metric_type: str, history: list[dict[str, Any]]) -> dict[str, Any]:
        """
        Forecasts 5 and 15 minutes ahead.
        Checks if the forecasted value will breach the threshold.
        """
        # Ensure we have at least 5 points to fit a linear trend line
        if len(history) < 5:
            return {
                "breached": False,
                "predicted_value_15m": history[-1]["v"] if history else 0.0,
                "predicted_breach_in_minutes": None
            }

        # Fit model
        slope, intercept = self._fit_linear_regression(history)
        
        # Determine the reference current time
        current_entry = history[-1]
        current_time = current_entry["t"]
        current_value = current_entry["v"]

        t_5 = current_time + (5.0 * 60.0)
        t_15 = current_time + (15.0 * 60.0)

        pred_5 = (slope * t_5) + intercept
        pred_15 = (slope * t_15) + intercept

        threshold = self.thresholds.get(metric_type)
        # Breach check: if current value is below threshold and slope is rising towards it
        if threshold is not None and current_value < threshold and slope > 0.0:
            # Find exact time of breach: threshold = slope * t_breach + intercept
            t_breach = (threshold - intercept) / slope
            time_to_breach_sec = t_breach - current_time

            # If breach is predicted to happen within 15 minutes (900 seconds)
            if 0.0 < time_to_breach_sec <= 15.0 * 60.0:
                predicted_breach_in_minutes = time_to_breach_sec / 60.0
                return {
                    "breached": True,
                    "threshold": threshold,
                    "predicted_breach_in_minutes": round(predicted_breach_in_minutes, 1),
                    "predicted_value_5m": pred_5,
                    "predicted_value_15m": pred_15,
                    "slope": slope,
                    "intercept": intercept
                }

        return {
            "breached": False,
            "predicted_value_5m": pred_5,
            "predicted_value_15m": pred_15,
            "predicted_breach_in_minutes": None,
            "slope": slope,
            "intercept": intercept
        }
