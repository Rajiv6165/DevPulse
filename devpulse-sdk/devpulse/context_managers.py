import time
from typing import Any, Dict, Optional

class TrackBlock:
    """
    Context manager that measures execution duration for any code block 
    and sends the telemetry metric to DevPulse upon completion.
    """
    def __init__(self, client: Any, name: str, metadata: Optional[Dict[str, Any]] = None):
        self.client = client
        self.name = name
        self.metadata = metadata or {}
        self.start_time = 0.0

    def __enter__(self):
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (time.perf_counter() - self.start_time) * 1000.0
        meta = dict(self.metadata)
        if exc_type is not None:
            meta["exception_type"] = exc_type.__name__
            meta["exception_message"] = str(exc_val)
            self.client.push_error_rate(100.0, meta)
            
        self.client.push_custom(self.name, duration_ms, meta)
        # Return False to re-raise exception in the host app (never swallow)
        return False
