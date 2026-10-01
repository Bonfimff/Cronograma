"""Configuração do servidor, lida do ambiente (ou do arquivo .env)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ENGLISH_", env_file=".env", extra="ignore")

    # chave de assinatura dos tokens — em produção vem do ambiente, nunca do código
    secret_key: str = "desenvolvimento-nao-use-em-producao"
    database_url: str = "sqlite:///./dados.db"
    # origens que podem chamar a API (o app roda em outro domínio)
    cors_origins: str = "http://localhost:5173,https://eita.exksvol.com"
    access_token_minutes: int = 30
    refresh_token_days: int = 60
    # o modelo de linguagem não mora aqui: chega pelo túnel SSH do computador de casa
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3b-opt"
    ollama_timeout: int = 300

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def settings() -> Settings:
    return Settings()
