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


settings = Settings()
