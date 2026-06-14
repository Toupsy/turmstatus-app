from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Zentrale Konfiguration, gespeist aus Umgebungsvariablen (.env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Datenbank
    database_url: str = "postgresql+psycopg2://turmstatus:turmstatus@db:5432/turmstatus"

    # Security
    secret_key: str = "CHANGE_ME_IN_PRODUCTION_use_a_long_random_value"
    access_token_expire_minutes: int = 720  # 12h – Schichtlänge
    algorithm: str = "HS256"

    # Seed / erster Admin
    admin_username: str = "hauptwache"
    admin_password: str = "wache2024"
    # Wenn true: setzt beim Start das Passwort des Hauptwache-Kontos auf
    # ADMIN_PASSWORD zurück (Notfall-Reset bei vergessenem/altem Passwort).
    admin_reset_password: bool = False

    # CORS – Frontend-Origin(s), kommagetrennt
    cors_origins: str = "*"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
