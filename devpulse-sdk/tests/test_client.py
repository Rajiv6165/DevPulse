import time
import pytest
import asyncio
from unittest.mock import MagicMock, patch
from devpulse.client import DevPulseClient, get_default_client, set_default_client
from devpulse.exceptions import DevPulseConfigError

# Configure Django settings once for the test module
try:
    import django
    from django.conf import settings
    if not settings.configured:
        settings.configure(
            DEVPULSE_API_KEY="init-key",
            DEVPULSE_SERVICE_ID="init-service",
            DEVPULSE_BASE_URL="http://init-base.com"
        )
    DJANGO_AVAILABLE = True
except ImportError:
    DJANGO_AVAILABLE = False

# Automatically reset default client between tests for clean test isolation
@pytest.fixture(autouse=True)
def reset_default_client():
    set_default_client(None)
    yield
    set_default_client(None)


def test_client_init_validation():
    # Test missing credentials
    with pytest.raises(DevPulseConfigError):
        DevPulseClient(api_key="", service_id="some-id")
    
    with pytest.raises(DevPulseConfigError):
        DevPulseClient(api_key="some-key", service_id="")
        
    # Valid client creation
    with patch("threading.Thread.start") as mock_start:
        client = DevPulseClient(api_key="test-key", service_id="test-service", base_url="http://test.com")
        assert client.api_key == "test-key"
        assert client.service_id == "test-service"
        assert client.base_url == "http://test.com"
        assert get_default_client() == client


def test_client_local_queue_capacity():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        # Push 500 items
        for i in range(500):
            client.push_metric("cpu", float(i))
            
        assert client.queue.qsize() == 500
        # The first item in queue should be 0.0
        first_item = client.queue.queue[0]
        assert first_item["value"] == 0.0
        
        # Push one more, it should drop the oldest (which is 0.0)
        client.push_metric("cpu", 500.0)
        assert client.queue.qsize() == 500
        new_first_item = client.queue.queue[0]
        assert new_first_item["value"] == 1.0
        
        last_item = client.queue.queue[-1]
        assert last_item["value"] == 500.0


def test_client_shorthand_methods():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        client.push_cpu(55.5)
        client.push_memory(80.2)
        client.push_error_rate(0.0)
        client.push_response_time(120.5)
        client.push_custom("custom_metric", 42.0)
        
        assert client.queue.qsize() == 5
        
        items = list(client.queue.queue)
        assert items[0]["metric_type"] == "cpu"
        assert items[0]["value"] == 55.5
        
        assert items[1]["metric_type"] == "memory"
        assert items[1]["value"] == 80.2
        
        assert items[2]["metric_type"] == "error_rate"
        assert items[2]["value"] == 0.0
        
        assert items[3]["metric_type"] == "response_time"
        assert items[3]["value"] == 120.5
        
        assert items[4]["metric_type"] == "custom"
        assert items[4]["value"] == 42.0
        assert items[4]["metadata"]["custom_metric_name"] == "custom_metric"


@patch("time.sleep")
@patch("requests.Session.post")
def test_send_batch_retry_success(mock_post, mock_sleep):
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        # Mocking post failure twice, then success
        mock_response_fail = MagicMock()
        mock_response_fail.status_code = 500
        mock_response_fail.text = "Internal Server Error"
        
        mock_response_success = MagicMock()
        mock_response_success.status_code = 200
        
        mock_post.side_effect = [mock_response_fail, mock_response_fail, mock_response_success]
        
        client._send_batch([{"value": 10.0}])
        
        assert mock_post.call_count == 3
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(1)
        mock_sleep.assert_any_call(2)
        assert not client.server_unreachable


@patch("time.sleep")
@patch("requests.Session.post")
def test_send_batch_retry_failure_put_back(mock_post, mock_sleep):
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Error"
        mock_post.return_value = mock_response
        
        batch = [{"value": 1.0}, {"value": 2.0}]
        client._send_batch(batch)
        
        assert mock_post.call_count == 3
        
        # Put back in queue in reversed order (2.0 then 1.0)
        assert client.queue.qsize() == 2
        items = list(client.queue.queue)
        assert items[0]["value"] == 2.0
        assert items[1]["value"] == 1.0


def test_worker_loop_trigger():
    with patch("threading.Thread.start"):
        client = DevPulseClient(
            api_key="test-key", 
            service_id="test-service", 
            max_buffer_size=2,
            flush_interval=10.0
        )
        
        client.push_cpu(1.0)
        client.push_cpu(2.0)
        
        with patch.object(client, "_send_batch") as mock_send_batch:
            def mock_sleep_fn(secs):
                client.shutdown_triggered = True
                
            with patch("time.sleep", side_effect=mock_sleep_fn):
                client._worker()
                
            mock_send_batch.assert_called_once()
            batch_sent = mock_send_batch.call_args[0][0]
            assert len(batch_sent) == 2


def test_worker_loop_flush_interval():
    with patch("threading.Thread.start"):
        client = DevPulseClient(
            api_key="test-key", 
            service_id="test-service", 
            max_buffer_size=10,
            flush_interval=0.0
        )
        
        client.push_cpu(1.0)
        
        with patch.object(client, "_send_batch") as mock_send_batch:
            def mock_sleep_fn(secs):
                client.shutdown_triggered = True
                
            with patch("time.sleep", side_effect=mock_sleep_fn):
                client._worker()
                
            mock_send_batch.assert_called_once()
            batch_sent = mock_send_batch.call_args[0][0]
            assert len(batch_sent) == 1


def test_client_shutdown():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        client.push_cpu(1.0)
        
        with patch.object(client, "_send_batch") as mock_send_batch:
            client.shutdown()
            assert client.shutdown_triggered is True
            mock_send_batch.assert_called_once()
            assert client.queue.empty()


def test_track_block_context_manager():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        with client.track_block("test_db_query", {"query": "SELECT 1"}):
            time.sleep(0.001)
            
        assert client.queue.qsize() == 1
        metric = client.queue.get()
        assert metric["metric_type"] == "custom"
        assert metric["metadata"]["query"] == "SELECT 1"
        assert metric["metadata"]["custom_metric_name"] == "test_db_query"
        
        with pytest.raises(ValueError, match="test error"):
            with client.track_block("test_fail_block"):
                raise ValueError("test error")
                
        assert client.queue.qsize() == 2
        m1 = client.queue.get()
        assert m1["metric_type"] == "error_rate"
        assert m1["value"] == 100.0
        assert m1["metadata"]["exception_type"] == "ValueError"
        assert m1["metadata"]["exception_message"] == "test error"
        
        m2 = client.queue.get()
        assert m2["metric_type"] == "custom"
        assert m2["metadata"]["exception_type"] == "ValueError"


def test_decorators_track_function():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        @client.track_function
        def my_sync_func(a, b):
            return a + b
            
        res = my_sync_func(2, 3)
        assert res == 5
        
        assert client.queue.qsize() == 3
        m_calls = client.queue.get()
        assert m_calls["metric_type"] == "custom"
        assert m_calls["value"] == 1.0
        assert m_calls["metadata"]["function"] == "my_sync_func"
        
        m_resp = client.queue.get()
        assert m_resp["metric_type"] == "response_time"
        
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"
        assert m_err["value"] == 0.0


def test_decorators_track_function_async():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        @client.track_function
        async def my_async_func(a, b):
            return a + b
            
        res = asyncio.run(my_async_func(2, 3))
        assert res == 5
        
        assert client.queue.qsize() == 3
        m_calls = client.queue.get()
        assert m_calls["metric_type"] == "custom"
        assert m_calls["value"] == 1.0
        
        m_resp = client.queue.get()
        assert m_resp["metric_type"] == "response_time"
        
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"
        assert m_err["value"] == 0.0


def test_decorators_track_function_exception():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        @client.track_function
        def fail_func():
            raise RuntimeError("fail")
            
        with pytest.raises(RuntimeError, match="fail"):
            fail_func()
            
        assert client.queue.qsize() == 3
        m_calls = client.queue.get()
        m_resp = client.queue.get()
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"
        assert m_err["value"] == 100.0


def test_decorators_track_endpoint():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        class MockResponse:
            status_code = 201
            
        @client.track_endpoint
        def my_endpoint():
            return MockResponse()
            
        resp = my_endpoint()
        assert resp.status_code == 201
        
        assert client.queue.qsize() == 2
        m_resp = client.queue.get()
        assert m_resp["metric_type"] == "response_time"
        assert m_resp["metadata"]["endpoint"] == "my_endpoint"
        assert m_resp["metadata"]["status_code"] == 201
        
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"
        assert m_err["value"] == 0.0


def test_decorators_track_endpoint_async():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        class MockResponse:
            status_code = 202
            
        @client.track_endpoint
        async def my_async_endpoint():
            return MockResponse()
            
        resp = asyncio.run(my_async_endpoint())
        assert resp.status_code == 202
        
        assert client.queue.qsize() == 2
        m_resp = client.queue.get()
        assert m_resp["metric_type"] == "response_time"
        assert m_resp["metadata"]["endpoint"] == "my_async_endpoint"
        assert m_resp["metadata"]["status_code"] == 202
        
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"
        assert m_err["value"] == 0.0


def test_decorators_track_endpoint_exception_with_status():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        class MockHTTPException(Exception):
            status_code = 404
            
        @client.track_endpoint
        def fail_endpoint():
            raise MockHTTPException("Not Found")
            
        with pytest.raises(Exception):
            fail_endpoint()
            
        assert client.queue.qsize() == 2
        m_resp = client.queue.get()
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"
        assert m_err["value"] == 100.0
        assert m_err["metadata"]["status_code"] == 404


def test_decorators_track_endpoint_generic_exception():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        @client.track_endpoint
        def fail_generic():
            raise ValueError("generic error")
            
        with pytest.raises(ValueError):
            fail_generic()
            
        assert client.queue.qsize() == 2
        m_resp = client.queue.get()
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"
        assert m_err["value"] == 100.0
        assert m_err["metadata"]["status_code"] == 500


def test_starlette_middleware():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        from devpulse.middleware import DevPulseMiddleware
        
        mock_request = MagicMock()
        mock_request.headers = {}
        mock_request.url.path = "/test-route"
        mock_request.method = "GET"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {}
        
        async def mock_call_next(req):
            return mock_response
            
        middleware = DevPulseMiddleware(app=None, client=client)
        resp = asyncio.run(middleware.dispatch(mock_request, mock_call_next))
        
        assert resp == mock_response
        assert "DevPulse-Request-Id" in resp.headers
        request_id = resp.headers["DevPulse-Request-Id"]
        
        assert client.queue.qsize() == 2
        m_resp = client.queue.get()
        assert m_resp["metric_type"] == "response_time"
        assert m_resp["metadata"]["path"] == "/test-route"
        assert m_resp["metadata"]["request_id"] == request_id
        
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"
        assert m_err["value"] == 0.0


def test_starlette_middleware_exception():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        from devpulse.middleware import DevPulseMiddleware
        
        mock_request = MagicMock()
        mock_request.headers = {}
        mock_request.url.path = "/test-route"
        mock_request.method = "GET"
        
        async def mock_call_next_fail(req):
            raise ValueError("middleware failure")
            
        middleware = DevPulseMiddleware(app=None, client=client)
        
        with pytest.raises(ValueError, match="middleware failure"):
            asyncio.run(middleware.dispatch(mock_request, mock_call_next_fail))
            
        assert client.queue.qsize() == 2
        m_resp = client.queue.get()
        assert m_resp["metric_type"] == "response_time"
        
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"
        assert m_err["value"] == 100.0


@pytest.mark.skipif(not DJANGO_AVAILABLE, reason="Django not installed")
def test_django_middleware_sync():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        from devpulse.middleware import DevPulseDjangoMiddleware
        
        mock_request = MagicMock()
        mock_request.headers = {}
        mock_request.META = {}
        mock_request.path = "/django-route"
        mock_request.method = "POST"
        
        mock_response = MagicMock()
        mock_response.status_code = 201
        headers_dict = {}
        
        def set_header(key, val):
            headers_dict[key] = val
        mock_response.__setitem__.side_effect = set_header
        mock_response.__getitem__.side_effect = lambda key: headers_dict[key]
        mock_response.__contains__.side_effect = lambda key: key in headers_dict
        
        def mock_get_response(req):
            return mock_response
            
        middleware = DevPulseDjangoMiddleware(get_response=mock_get_response)
        
        resp = middleware(mock_request)
        assert resp == mock_response
        assert "DevPulse-Request-Id" in headers_dict
        request_id = headers_dict["DevPulse-Request-Id"]
        
        assert client.queue.qsize() == 2
        m_resp = client.queue.get()
        assert m_resp["metric_type"] == "response_time"
        assert m_resp["metadata"]["path"] == "/django-route"
        assert m_resp["metadata"]["request_id"] == request_id
        
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"
        assert m_err["value"] == 0.0


@pytest.mark.skipif(not DJANGO_AVAILABLE, reason="Django not installed")
def test_django_middleware_async():
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        from devpulse.middleware import DevPulseDjangoMiddleware
        
        mock_request = MagicMock()
        mock_request.headers = {}
        mock_request.META = {}
        mock_request.path = "/django-route"
        mock_request.method = "POST"
        
        mock_response = MagicMock()
        mock_response.status_code = 201
        headers_dict = {}
        
        def set_header(key, val):
            headers_dict[key] = val
        mock_response.__setitem__.side_effect = set_header
        mock_response.__getitem__.side_effect = lambda key: headers_dict[key]
        mock_response.__contains__.side_effect = lambda key: key in headers_dict
        
        async def mock_get_response(req):
            return mock_response
            
        middleware = DevPulseDjangoMiddleware(get_response=mock_get_response)
        
        resp = asyncio.run(middleware(mock_request))
        assert resp == mock_response
        assert "DevPulse-Request-Id" in headers_dict
        request_id = headers_dict["DevPulse-Request-Id"]
        
        assert client.queue.qsize() == 2
        m_resp = client.queue.get()
        assert m_resp["metric_type"] == "response_time"
        assert m_resp["metadata"]["request_id"] == request_id
        
        m_err = client.queue.get()
        assert m_err["metric_type"] == "error_rate"


@pytest.mark.skipif(not DJANGO_AVAILABLE, reason="Django not installed")
def test_django_middleware_settings_init():
    with patch("devpulse.client.get_default_client", return_value=None):
        with patch("threading.Thread.start"):
            from django.conf import settings
            settings.DEVPULSE_API_KEY = "settings-key"
            settings.DEVPULSE_SERVICE_ID = "settings-service"
            settings.DEVPULSE_BASE_URL = "http://settings-base.com"
            
            from devpulse.middleware import DevPulseDjangoMiddleware
            
            def dummy_get_response(req):
                return MagicMock()
                
            middleware = DevPulseDjangoMiddleware(get_response=dummy_get_response)
            assert middleware.client is not None
            assert middleware.client.api_key == "settings-key"
            assert middleware.client.service_id == "settings-service"
            assert middleware.client.base_url == "http://settings-base.com"


@patch("requests.get")
def test_client_health_check(mock_get):
    with patch("threading.Thread.start"):
        client = DevPulseClient(api_key="test-key", service_id="test-service")
        
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp
        assert client.health_check() is True
        mock_get.assert_called_with("https://your-devpulse.com/health", timeout=3.0)
        
        mock_resp.status_code = 500
        assert client.health_check() is False
        
        mock_get.side_effect = Exception("connection error")
        assert client.health_check() is False
