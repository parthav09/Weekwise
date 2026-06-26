from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "WeekWise API"
    environment: str = "development"

    database_url: str

    backend_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    gemini_api_key: str | None = None
    ai_planner_model: str = "gemini-2.5-flash"

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = (
        "http://localhost:8000/api/integrations/google-calendar/callback"
    )
    google_calendar_scopes: str = (
        "openid email "
        "https://www.googleapis.com/auth/calendar.readonly "
        "https://www.googleapis.com/auth/calendar.events"
    )
    gmail_redirect_uri: str = "http://localhost:8000/api/integrations/gmail/callback"
    gmail_scopes: str = "openid email https://www.googleapis.com/auth/gmail.readonly"
    gmail_sync_lookback_days: int = 7
    gmail_sync_max_messages: int = 50
    email_extractor_model: str | None = None
    frontend_app_url: str = "http://localhost:5173"

    notifications_enabled: bool = False
    notification_default_lead_minutes: int = 10
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    web_push_vapid_public_key: str | None = None
    web_push_vapid_private_key: str | None = None
    web_push_contact_email: str | None = None

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8"
    )

    @property
    def sqlalchemy_database_uri(self) -> str:
        database_url = self.database_url.strip()
        if not database_url:
            raise ValueError("DATABASE_URL must be set.")
        if database_url.startswith("postgresql://"):
            return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        if database_url.startswith("postgres://"):
            return database_url.replace("postgres://", "postgresql+psycopg://", 1)
        return database_url

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.backend_cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def google_scopes(self) -> list[str]:
        return [
            scope.strip()
            for scope in self.google_calendar_scopes.replace(",", " ").split()
            if scope.strip()
        ]

    @property
    def gmail_scope_list(self) -> list[str]:
        return [
            scope.strip()
            for scope in self.gmail_scopes.replace(",", " ").split()
            if scope.strip()
        ]


settings = Settings()
