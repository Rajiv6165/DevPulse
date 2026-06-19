import time
from typing import Any, Optional

# Safe framework import checking
try:
    from starlette.middleware.base import BaseHTTPMiddleware
    HAS_STARLETTE = True
except ImportError:
    HAS_STARLETTE = False
    BaseHTTPMiddleware = object  # Fallback to prevent definition syntax error

try:
    from django.conf import settings
    HAS_DJANGO = True
except ImportError:
    HAS_DJANGO = False


# FastAPI/Starlette Middleware
if HAS_STARLETTE:
    class DevPulseMiddleware(BaseHTTPMiddleware):
        """
        FastAPI / Starlette Middleware that auto-tracks execution time and
        error rates for all HTTP requests, pushing the results to DevPulse.
        """
        def __init__(self, app: Any, client: Optional[Any] = None):
            super().__init__(app)
            from devpulse.client import get_default_client
            self.client = client or get_default_client()

        async def dispatch(self, request: Any, call_next: Any) -> Any:
            if not self.client:
                return await call_next(request)

            start_time = time.perf_counter()
            status_code = 500
            try:
                response = await call_next(request)
                status_code = response.status_code
                return response
            except Exception as e:
                status_code = 500
                raise e
            finally:
                duration_ms = (time.perf_counter() - start_time) * 1000.0
                path = request.url.path
                method = request.method
                meta = {
                    "path": path,
                    "method": method,
                    "status_code": status_code
                }
                # Record telemetry metrics
                self.client.push_response_time(duration_ms, meta)
                self.client.push_error_rate(100.0 if status_code >= 400 else 0.0, meta)
else:
    # Fail-safe dummy class definition if Starlette is not installed
    class DevPulseMiddleware:
        def __init__(self, *args, **kwargs):
            raise ImportError(
                "Starlette/FastAPI is not installed. DevPulseMiddleware requires Starlette."
            )


# Django Middleware
class DevPulseDjangoMiddleware:
    """
    Django Middleware that auto-tracks execution times and error rates
    for all requests in the Django lifecycle (sync and async compatible).
    """
    sync_capable = True
    async_capable = True

    def __init__(self, get_response: Any):
        self.get_response = get_response
        self.client = None

        from devpulse.client import get_default_client, DevPulseClient
        self.client = get_default_client()

        # If default client is not registered, attempt to initialize from Django settings
        if not self.client and HAS_DJANGO:
            try:
                api_key = getattr(settings, "DEVPULSE_API_KEY", None)
                service_id = getattr(settings, "DEVPULSE_SERVICE_ID", None)
                base_url = getattr(settings, "DEVPULSE_BASE_URL", "https://your-devpulse.com")
                if api_key and service_id:
                    self.client = DevPulseClient(api_key=api_key, service_id=service_id, base_url=base_url)
            except Exception:
                # Silently catch configuration parsing errors
                pass

        # Detect if we should run in sync or async mode
        import asyncio
        if asyncio.iscoroutinefunction(self.get_response):
            self._call_handler = self._async_call
        else:
            self._call_handler = self._sync_call

    def __call__(self, request: Any) -> Any:
        return self._call_handler(request)

    def _sync_call(self, request: Any) -> Any:
        if not self.client:
            return self.get_response(request)

        start_time = time.perf_counter()
        status_code = 500
        try:
            response = self.get_response(request)
            status_code = response.status_code
            return response
        except Exception as e:
            status_code = 500
            raise e
        finally:
            self._record_metrics(start_time, request, status_code)

    async def _async_call(self, request: Any) -> Any:
        if not self.client:
            return await self.get_response(request)

        start_time = time.perf_counter()
        status_code = 500
        try:
            response = await self.get_response(request)
            status_code = response.status_code
            return response
        except Exception as e:
            status_code = 500
            raise e
        finally:
            self._record_metrics(start_time, request, status_code)

    def _record_metrics(self, start_time: float, request: Any, status_code: int) -> None:
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        path = getattr(request, "path", "")
        method = getattr(request, "method", "")
        meta = {
            "path": path,
            "method": method,
            "status_code": status_code
        }
        self.client.push_response_time(duration_ms, meta)
        self.client.push_error_rate(100.0 if status_code >= 400 else 0.0, meta)
