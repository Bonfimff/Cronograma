"""
Consultas de verdade: hora e data de Brasília, previsão do tempo e curiosidades.

No histórico, a pessoa perguntou a previsão do tempo para amanhã no Rio de Janeiro e se
ia chover; o chat só podia dizer que não busca nada na internet. O modelo pequeno não
deve responder isso de cabeça (inventaria números), então quem consulta é o servidor:

- hora e data: relógio do servidor no fuso de Brasília (UTC-3, sem horário de verão);
- tempo: Open-Meteo (gratuita, sem chave), com a cidade da pergunta ou a última citada;
- curiosidade / novidade: "neste dia" da Wikipédia em português;
- "o que é X?" / "quem foi X?": o resumo da Wikipédia.

Também daqui sai a saudação certa para o horário (bom dia, boa tarde, boa noite).
"""

import json
import random
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

BRASILIA = timezone(timedelta(hours=-3), "Brasília")
AGENTE = "EitaApp/1.0 (app de estudo de inglês; contato: exksvol.com)"

DIAS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def agora() -> datetime:
    return datetime.now(BRASILIA)


def saudacao(momento: datetime | None = None) -> str:
    h = (momento or agora()).hour
    return "Bom dia" if 5 <= h < 12 else "Boa tarde" if 12 <= h < 18 else "Boa noite"


SAUDACAO_DA_PESSOA = re.compile(
    r"^\s*(?:oi+|ol[aá]|opa|e a[ií]|eae|hey|hi|hello|bom dia|boa tarde|boa noite|salve|fala a[ií])\b", re.IGNORECASE)
ABERTURA = re.compile(r"^\s*(?:(?:ol[aá]|oi+|hello|hi|hey|bom dia|boa tarde|boa noite|good (?:morning|afternoon|evening))[\s,!.]*)+",
                      re.IGNORECASE)


def ajustar_saudacao(resposta: str, fala_da_pessoa: str, momento: datetime | None = None) -> str:
    """Se a pessoa cumprimentou, a resposta começa com a saudação certa para o horário de Brasília."""
    if not SAUDACAO_DA_PESSOA.search(fala_da_pessoa or ""):
        return resposta
    resto = ABERTURA.sub("", resposta, count=1).strip()
    if resto:
        resto = resto[:1].upper() + resto[1:]
    return f"{saudacao(momento)}! {resto}".strip()


# ---------- rede ----------

_cache: dict[str, tuple[float, object]] = {}


def _buscar_json(url: str, validade: int = 600) -> object:
    guardado = _cache.get(url)
    if guardado and time.time() - guardado[0] < validade:
        return guardado[1]
    pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": "application/json"})
    with urllib.request.urlopen(pedido, timeout=8) as r:
        dados = json.loads(r.read().decode("utf-8"))
    _cache[url] = (time.time(), dados)
    return dados


# ---------- hora e data ----------

HORA = re.compile(r"que horas?\b|\bhoras? (?:s[aã]o|agora|atual)|qual (?:é )?a hora|\bhor[aá]rio (?:de )?agora", re.IGNORECASE)
DATA = re.compile(r"que dia (?:é )?hoje|qual (?:é )?a data|\bdata de hoje|dia da semana|que dia (?:da semana )?(?:é|e)\b", re.IGNORECASE)


def resposta_hora(momento: datetime | None = None) -> str:
    m = momento or agora()
    return f"Agora são {m:%H:%M} no horário de Brasília."


def resposta_data(momento: datetime | None = None) -> str:
    m = momento or agora()
    return f"Hoje é {DIAS[m.weekday()]}, {m.day} de {MESES[m.month - 1]} de {m.year}."


# ---------- tempo ----------

TEMPO = re.compile(
    r"\bprevis[aã]o\b|vai chover|\bchov|\bchuva|temperatura|\bclima\b|como (?:est[aá]|t[aá]) o tempo"
    r"|\btempo (?:em|no|na|para|pra|hoje|amanh|agora)|faz(?:endo)? (?:frio|calor)|\bgraus\b", re.IGNORECASE)
NAO_E_CIDADE = {"tempo", "previsão", "previsao", "chuva", "hoje", "amanhã", "amanha", "agora", "clima", "semana", "frio", "calor",
                "temperatura", "noite", "tarde", "manhã", "manha", "lá", "la", "aqui"}
WMO = {
    0: "céu limpo", 1: "quase sem nuvens", 2: "parcialmente nublado", 3: "nublado", 45: "neblina", 48: "neblina",
    51: "garoa fraca", 53: "garoa", 55: "garoa forte", 61: "chuva fraca", 63: "chuva", 65: "chuva forte",
    66: "chuva congelante", 67: "chuva congelante", 71: "neve fraca", 73: "neve", 75: "neve forte", 80: "pancadas de chuva",
    81: "pancadas de chuva", 82: "pancadas fortes de chuva", 95: "trovoadas", 96: "trovoadas com granizo", 99: "trovoadas com granizo",
}


def cidade_da_frase(fala: str) -> str | None:
    """"previsão do tempo para amanhã no rio de janeiro" → "rio de janeiro"."""
    baixa = fala.lower()
    boas = []
    # cada preposição abre um candidato, que vai até a próxima palavra de tempo ou pontuação
    for m in re.finditer(r"\b(?:em|no|na|para|pra)\s+", baixa):
        resto = re.split(r"[?.!,]|\s+(?:amanh\w*|hoje|agora|essa|esta|nessa|nesta|semana|de manh\w*|à noite|a noite)\b", baixa[m.end():])[0]
        resto = re.split(r"\s+(?:em|no|na|para|pra)\s+", resto)[0].strip()
        palavras = resto.split()
        if palavras and palavras[0] not in NAO_E_CIDADE:
            boas.append(resto)
    return max(boas, key=len) if boas else None

def _geocodificar(cidade: str) -> dict | None:
    url = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode({"name": cidade, "count": 5, "language": "pt"})
    resultados = (_buscar_json(url, 86400) or {}).get("results") or []
    if not resultados:
        return None
    return next((r for r in resultados if r.get("country_code") == "BR"), resultados[0])


def resposta_tempo(fala: str, conversa: list[dict]) -> str:
    cidade = cidade_da_frase(fala)
    if not cidade:  # a última cidade que a pessoa citou numa pergunta de tempo
        for m in reversed(conversa[:-1]):
            if m.get("role") == "user" and TEMPO.search(m.get("content") or ""):
                cidade = cidade_da_frase(m.get("content") or "")
                if cidade:
                    break
    if not cidade:
        return "De qual cidade? Por exemplo: como está o tempo em São Paulo?"
    lugar = _geocodificar(cidade)
    if not lugar:
        return f"Não achei a cidade \"{cidade}\". Tente escrever de outro jeito, por exemplo: tempo em Rio de Janeiro."
    url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode({
        "latitude": lugar["latitude"], "longitude": lugar["longitude"], "timezone": "America/Sao_Paulo", "forecast_days": 2,
        "current": "temperature_2m,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    })
    d = _buscar_json(url, 600)
    nome = lugar.get("name", cidade.title())
    atual, dia = d.get("current") or {}, d.get("daily") or {}
    k = 1 if re.search(r"amanh", fala, re.IGNORECASE) else 0
    quando = "Amanhã" if k else "Hoje"
    dia_txt = (
        f"{quando}: {WMO.get(dia['weather_code'][k], 'tempo variado')}, mínima de {round(dia['temperature_2m_min'][k])}°C "
        f"e máxima de {round(dia['temperature_2m_max'][k])}°C, chance de chuva de {dia['precipitation_probability_max'][k]}%."
    )
    agora_txt = f"Agora em {nome}: {round(atual['temperature_2m'])}°C, {WMO.get(atual['weather_code'], 'tempo variado')}. " if not k else f"Em {nome}. "
    return agora_txt + dia_txt + " (Open-Meteo)"


# ---------- curiosidade e Wikipédia ----------

CURIOSIDADE = re.compile(r"curiosidade|fato interessante|novidade|aconteceu (?:neste|nesse|hoje)|neste dia|me conta algo", re.IGNORECASE)
WIKI = re.compile(r"^\s*(?:o que (?:é|e|são|sao|significa)|quem (?:foi|é|e|era)|me fal[ae] sobre|fale sobre)\s+(?:o |a |os |as |um |uma )?(.+?)\s*\??\s*$",
                  re.IGNORECASE)


def resposta_curiosidade(momento: datetime | None = None) -> str:
    m = momento or agora()
    url = f"https://api.wikimedia.org/feed/v1/wikipedia/pt/onthisday/selected/{m.month:02d}/{m.day:02d}"
    eventos = [e for e in (_buscar_json(url, 43200) or {}).get("selected", []) if e.get("text")]
    if not eventos:
        return "Hoje não achei uma curiosidade. Pergunte de novo mais tarde!"
    e = random.choice(eventos)
    return f"Neste dia, em {e.get('year')}: {e['text']} (Wikipédia)"


def _frases(texto: str, n: int = 2, limite: int = 320) -> str:
    partes = re.split(r"(?<=[.!?])\s+", texto.strip())
    saida = " ".join(partes[:n])
    return saida if len(saida) <= limite else saida[: limite - 1].rsplit(" ", 1)[0] + "…"


def resposta_wiki(assunto: str) -> str | None:
    busca = "https://pt.wikipedia.org/w/rest.php/v1/search/title?" + urllib.parse.urlencode({"q": assunto, "limit": 1})
    paginas = (_buscar_json(busca, 86400) or {}).get("pages") or []
    if not paginas:
        return None
    chave = urllib.parse.quote(paginas[0]["key"])
    resumo = _buscar_json(f"https://pt.wikipedia.org/api/rest_v1/page/summary/{chave}", 86400) or {}
    texto = resumo.get("extract") or ""
    return f"{_frases(texto)} (Wikipédia)" if texto else None


# ---------- quem decide ----------

def responder_consulta(conversa: list[dict], sobre_o_app: bool = False) -> str | None:
    """A resposta de uma consulta de verdade, ou None se a mensagem não pede uma."""
    if not conversa or conversa[-1].get("role") != "user":
        return None
    fala = str(conversa[-1].get("content") or "").strip()
    try:
        if HORA.search(fala) and DATA.search(fala):
            return f"{resposta_data()} {resposta_hora()}"
        if HORA.search(fala):
            return resposta_hora()
        if DATA.search(fala):
            return resposta_data()
        if TEMPO.search(fala):
            return resposta_tempo(fala, conversa)
        if CURIOSIDADE.search(fala):
            return resposta_curiosidade()
        m = WIKI.search(fala)
        if m and not sobre_o_app and len(m.group(1)) >= 3:
            return resposta_wiki(m.group(1))
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        return "Não consegui consultar agora. Tente de novo daqui a pouco."
    return None