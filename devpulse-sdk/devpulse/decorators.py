import inspect
import time
from functools import wraps
from typing import Any, Callable, Optional
from devpulse.client import get_default_client


def track_function(func: Optional[Callable] = None, *, client: Optional[Any] = None) -> Callable:
    """
    Decorator to wrap any function and track execution time, success/failure rate, and call count.
    Supports both synchronous and asynchronous functions.

    Usage:
        @track_function
        def process_payment():
            ...

        @track_function(client=custom_client)
        async def process_order():
            ...
    """
    def decorator(f: Callable) -> Callable:
        if inspect.iscoroutinefunction(f):
            @wraps(f)
            async def async_wrapper(*args, **kwargs):
                active_client = client or get_default_client()
                if not active_client:
                    return await f(*args, **kwargs)

                # Track function call count
                active_client.push_custom(f"{f.__name__}_calls", 1.0, {"function": f.__name__})

                start_time = time.perf_counter()
                error_occurred = False
                try:
                    return await f(*args, **kwargs)
                except Exception:
                    error_occurred = True
                    raise
                finally:
                    duration_ms = (time.perf_counter() - start_time) * 1000.0
                    meta = {"function": f.__name__}
                    active_client.push_response_time(duration_ms, meta)
                    active_client.push_error_rate(100.0 if error_occurred else 0.0, meta)
            return async_wrapper
        else:
            @wraps(f)
            def sync_wrapper(*args, **kwargs):
                active_client = client or get_default_client()
                if not active_client:
                    return f(*args, **kwargs)

                # Track function call count
                active_client.push_custom(f"{f.__name__}_calls", 1.0, {"function": f.__name__})

                start_time = time.perf_counter()
                error_occurred = False
                try:
                    return f(*args, **kwargs)
                except Exception:
                    error_occurred = True
                    raise
                finally:
                    duration_ms = (time.perf_counter() - start_time) * 1000.0
                    meta = {"function": f.__name__}
                    active_client.push_response_time(duration_ms, meta)
                    active_client.push_error_rate(100.0 if error_occurred else 0.0, meta)
            return sync_wrapper

    if func is None:
        return decorator
    return decorator(func)


def track_endpoint(func: Optional[Callable] = None, *, client: Optional[Any] = None) -> Callable:
    """
    Decorator for route handlers (e.g. FastAPI) to track latency and response status codes.
    Supports both synchronous and asynchronous endpoints.

    Usage:
        @app.get("/items")
        @track_endpoint
        def read_items():
            ...
    """
    def decorator(f: Callable) -> Callable:
        if inspect.iscoroutinefunction(f):
            @wraps(f)
            async def async_wrapper(*args, **kwargs):
                active_client = client or get_default_client()
                if not active_client:
                    return await f(*args, **kwargs)

                start_time = time.perf_counter()
                status_code = 200
                try:
                    response = await f(*args, **kwargs)
                    if hasattr(response, "status_code"):
                        status_code = response.status_code
                    return response
                except Exception as e:
                    if hasattr(e, "status_code"):
                        status_code = e.status_code
                    else:
                        status_code = 500
                    raise e
                finally:
                    duration_ms = (time.perf_counter() - start_time) * 1000.0
                    meta = {"endpoint": f.__name__, "status_code": status_code}
                    active_client.push_response_time(duration_ms, meta)
                    active_client.push_error_rate(100.0 if status_code >= 400 else 0.0, meta)
            return async_wrapper
        else:
            @wraps(f)
            def sync_wrapper(*args, **kwargs):
                active_client = client or get_default_client()
                if not active_client:
                    return f(*args, **kwargs)

                start_time = time.perf_counter()
                status_code = 200
                try:
                    response = f(*args, **kwargs)
                    if hasattr(response, "status_code"):
                        status_code = response.status_code
                    return response
                except Exception as e:
                    if hasattr(e, "status_code"):
                        status_code = e.status_code
                    else:
                        status_code = 500
                    raise e
                finally:
                    duration_ms = (time.perf_counter() - start_time) * 1000.0
                    meta = {"endpoint": f.__name__, "status_code": status_code}
                    active_client.push_response_time(duration_ms, meta)
                    active_client.push_error_rate(100.0 if status_code >= 400 else 0.0, meta)
            return sync_wrapper

    if func is None:
        return decorator
    return decorator(func)
