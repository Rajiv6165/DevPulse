import os
from typing import List, Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_DB_URL: str

    UPSTASH_REDIS_REST_URL: str
    UPSTASH_REDIS_REST_TOKEN: str

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Slack Webhook for Alerts
    SLACK_WEBHOOK_URL: Optional[str] = None

    # Resend API configuration
    RESEND_API_KEY: Optional[str] = None
    RESEND_SENDER_EMAIL: str = "alerts@yourdomain.com"

    # AWS S3 Settings
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET_NAME: Optional[str] = None

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

# Determine environment file location relative to project structure
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(backend_dir, ".env")

# Instantiating the settings object
if os.path.exists(env_path):
    settings = Settings(_env_file=env_path)
else:
    # Fallback to system env vars directly if .env is missing (e.g., in Docker)
    settings = Settings()
