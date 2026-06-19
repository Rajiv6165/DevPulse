# DevPulse Python SDK

The official, production-grade Python SDK for **DevPulse** — an AI-Powered DevOps Observability Dashboard. Use this SDK to push application telemetry, latencies, resource usages, and execution metrics asynchronously from any Python service.

## Features

- **Asynchronous & Non-blocking**: Uses a background daemon worker and thread-safe queue to write metrics without blocking your hot paths.
- **Efficient Buffering**: Flushes metrics in batches dynamically (every 5 seconds or on reaching 50 cached metrics).
- **Graceful Shutdown**: Automatically registers atexit hooks to guarantee any remaining cached metrics are flushed before the program exits.
- **Fail-Silent Resilience**: Catch-all logging wrapper ensures that connection failures or remote server issues will not affect your application execution.
- **Framework Middlewares**: Plug-and-play middleware integrations for FastAPI/Starlette and Django.
- **Modern Decorators**: Dynamic decorators targeting standard functions and API routes supporting both synchronous and asynchronous modes.

---

## Installation

Install directly from your local package source:

```bash
pip install ./devpulse-sdk
```

Or when published:

```bash
pip install devpulse-sdk
```

---

## Quickstart

### 1. Initialize the Client

Initialize the `DevPulseClient` with your service API key and service UUID. The first client instance created automatically registers itself as the default instance for package decorators and middlewares.

```python
from devpulse import DevPulseClient

dp = DevPulseClient(
    api_key="your-service-api-key",
    service_id="your-service-uuid",
    base_url="https://your-devpulse-instance.com" # Defaults to "https://your-devpulse.com"
)
```

---

## Core Usage Examples

### Manual Metrics Pushing

Send custom metrics or standard resource updates using shorthand helper functions:

```python
# System metrics
dp.push_cpu(45.2)
dp.push_memory(82.4)

# Quality metrics
dp.push_error_rate(0.0)
dp.push_response_time(125.8)  # In milliseconds

# Custom application metrics
dp.push_custom("database_connections", 12.0)
```

### Context Manager (`track_block`)

Use the context manager to measure execution times for specific code blocks:

```python
with dp.track_block("process_image_pipeline"):
    # Perform operations...
    transform_image()
    compress_image()
```

---

## Decorators

Decorators support both synchronous and asynchronous (`async/await`) targets and resolve the default client automatically.

### Function Level (`@track_function`)

Auto-tracks call counts, response time, and success/failure rates:

```python
from devpulse import track_function

# Using default registered client instance
@track_function
def calculate_metrics():
    # calculation logic
    pass

# Or using an explicit client instance bound decorator
@dp.track_function
async def query_external_api():
    # async query logic
    pass
```

### FastAPI/Starlette Route Level (`@track_endpoint`)

Measures endpoint latency and auto-resolves status codes (even when HTTPException is raised):

```python
from fastapi import FastAPI, HTTPException
from devpulse import track_endpoint

app = FastAPI()

@app.get("/items/{item_id}")
@track_endpoint
async def read_item(item_id: int):
    if item_id == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"item_id": item_id}
```

---

## Middleware Integration

### FastAPI Middleware

Automatically intercepts every incoming request to record latencies, status codes, paths, and error rates.

```python
from fastapi import FastAPI
from devpulse import DevPulseClient, DevPulseMiddleware

app = FastAPI()
dp = DevPulseClient(api_key="your-api-key", service_id="your-service-uuid")

# Apply middleware
app.add_middleware(DevPulseMiddleware, client=dp)
```

### Django Middleware

Intercepts Django's sync/async request-response pipelines.

1. Add your credentials to your Django `settings.py` config:

```python
# settings.py
DEVPULSE_API_KEY = "your-api-key"
DEVPULSE_SERVICE_ID = "your-service-uuid"
DEVPULSE_BASE_URL = "https://your-devpulse-instance.com" # Optional, defaults to "https://your-devpulse.com"
```

2. Add the Django middleware to your list of active middlewares:

```python
# settings.py
MIDDLEWARE = [
    ...
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    # DevPulse Middleware
    "devpulse.middleware.DevPulseDjangoMiddleware",
    ...
]
```

---

## Troubleshooting & Internals

### Buffering & Queue Behavior
To optimize performance, metrics are stored inside a thread-safe in-memory queue. A background thread processes the queue. Items are sent to the backend when:
- The buffer contains **50** metrics.
- Or **5 seconds** have elapsed since the last flush.

### Resilient Logging
If the DevPulse backend goes offline, the SDK logs warnings via Python's standard `logging` library instead of crashing the host application:

```python
import logging
# Optional: Set the log level of 'devpulse' to suppress warnings or forward them to alert systems
logging.getLogger("devpulse").setLevel(logging.ERROR)
```
