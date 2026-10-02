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
    # como o chat pede o inglês ao modelo: "slot" (o modelo marca a palavra e o servidor troca)
    # ou "livre" (o modelo escreve o inglês sozinho, como antes). Voltar é só mudar esta variável.
    chat_modo: str = "slot"
    # quantas palavras do vocabulário, no mínimo, cada resposta do modo "slot" troca por inglês.
    # 0 = só as que o modelo marcar; 1 = se ele não marcar nenhuma, o servidor troca uma palavra do dia
    # que já esteja no texto (pedido de quem usa: "sempre use as palavras do meu vocabulário").
    chat_trocas_minimo: int = 1
    # teto de trocas por resposta, somando as marcadas pelo modelo e as achadas no vocabulário todo; 0 desliga
    chat_trocas_maximo: int = 3

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def settings() -> Settings:
    return Settings()
