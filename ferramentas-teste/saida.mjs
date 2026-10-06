// src/core/content/normalize.ts
function seeded(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ h >>> 15, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
var str = (v) => typeof v === "string" ? v : v === void 0 || v === null ? "" : String(v);
var strs = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
var list = (v, fix) => Array.isArray(v) ? v.filter((x) => x && typeof x === "object").map((x) => fix(x)) : [];
function normalizeWord(w) {
  const pron = w.pronunciation && typeof w.pronunciation === "object" ? w.pronunciation : {};
  return {
    ...w,
    id: str(w.id),
    word: str(w.word),
    type: str(w.type),
    translations: list(w.translations, (t) => ({ ...t, text: str(t.text) })),
    core_meaning: str(w.core_meaning),
    uses: list(w.uses, (u) => ({
      ...u,
      id: str(u.id),
      label: str(u.label),
      meaning: str(u.meaning),
      explanation: str(u.explanation),
      examples: strs(u.examples)
    })),
    variations: list(w.variations, (v) => ({ ...v, form: str(v.form), meaning: str(v.meaning) })),
    related_words: strs(w.related_words),
    examples: strs(w.examples),
    pronunciation: { ...pron, ipa: str(pron.ipa) }
  };
}
function normalizeExpression(e) {
  return {
    ...e,
    id: str(e.id),
    text: str(e.text),
    words: strs(e.words),
    translation: str(e.translation),
    context: str(e.context),
    meaning: str(e.meaning),
    examples: strs(e.examples)
  };
}
function normalizePattern(p) {
  return {
    ...p,
    id: str(p.id),
    name: str(p.name),
    formula: str(p.formula),
    explanation: str(p.explanation),
    slots: list(p.slots, (s) => ({ name: str(s.name), options: strs(s.options) })),
    examples: strs(p.examples)
  };
}
function normalizeGrammar(g) {
  return { ...g, id: str(g.id), title: str(g.title), explanation: str(g.explanation), points: strs(g.points), examples: strs(g.examples) };
}
function normalizeExample(x) {
  return { ...x, id: str(x.id), en: str(x.en), pt: str(x.pt) };
}
function normalizeTopic(t) {
  return { ...t, id: str(t.id), title: str(t.title), description: str(t.description), objective: str(t.objective), refs: strs(t.refs) };
}
function pares(v) {
  if (!Array.isArray(v)) return void 0;
  const out = v.map((p) => {
    if (Array.isArray(p) && p.length >= 2) return [str(p[0]), str(p[1])];
    if (p && typeof p === "object") {
      const o = p;
      const a = o.left ?? o.en ?? o.a ?? Object.values(o)[0];
      const b = o.right ?? o.pt ?? o.b ?? Object.values(o)[1];
      return [str(a), str(b)];
    }
    return null;
  }).filter((p) => !!p && !!p[0] && !!p[1]);
  return out.length ? out : void 0;
}
function pecas(id, answer, tokens) {
  const dadas = strs(tokens).filter(Boolean);
  if (dadas.length) return dadas;
  const resposta = Array.isArray(answer) ? str(answer[0]) : str(answer);
  const palavras = resposta.replace(/[?.!,;:]/g, "").split(/\s+/).filter(Boolean);
  if (palavras.length < 2) return void 0;
  const mist = shuffle(palavras, seeded(`pecas:${id}`));
  return mist.join(" ") === palavras.join(" ") ? [...mist.slice(1), mist[0]] : mist;
}
function normalizeExercise(x) {
  const id = str(x.id);
  const ex = { ...x, id, prompt: str(x.prompt), refs: strs(x.refs) };
  if (x.pairs !== void 0) ex.pairs = pares(x.pairs);
  if (ex.type === "build") ex.tokens = pecas(id, x.answer, x.tokens);
  return ex;
}
var FIX = {
  words: normalizeWord,
  expressions: normalizeExpression,
  patterns: normalizePattern,
  grammar: normalizeGrammar,
  examples: normalizeExample,
  topics: normalizeTopic,
  exercises: normalizeExercise
};
function normalizeContent(c) {
  const out = {};
  if (!c || typeof c !== "object") return out;
  Object.keys(FIX).forEach((k) => {
    const v = c[k];
    if (v === void 0) return;
    out[k] = list(v, FIX[k]);
  });
  return out;
}

// content/words.json
var words_default = [];

// content/expressions.json
var expressions_default = [];

// content/patterns.json
var patterns_default = [];

// content/grammar.json
var grammar_default = [];

// content/examples.json
var examples_default = [];

// content/topics.json
var topics_default = [];

// content/exercises.json
var exercises_default = [];

// src/core/content/repository.ts
var baseContent = {
  words: words_default,
  expressions: expressions_default,
  patterns: patterns_default,
  grammar: grammar_default,
  examples: examples_default,
  topics: topics_default,
  exercises: exercises_default
};
var content = { ...baseContent };
var byId = (list2) => new Map(list2.map((x) => [x.id, x]));
var idx = {
  word: /* @__PURE__ */ new Map(),
  expression: /* @__PURE__ */ new Map(),
  pattern: /* @__PURE__ */ new Map(),
  grammar: /* @__PURE__ */ new Map(),
  topic: /* @__PURE__ */ new Map(),
  example: /* @__PURE__ */ new Map(),
  exercise: /* @__PURE__ */ new Map()
};
function merge(base, extra = []) {
  const m = byId(base);
  extra.forEach((x) => m.set(x.id, x));
  return [...m.values()];
}
function setUserContent(raw = {}) {
  const user = normalizeContent(raw);
  Object.keys(baseContent).forEach((k) => {
    content[k] = merge(baseContent[k], user[k]);
  });
  idx.word = byId(content.words);
  idx.expression = byId(content.expressions);
  idx.pattern = byId(content.patterns);
  idx.grammar = byId(content.grammar);
  idx.topic = byId(content.topics);
  idx.example = byId(content.examples);
  idx.exercise = byId(content.exercises);
}
setUserContent();
function parseRef(ref) {
  const i = ref.indexOf(":");
  return { kind: ref.slice(0, i), id: ref.slice(i + 1) };
}
function resolve(ref) {
  const { kind, id } = parseRef(ref);
  return idx[kind]?.get(id);
}

// src/core/dates.ts
function toISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function fromISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
var today = () => toISO(/* @__PURE__ */ new Date());
function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// src/core/progress/memoria.ts
var DEGRAUS = ["Vista", "Reconhece", "Lembra sozinho", "Entende ouvindo", "Pronuncia", "Usa no chat"];
var NIVEL_DA_HAB = { reconhecer: 1, lembrar: 2, ouvir: 3, falar: 4, usar: 5 };
var HAB_DO_NIVEL = ["reconhecer", "reconhecer", "lembrar", "ouvir", "falar", "usar"];
var ROTULO_HAB = {
  reconhecer: "Reconhecer",
  lembrar: "Lembrar sozinho",
  ouvir: "Entender ouvindo",
  falar: "Pronunciar",
  usar: "Usar no chat"
};
var DIA_MS = 864e5;
var W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
var FATOR = 19 / 81;
var CURVA = -0.5;
var limitar = (x, a, b) => Math.min(b, Math.max(a, x));
var retencao = (t, s) => Math.pow(1 + FATOR * t / s, CURVA);
var d0 = (g) => limitar(W[4] - (g - 3) * W[5], 1, 10);
function revisar(s, d, dias, g) {
  if (s === null) return { s: W[g - 1], d: d0(g) };
  const r = retencao(dias, s);
  const dNovo = limitar(W[7] * d0(4) + (1 - W[7]) * (d - W[6] * (g - 3)), 1, 10);
  const sNovo = g === 1 ? W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)) : s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
  return { s: Math.max(0.1, Math.min(sNovo, 36500)), d: dNovo };
}
function nota(e) {
  if (!e.ok) return 1;
  if (e.hab === "usar") return 4;
  if (e.dica || (e.tempo ?? 0) > 1e4) return 2;
  if (e.tempo !== void 0 && e.tempo < 2500 && e.hab !== "falar") return 4;
  return 3;
}
var PALAVRA = /[a-z][a-z']+/g;
var COMUNS = /* @__PURE__ */ new Set(["the", "and", "you", "are", "is", "am", "to", "of", "in", "on", "it", "my", "me", "a", "an", "at", "for", "do", "be", "so", "no", "yes", "ok", "oi"]);
function eventos(data2, refParaEn, vocabulario) {
  const out = [];
  for (const a of data2.atividades ?? []) {
    const inicio = new Date(a.quando).getTime();
    for (const p of a.palavras) {
      out.push({ en: p.en.toLowerCase(), ms: inicio + (p.t ?? 0) * 1e3, ok: p.ok, hab: p.hab ?? (p.ouvido !== void 0 ? "falar" : "reconhecer"), tempo: p.ms, dica: p.dica });
    }
  }
  for (const h of data2.history) {
    if (!h.ref.startsWith("word:")) continue;
    const en = refParaEn(h.ref);
    if (!en) continue;
    const ms = (/* @__PURE__ */ new Date(`${h.date}T12:00:00`)).getTime();
    if (h.event === "consolidated") out.push({ en: en.toLowerCase(), ms, ok: true, hab: "lembrar" });
    else if (h.event === "review_needed" || h.event === "reinforce_needed") out.push({ en: en.toLowerCase(), ms, ok: false, hab: "lembrar" });
  }
  for (const t of data2.chat ?? []) {
    if (t.role !== "user" || !t.at) continue;
    const vistas = new Set((t.content.toLowerCase().match(PALAVRA) ?? []).filter((w) => vocabulario.has(w) && !COMUNS.has(w)));
    for (const en of vistas) out.push({ en, ms: new Date(t.at).getTime(), ok: true, hab: "usar" });
  }
  return out.filter((e) => e.en && Number.isFinite(e.ms)).sort((a, b) => a.ms - b.ms);
}
var diaLocal = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
var faixaDe = (ms) => {
  const h = new Date(ms).getHours();
  return h < 5 ? "Madrugada" : h < 12 ? "Manh\xE3" : h < 18 ? "Tarde" : "Noite";
};
var mediana = (xs) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};
var sigmoide = (x) => 1 / (1 + Math.exp(-x));
function memoria(evs, agora = Date.now()) {
  const porPalavra = /* @__PURE__ */ new Map();
  for (const e of evs) porPalavra.set(e.en, [...porPalavra.get(e.en) ?? [], e]);
  const theta = { reconhecer: 0, lembrar: 0, ouvir: 0, falar: 0, usar: 0 };
  const contagem = {};
  const beta = /* @__PURE__ */ new Map();
  const semanas = [];
  for (let k = 7; k >= 0; k--) semanas.push(agora - k * 7 * DIA_MS);
  const historico = { reconhecer: [], lembrar: [], ouvir: [], falar: [], usar: [] };
  let proxima = 0;
  const fotografar = (ate) => {
    while (proxima < semanas.length && semanas[proxima] <= ate) {
      Object.keys(theta).forEach((h) => historico[h].push(Math.round(100 * sigmoide(theta[h]))));
      proxima++;
    }
  };
  for (const e of evs) {
    fotografar(e.ms);
    if (e.hab === "usar") continue;
    const b = beta.get(e.en) ?? 0;
    const p = sigmoide(theta[e.hab] - b);
    const n = contagem[e.hab] = (contagem[e.hab] ?? 0) + 1;
    const nw = contagem[`w:${e.en}`] = (contagem[`w:${e.en}`] ?? 0) + 1;
    theta[e.hab] += 0.8 / (1 + 0.05 * n) * ((e.ok ? 1 : 0) - p);
    beta.set(e.en, b - 0.8 / (1 + 0.05 * nw) * ((e.ok ? 1 : 0) - p));
  }
  fotografar(agora + 1);
  const palavras = [];
  const testes = {};
  for (const [en, lista] of porPalavra) {
    let s = null, d = 5, ultimoDia = "", ultimaMs = 0, lapsos = 0, dias = 0, nivel = 0;
    let estudoAnterior = null;
    const habs = /* @__PURE__ */ new Set();
    for (const e of lista) {
      if (e.ok) {
        nivel = Math.max(nivel, NIVEL_DA_HAB[e.hab]);
        habs.add(e.hab);
      }
      const dia = diaLocal(e.ms);
      if (dia === ultimoDia) continue;
      if (estudoAnterior && e.ms - estudoAnterior.ms <= 3.5 * DIA_MS && e.ms - estudoAnterior.ms >= 0.5 * DIA_MS) {
        const f2 = testes[faixaDe(estudoAnterior.ms)] ??= { n: 0, ok: 0 };
        f2.n++;
        if (e.ok) f2.ok++;
      }
      const g = nota(e);
      const r = revisar(s, d, s === null ? 0 : (e.ms - ultimaMs) / DIA_MS, g);
      s = r.s;
      d = r.d;
      if (g === 1 && dias > 0) lapsos++;
      dias++;
      ultimoDia = dia;
      ultimaMs = e.ms;
      estudoAnterior = { dia, ms: e.ms };
    }
    palavras.push({
      en,
      estabilidade: s ?? 0.1,
      dificuldade: d,
      retencao: retencao((agora - ultimaMs) / DIA_MS, s ?? 0.1),
      ultima: ultimaMs,
      dias,
      lapsos,
      respostas: lista.length,
      nivel,
      habs: [...habs]
    });
  }
  const habilidades = Object.keys(theta).map((hab) => {
    const delas = evs.filter((e) => e.hab === hab);
    const certas = delas.filter((e) => e.ok);
    const tempo = mediana(certas.map((e) => e.tempo).filter((t) => t !== void 0));
    return {
      hab,
      rotulo: ROTULO_HAB[hab],
      respostas: delas.length,
      taxa: delas.length ? certas.length / delas.length : null,
      segundos: tempo === null ? null : Math.round(tempo / 100) / 10,
      nivel: Math.round(100 * sigmoide(theta[hab])),
      historico: historico[hab]
    };
  });
  const comMemoria = palavras.filter((p) => p.dias > 0);
  return {
    palavras,
    lembradasHoje: Math.round(comMemoria.reduce((s, p) => s + p.retencao, 0)),
    retencaoMedia: comMemoria.length ? comMemoria.reduce((s, p) => s + p.retencao, 0) / comMemoria.length : null,
    estabilidadeMediana: mediana(comMemoria.map((p) => p.estabilidade)),
    emRisco: comMemoria.filter((p) => p.retencao < 0.85).sort((a, b) => a.retencao - b.retencao).slice(0, 12),
    // cada degrau conta quem já acertou aquela habilidade (pronunciar não prova que entende ouvindo)
    escada: DEGRAUS.map((rotulo, i) => ({
      rotulo,
      quantas: i === 0 ? palavras.length : palavras.filter((p) => p.habs.includes(HAB_DO_NIVEL[i])).length
    })),
    habilidades,
    retencaoPorFaixa: ["Madrugada", "Manh\xE3", "Tarde", "Noite"].map((nome) => {
      const f2 = testes[nome];
      return { nome, testes: f2?.n ?? 0, taxa: f2?.n ? f2.ok / f2.n : null };
    })
  };
}

// src/core/estudo/foco.ts
var MAXIMO_FOCO = 20;
var unicos = (xs) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
function inglesDe(ref) {
  const item = resolve(ref);
  return (item?.word ?? item?.text)?.replace(/[?!.]+$/, "").trim() || void 0;
}
function palavrasDaSessao(s) {
  const refs = [...s.refs, ...s.palavras?.novas ?? [], ...s.palavras?.revisar ?? [], ...s.palavras?.apoio ?? []];
  return unicos(refs.filter((r) => ["word", "expression"].includes(parseRef(r).kind)).map((r) => inglesDe(r) ?? ""));
}
function aulaEmFoco(data2, hoje2 = today()) {
  const pelaMetade = data2.sessions.filter((s) => s.status === "in_progress").sort((a, b) => (b.startedAt ?? b.date).localeCompare(a.startedAt ?? a.date))[0];
  const deHoje = data2.sessions.filter((s) => s.date === hoje2 && s.status === "planned")[0];
  const recente = data2.sessions.filter((s) => s.status === "done" && s.date >= addDays(hoje2, -3) && s.date <= hoje2).sort((a, b) => (b.finishedAt ?? b.date).localeCompare(a.finishedAt ?? a.date))[0];
  const sessao2 = pelaMetade ?? deHoje ?? recente;
  return sessao2 ? { sessao: sessao2, palavras: palavrasDaSessao(sessao2), continuar: sessao2 === pelaMetade } : void 0;
}
function focoDeEstudo(data2, hoje2 = today()) {
  const refParaEn = (ref) => inglesDe(ref);
  const vocab = new Set(content.words.map((w) => w.word.toLowerCase()));
  const mem = memoria(eventos(data2, refParaEn, vocab), (/* @__PURE__ */ new Date(`${hoje2}T23:59:59`)).getTime());
  const aula = aulaEmFoco(data2, hoje2);
  return {
    aula,
    revisar: mem.emRisco,
    lembradasHoje: mem.lembradasHoje,
    palavras: unicos([...aula?.palavras ?? [], ...mem.emRisco.map((p) => p.en)]).slice(0, MAXIMO_FOCO)
  };
}
function palavrasDoFoco(data2, param) {
  if (!param || param === "tudo") return [];
  if (param === "revisar") return focoDeEstudo(data2).revisar.map((p) => p.en);
  if (param === "agora") return focoDeEstudo(data2).palavras;
  if (param.startsWith("aula:")) {
    const s = data2.sessions.find((x) => x.id === param.slice(5));
    return s ? palavrasDaSessao(s) : [];
  }
  if (param.startsWith("palavras:")) return unicos(param.slice(9).split(","));
  return [];
}
function comFoco(itens, foco, chave, minimo = 10) {
  if (!foco.length) return itens;
  const alvo = new Set(foco.map((w) => w.toLowerCase()));
  const dentro = itens.filter((x) => alvo.has(chave(x).toLowerCase()));
  if (!dentro.length) return itens;
  const fora = itens.filter((x) => !alvo.has(chave(x).toLowerCase()));
  for (let i = fora.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fora[i], fora[j]] = [fora[j], fora[i]];
  }
  return [...dentro, ...fora.slice(0, Math.max(0, minimo - dentro.length))];
}

// ferramentas-teste/foco.test.ts
var falhas = 0;
var confere = (nome, ok, extra) => {
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}`, ok ? "" : JSON.stringify(extra));
  if (!ok) falhas++;
};
var palavra = (id, word, pt) => ({
  id,
  word,
  type: "palavra",
  translations: [{ text: pt }],
  core_meaning: pt,
  uses: [],
  variations: [],
  related_words: [],
  examples: [],
  pronunciation: { ipa: "" }
});
var words = [palavra("work", "work", "trabalho"), palavra("free", "free", "livre"), palavra("tired", "tired", "cansado"), palavra("ship", "ship", "navio")];
setUserContent({ words, expressions: [{ id: "thank-you", text: "Thank you!", translation: "Obrigado", words: [], context: "", meaning: "", examples: [] }] });
var hoje = "2026-10-05";
var sessao = (id, status, date = hoje, extra = {}) => ({
  id,
  date,
  weekStart: "2026-10-05",
  kind: "new",
  title: `Aula ${id}`,
  objective: "",
  refs: ["word:work", "expression:thank-you"],
  copyRefs: [],
  status,
  createdAt: `${date}T08:00:00Z`,
  ...extra
});
var dezDias = (/* @__PURE__ */ new Date("2026-09-25T10:00:00Z")).toISOString();
var data = {
  version: 1,
  counter: {},
  weeks: [],
  worksheets: [],
  history: [],
  chat: [],
  sessions: [sessao("A", "done", "2026-10-04"), sessao("B", "planned", hoje, { palavras: { revisar: ["word:free"] } })],
  atividades: [{ id: "x", quando: dezDias, tipo: "jogo", origem: "flashcards", duracaoSeg: 60, acertos: 1, erros: 1, palavras: [{ en: "ship", ok: true, hab: "lembrar" }, { en: "ship", ok: false, hab: "lembrar", t: 5 }] }]
};
confere("palavras da sess\xE3o (palavra + express\xE3o sem pontua\xE7\xE3o + revisar)", JSON.stringify(palavrasDaSessao(data.sessions[1])) === JSON.stringify(["work", "Thank you", "free"]), palavrasDaSessao(data.sessions[1]));
confere("aula de hoje ainda n\xE3o feita vem primeiro", aulaEmFoco(data, hoje)?.sessao.id === "B", aulaEmFoco(data, hoje)?.sessao.id);
data.sessions.push(sessao("C", "in_progress", "2026-10-03", { startedAt: "2026-10-03T10:00:00Z" }));
confere("aula pela metade tem prioridade e pode continuar", aulaEmFoco(data, hoje)?.sessao.id === "C" && aulaEmFoco(data, hoje)?.continuar === true);
var f = focoDeEstudo(data, hoje);
confere("ship est\xE1 quase esquecida", f.revisar.some((p) => p.en === "ship"), f.revisar);
confere("foco: aula primeiro, depois as quase esquecidas", f.palavras[0] === "work" && f.palavras.includes("ship"), f.palavras);
confere("?foco=revisar", palavrasDoFoco(data, "revisar").includes("ship"));
confere("?foco=aula:B", palavrasDoFoco(data, "aula:B").includes("free"));
confere("?foco=palavras:a,b", JSON.stringify(palavrasDoFoco(data, "palavras:work, tired")) === '["work","tired"]', palavrasDoFoco(data, "palavras:work, tired"));
confere("sem foco, lista vazia", palavrasDoFoco(data, null).length === 0 && palavrasDoFoco(data, "tudo").length === 0);
var pool = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "work", "free"].map((en) => ({ en }));
var focado = comFoco(pool, ["free", "work"], (x) => x.en, 6);
confere("comFoco: focadas + completa at\xE9 o m\xEDnimo", focado.length === 6 && focado[0].en === "work" && focado[1].en === "free", focado);
confere("comFoco: sem foco devolve tudo", comFoco(pool, [], (x) => x.en).length === pool.length);
confere("comFoco: foco fora do conjunto devolve tudo", comFoco(pool, ["zzz"], (x) => x.en).length === pool.length);
console.log(falhas ? `
${falhas} falha(s)` : "\ntudo certo");
if (falhas) process.exit(1);
