import atexit
import datetime
import logging
import queue
import threading
import time
from contextlib import contextmanager
from functools import wraps
from typing import Any, Dict, Optional, Callable
import requests

# Logger configuration
logger = logging.getLogger("devpulse")

# Global reference for default client instance
_default_client: Optional['DevPulseClient'] = None
_default_client_lock = threading.Lock()


def get_default_client() -> Optional['DevPulseClient']:
    """Get the default initialized DevPulseClient instance."""
    global _default_client
    return _default_client


def set_default_client(client: 'DevPulseClient') -> None:
    """Set the default DevPulseClient instance."""
    global _default_client
    with _default_client_lock:
        _default_client = client


class DevPulseClient:
    """
    Main DevPulse Client for observing and tracking application metrics.
    Buffers metrics and flushes them asynchronously in a background thread.
    """

    def __init__(
        self,
        api_key: str,
        service_id: str,
        base_url: str = "https://your-devpulse.com"
    ):
        """
        Initialize the DevPulse SDK client.

        :param api_key: Service API key for authentication header.
        :param service_id: The UUID representing the monitored service.
        :param base_url: DevPulse dashboard API server host URL.
        """
        self.api_key = api_key
        self.service_id = service_id
        self.base_url = base_url.rstrip("/")
        
        self.queue = queue.Queue()
        self.lock = threading.Lock()
        self.shutdown_triggered = False
        
        # Start the background worker thread
        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()
        
        # Register shutdown handler for clean exit flushing
        atexit.register(self.shutdown)
        
        # Set this instance as default if none exists yet
        if get_default_client() is None:
            set_default_client(self)

    def push_metric(
        self,
        metric_type: str,
        value: float,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Core telemetry pushing function. Places metric onto the queue
        for dynamic background processing. Fire-and-forget.
        """
        if metadata is None:
            metadata = {}
            
        # Standard schema payload formatting
        metric_payload = {
            "service_id": self.service_id,
            "metric_type": metric_type,
            "value": float(value),
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "metadata": metadata
        }
        
        with self.lock:
            if not self.shutdown_triggered:
                self.queue.put(metric_payload)

    # Shorthand methods
    def push_cpu(self, value: float, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Shorthand to push CPU usage metrics."""
        self.push_metric("cpu", value, metadata)

    def push_memory(self, value: float, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Shorthand to push memory usage metrics."""
        self.push_metric("memory", value, metadata)

    def push_error_rate(self, value: float, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Shorthand to push error rate metrics (0.0 to 100.0)."""
        self.push_metric("error_rate", value, metadata)

    def push_response_time(self, ms: float, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Shorthand to push latency response time in milliseconds."""
        self.push_metric("response_time", ms, metadata)

    def push_custom(self, name: str, value: float, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Shorthand to push custom metric types, indexing the custom key in metadata."""
        meta = {"custom_metric_name": name}
        if metadata:
            meta.update(metadata)
        self.push_metric("custom", value, meta)

    # Context Manager
    @contextmanager
    def track_block(self, name: str, metadata: Optional[Dict[str, Any]] = None):
        """
        Context manager that tracks code execution time and reports it as a custom metric.
        
        Example:
            with dp.track_block("database_query"):
                # run DB operations
        """
        start_time = time.perf_counter()
        try:
            yield
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            self.push_custom(name, duration_ms, metadata)

    # Instance Decorators (binds decorators to this client instance)
    def track_request(self, func: Callable) -> Callable:
        """
        Decorator that auto-tracks a function call's execution duration and error rate.
        Supports both synchronous and asynchronous functions.
        """
        import inspect

        if inspect.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                start_time = time.perf_counter()
                error_occurred = False
                try:
                    return await func(*args, **kwargs)
                except Exception:
                    error_occurred = True
                    raise
                finally:
                    duration_ms = (time.perf_counter() - start_time) * 1000.0
                    self.push_response_time(duration_ms, {"function": func.__name__})
                    self.push_error_rate(100.0 if error_occurred else 0.0, {"function": func.__name__})
            return async_wrapper
        else:
            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                start_time = time.perf_counter()
                error_occurred = False
                try:
                    return func(*args, **kwargs)
                except Exception:
                    error_occurred = True
                    raise
                finally:
                    duration_ms = (time.perf_counter() - start_time) * 1000.0
                    self.push_response_time(duration_ms, {"function": func.__name__})
                    self.push_error_rate(100.0 if error_occurred else 0.0, {"function": func.__name__})
            return sync_wrapper

    def track_function(self, func: Optional[Callable] = None) -> Callable:
        """Decorator mapping for track_function. Delegating decorator helper."""
        from devpulse.decorators import track_function
        if func is None:
            return lambda f: track_function(f, client=self)
        return track_function(func, client=self)

    def track_endpoint(self, func: Optional[Callable] = None) -> Callable:
        """Decorator mapping for track_endpoint. Delegating decorator helper."""
        from devpulse.decorators import track_endpoint
        if func is None:
            return lambda f: track_endpoint(f, client=self)
        return track_endpoint(func, client=self)

    # Background Worker Logic
    def _worker(self) -> None:
        """
        Background worker running inside a daemon thread.
        Monitors queue and flushes on max buffer size (50) or max elapsed time (5s).
        """
        buffer = []
        last_flush = time.time()
        
        while not self.shutdown_triggered:
            try:
                # 1. Block on queue to get the first item of a batch
                if not buffer:
                    try:
                        # Periodic 1.0s timeout to allow check of shutdown_triggered
                        item = self.queue.get(timeout=1.0)
                        buffer.append(item)
                        self.queue.task_done()
                        last_flush = time.time()
                    except queue.Empty:
                        continue
                
                # 2. Collect remaining available items non-blockingly up to limit of 50
                while len(buffer) < 50:
                    try:
                        item = self.queue.get_nowait()
                        buffer.append(item)
                        self.queue.task_done()
                    except queue.Empty:
                        break
                
                # 3. Flush if buffer limit reached or time limit expired
                now = time.time()
                if len(buffer) >= 50 or (now - last_flush >= 5.0):
                    self._send_batch(buffer)
                    buffer = []
                    last_flush = time.time()
                    
            except Exception as e:
                logger.warning("Error in DevPulse background worker thread: %s", e)

    def _send_batch(self, batch: list) -> None:
        """Send a batch of metrics to the DevPulse server, catching any connection errors."""
        url = f"{self.base_url}/metrics/ingest"
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key
        }
        
        session = requests.Session()
        for metric in batch:
            try:
                response = session.post(url, json=metric, headers=headers, timeout=5.0)
                if response.status_code not in (200, 201):
                    logger.warning(
                        "DevPulse failed to record metric: Server returned status %d. Response: %s",
                        response.status_code, response.text
                    )
            except requests.exceptions.RequestException as e:
                logger.warning("DevPulse server connection error. Failed to send metric: %s", e)

    def shutdown(self) -> None:
        """Triggered on atexit shutdown. Drains remaining queue items and flushes them."""
        with self.lock:
            if self.shutdown_triggered:
                return
            self.shutdown_triggered = True
            
        # Drain all remaining elements in the queue
        buffer = []
        while True:
            try:
                item = self.queue.get_nowait()
                buffer.append(item)
                self.queue.task_done()
            except queue.Empty:
                break
                
        if buffer:
            self._send_batch(buffer)
            
        # Gracefully shut down worker thread
        try:
            self.worker_thread.join(timeout=2.0)
        except Exception:
            pass
