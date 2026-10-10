from core.config import settings
from upstash_redis import Redis
from upstash_redis.asyncio import Redis as AsyncRedis

# Initialize Upstash Redis Synchronous client
redis_client = Redis(
    url=settings.UPSTASH_REDIS_REST_URL,
    token=settings.UPSTASH_REDIS_REST_TOKEN
)

# Initialize Upstash Redis Asynchronous client
async_redis_client = AsyncRedis(
    url=settings.UPSTASH_REDIS_REST_URL,
    token=settings.UPSTASH_REDIS_REST_TOKEN
)
