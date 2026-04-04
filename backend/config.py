"""Backend configuration via environment variables and defaults."""

import secrets
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8443
    db_path: str = str(Path(__file__).parent / "data" / "events.db")
    rules_dir: str = str(Path(__file__).parent / "rules")
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    event_retention_days: int = 7
    heartbeat_timeout_seconds: int = 60

    # API key for agent-facing and destructive endpoints.
    # Auto-generated on first run if not set via HOMESOC_API_KEY env var.
    api_key: str = ""

    # JWT settings for dashboard user auth
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 30

    # Redis settings
    redis_url: str = "redis://localhost:6379/0"

    model_config = {"env_prefix": "HOMESOC_"}

    def ensure_api_key(self) -> str:
        """Return the configured key, generating one if empty."""
        if not self.api_key:
            self.api_key = secrets.token_urlsafe(32)
        return self.api_key

    def ensure_jwt_secret(self) -> str:
        """Return the JWT secret, generating one if empty."""
        if not self.jwt_secret:
            self.jwt_secret = secrets.token_urlsafe(32)
        return self.jwt_secret


settings = Settings()
