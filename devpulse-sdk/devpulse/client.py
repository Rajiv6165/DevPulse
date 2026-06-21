import atexit
import datetime
import logging
import queue
import threading
import time
from typing import Any, Dict, Optional, Callable
import requests

from devpulse.exceptions import DevPulseConfigError

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
        base_url: str = "https://your-devpulse.com",
        flush_interval: float = 5.0,
        max_buffer_size: int = 50,
        debug: bool = False
    ):
        """
        Initialize the DevPulse SDK client.

        :param api_key: Service API key for authentication header.
        :param service_id: The UUID representing the monitored service.
        :param base_url: DevPulse dashboard API server host URL.
        :param flush_interval: Maximum interval in seconds between background flushes.
        :param max_buffer_size: Maximum batch size before triggering immediate flush.
        :param debug: If True, logs metrics activities using Python's standard logger.
        """
        if not api_key:
            raise DevPulseConfigError("DevPulseClient configuration error: api_key is required.")
        if not service_id:
            raise DevPulseConfigError("DevPulseClient configuration error: service_id is required.")

        self.api_key = api_key
        self.service_id = service_id
        self.base_url = base_url.rstrip("/")
        self.flush_interval = flush_interval
        self.max_buffer_size = max_buffer_size
        self.debug = debug
        
        self.queue = queue.Queue()
        self.lock = threading.Lock()
        self.shutdown_triggered = False
        self.server_unreachable = False
        
        # Start the background worker thread
        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()
        
        # Register shutdown handler for clean exit flushing
        atexit.register(self.shutdown)
        
        # Set this instance as default if none exists yet
        if get_default_client() is None:
            set_default_client(self)

    def health_check(self) -> bool:
        """Pings the DevPulse backend /health endpoint to check reachability."""
        try:
            url = f"{self.base_url}/health"
            response = requests.get(url, timeout=3.0)
            return response.status_code == 200
        except Exception:
            return False

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
        try:
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
            
            if self.debug:
                logger.info("Queued metric: %s", metric_payload)
            
            with self.lock:
                # Local capacity hard cap: drop oldest item if queue has 500+ items
                if self.queue.qsize() >= 500:
                    try:
                        self.queue.get_nowait()
                    except queue.Empty:
                        pass
                
                if not self.shutdown_triggered:
                    self.queue.put(metric_payload)
        except Exception as e:
            # Outage/network issues must never crash or raise in host app code paths
            logger.warning("Error pushing metric to DevPulse queue: %s", e)

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
    def track_block(self, name: str, metadata: Optional[Dict[str, Any]] = None):
        """
        Context manager that tracks code execution time and reports it as a custom metric.
        
        Example:
            with dp.track_block("database_query"):
                # run DB operations
        """
        from devpulse.context_managers import TrackBlock
        return TrackBlock(self, name, metadata)

    # Instance Decorators (binds decorators to this client instance)
    def track_request(self, func: Callable) -> Callable:
        """
        Decorator that auto-tracks a function call's execution duration and error rate.
        Supports both synchronous and asynchronous functions.
        """
        import inspect
        from functools import wraps

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
        Monitors queue and flushes on max buffer size or max elapsed time.
        """
        last_flush = time.time()
        
        while not self.shutdown_triggered:
            try:
                time.sleep(0.1)
                now = time.time()
                
                # Check if we need to flush
                qsize = self.queue.qsize()
                if qsize >= self.max_buffer_size or (now - last_flush >= self.flush_interval and qsize > 0):
                    # Gather batch
                    batch = []
                    for _ in range(min(qsize, self.max_buffer_size)):
                        try:
                            batch.append(self.queue.get_nowait())
                        except queue.Empty:
                            break
                    
                    if batch:
                        self._send_batch(batch)
                        last_flush = time.time()
                        
            except Exception as e:
                logger.warning("Error in DevPulse background worker thread: %s", e)

    def _send_batch(self, batch: list) -> None:
        """Send a batch of metrics to the DevPulse server with exponential retry backoff."""
        if not batch:
            return

        if self.debug:
            logger.info("Sending batch of %d metrics", len(batch))

        url = f"{self.base_url}/metrics/ingest"
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key
        }
        
        session = requests.Session()
        for metric in batch:
            success = False
            for attempt in range(3):
                backoff_time = 2 ** attempt  # 1s, 2s, 4s
                try:
                    response = session.post(url, json=metric, headers=headers, timeout=5.0)
                    if response.status_code in (200, 201):
                        success = True
                        if self.server_unreachable:
                            logger.info("DevPulse server is reachable again.")
                            self.server_unreachable = False
                        break
                    else:
                        logger.warning(
                            "DevPulse failed to record metric: Server returned status %d. Response: %s",
                            response.status_code, response.text
                        )
                except requests.exceptions.RequestException as e:
                    if not self.server_unreachable:
                        logger.warning("DevPulse server is unreachable. Metrics will be buffered locally. Error: %s", e)
                        self.server_unreachable = True
                
                # Wait before retrying (unless it's the last attempt)
                if attempt < 2:
                    time.sleep(backoff_time)
            
            # If the metric failed after 3 attempts, put it and the remaining ones back into the queue
            if not success:
                with self.lock:
                    failed_idx = batch.index(metric)
                    for m in reversed(batch[failed_idx:]):
                        if self.queue.qsize() < 500:
                            self.queue.put(m)
                break

    def flush(self) -> None:
        """Manually force-send all buffered metrics immediately."""
        buffer = []
        while not self.queue.empty():
            try:
                buffer.append(self.queue.get_nowait())
            except queue.Empty:
                break
        
        if buffer:
            self._send_batch(buffer)

    def shutdown(self) -> None:
        """Triggered on atexit shutdown. Drains remaining queue items and flushes them."""
        with self.lock:
            if self.shutdown_triggered:
                return
            self.shutdown_triggered = True
            
        self.flush()
        
        # Gracefully shut down worker thread
        try:
            self.worker_thread.join(timeout=2.0)
        except Exception:
            pass
