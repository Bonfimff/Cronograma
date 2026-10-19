import { useMemo, useState, type ReactNode } from 'react';
import type { ContentRef, ExerciseType, FraseAula, Habilidade, SessionKind, TreinoChat, UserData } from '../../core/types';
import { KIND_LABEL } from '../../core/planning/weeks';
import { checkPackage, type WeekPackage } from '../../core/planning/weekPackage';
import {
  LIMITES, pacoteDoRascunho, type ExercicioRascunho, type Papel, type PalavraNova, type RascunhoAula,
} from '../../core/planning/rascunhoAula';
import { buscarNoAluno } from '../../core/professor/montagem';

/**
 * Montar uma aula à mão, com tudo o que o pacote semanal permite. Serve ao aluno
 * (grava neste aparelho) e ao professor (grava na conta do aluno): quem usa passa
 * o vocabulário de quem vai estudar e o que fazer com o pacote pronto.
 */

export interface ResultadoSalvar { ok: boolean; erros: string[]; mensagem?: string }

const TIPOS = Object.keys(KIND_LABEL) as SessionKind[];
const TIPO_DICA: Record<SessionKind, string> = {
  new: 'apresenta palavras que o aluno ainda não sabe',
  practice: 'usa o que foi visto há pouco, com mais exercícios',
  review: 'volta ao que está sendo esquecido',
  reinforce: 'insiste no que o aluno errou',
  consolidate: 'junta tudo da semana numa situação real',
};
const EXERCICIOS: { tipo: ExerciseType; nome: string; dica: string; opcoes?: string }[] = [
  { tipo: 'choice', nome: 'Escolha', dica: 'o aluno escolhe a certa entre as alternativas', opcoes: 'Alternativas, separadas por |  (ex.: How | What | Where)' },
  { tipo: 'fill', nome: 'Completar', dica: 'frase com lacuna ____ para preencher' },
  { tipo: 'build', nome: 'Montar a frase', dica: 'o aluno ordena as peças', opcoes: 'Peças, separadas por |  (ex.: how | are | you)' },
  { tipo: 'match', nome: 'Ligar pares', dica: 'liga inglês e português', opcoes: 'Pares "inglês = português", separados por |  (ex.: order = pedir | bill = conta)' },
  { tipo: 'translate', nome: 'Traduzir', dica: 'de português para inglês ou ao contrário' },
  { tipo: 'qa', nome: 'Pergunta e resposta', dica: 'responder uma pergunta em inglês' },
  { tipo: 'produce', nome: 'Produção livre', dica: 'escrever algo próprio; a resposta é só um modelo' },
];
const HABILIDADES: { h: Habilidade; nome: string }[] = [
  { h: 'reconhecer', nome: 'reconhecer' }, { h: 'lembrar', nome: 'lembrar' }, { h: 'ouvir', nome: 'ouvir' },
  { h: 'falar', nome: 'falar' }, { h: 'usar', nome: 'usar' },
];
const PAPEIS: { p: Papel; nome: string; dica: string }[] = [
  { p: 'novas', nome: 'O que a aula ensina', dica: `o foco da aula, até ${LIMITES.novas}. Cada uma vira cartão com explicação, exemplos e pronúncia.` },
  { p: 'revisar', nome: 'Para revisar', dica: 'do vocabulário, quase esquecidas. Voltam no aquecimento e nos exercícios.' },
  { p: 'apoio', nome: 'De apoio', dica: 'já firmes. Aparecem nos exemplos e exercícios, sem cartão próprio.' },
];

/** Uma parte da aula: o título, onde aparece para o aluno e os campos. */
function Parte({ titulo, onde, aberta, children }: { titulo: string; onde: string; aberta?: boolean; children: ReactNode }) {
  return (
    <details className="ed-parte" open={aberta}>
      <summary><b>{titulo}</b><span className="muted small-text">{onde}</span></summary>
      <div className="ed-corpo">{children}</div>
    </details>
  );
}

function Dica({ children }: { children: ReactNode }) {
  return <small className="ed-dica">{children}</small>;
}

/** Lista de linhas de texto, com limite opcional. */
function Linhas({ valor, mudar, rotulo, exemplo, max }: {
  valor: string[]; mudar: (v: string[]) => void; rotulo: string; exemplo: string; max?: number;
}) {
  return (
    <div className="ed-lista">
      {valor.map((v, i) => (
        <div key={i} className="ed-linha">
          <input value={v} placeholder={exemplo} aria-label={`${rotulo} ${i + 1}`} onChange={(e) => mudar(valor.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className="ghost small" aria-label="Tirar" onClick={() => mudar(valor.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {(!max || valor.length < max) && (
        <button type="button" className="ghost small" onClick={() => mudar([...valor, ''])}>+ {rotulo}{max ? ` (${valor.length}/${max})` : ''}</button>
      )}
    </div>
  );
}

/** Frases em inglês com a tradução. */
function Frases({ valor, mudar, rotulo, exemplo }: {
  valor: FraseAula[]; mudar: (v: FraseAula[]) => void; rotulo: string; exemplo: FraseAula;
}) {
  const trocar = (i: number, f: Partial<FraseAula>) => mudar(valor.map((x, j) => (j === i ? { ...x, ...f } : x)));
  return (
    <div className="ed-lista">
      {valor.map((f, i) => (
        <div key={i} className="ed-linha ed-frase">
          <input value={f.en} placeholder={exemplo.en} aria-label={`${rotulo} ${i + 1} em inglês`} onChange={(e) => trocar(i, { en: e.target.value })} />
          <input value={f.pt} placeholder={exemplo.pt} aria-label={`${rotulo} ${i + 1} em português`} onChange={(e) => trocar(i, { pt: e.target.value })} />
          <button type="button" className="ghost small" aria-label="Tirar" onClick={() => mudar(valor.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button type="button" className="ghost small" onClick={() => mudar([...valor, { en: '', pt: '' }])}>+ {rotulo}</button>
    </div>
  );
}

const novaVazia = (en: string, papel: Papel): PalavraNova => ({ en, pt: '', papel, tipo: '', significado: '', ipa: '', exemplos: [] });

/** Escolher as palavras de um papel: do vocabulário ou novas. */
function Palavras({ dados, papel, r, mudar, nome }: {
  dados: UserData; papel: Papel; r: RascunhoAula; mudar: (r: RascunhoAula) => void; nome: (ref: ContentRef) => string;
}) {
  const [termo, setTermo] = useState('');
  const todas = new Set([...r.palavras.novas, ...r.palavras.revisar, ...r.palavras.apoio]);
  const achados = buscarNoAluno(dados, termo, 8).filter((a) => !todas.has(a.ref));
  const lista = r.palavras[papel];
  const novas = r.palavrasNovas.filter((n) => n.papel === papel);
  const cheio = papel === 'novas' && lista.length + novas.length >= LIMITES.novas;
  const pi = PAPEIS.find((x) => x.p === papel)!;

  const tirarNova = (n: PalavraNova) => mudar({ ...r, palavrasNovas: r.palavrasNovas.filter((x) => x !== n) });
  const trocarNova = (n: PalavraNova, m: Partial<PalavraNova>) =>
    mudar({ ...r, palavrasNovas: r.palavrasNovas.map((x) => (x === n ? { ...x, ...m } : x)) });

  return (
    <div className="ed-papel">
      <h4>{pi.nome}</h4>
      <Dica>{pi.dica}</Dica>
      {(lista.length > 0 || novas.length > 0) && (
        <p className="chips">
          {lista.map((ref) => (
            <button key={ref} type="button" className="chip" title="Tirar da aula"
              onClick={() => mudar({ ...r, palavras: { ...r.palavras, [papel]: lista.filter((x) => x !== ref) } })}>{nome(ref)} ×</button>
          ))}
        </p>
      )}
      {novas.map((n, i) => (
        <div key={i} className="ed-nova">
          <div className="ed-linha">
            <b>{n.en}</b> <span className="muted small-text">palavra nova no vocabulário</span>
            <button type="button" className="ghost small" onClick={() => tirarNova(n)}>Tirar</button>
          </div>
          <div className="ed-grade">
            <label>Tradução *<input required value={n.pt} placeholder="pedir" onChange={(e) => trocarNova(n, { pt: e.target.value })} /></label>
            <label>Classe<input value={n.tipo} placeholder="verbo, substantivo…" onChange={(e) => trocarNova(n, { tipo: e.target.value })} /></label>
            <label>Pronúncia<input value={n.ipa} placeholder="/ˈɔːrdər/" onChange={(e) => trocarNova(n, { ipa: e.target.value })} /></label>
          </div>
          <label>Significado<input value={n.significado} placeholder="pedir algo num restaurante ou loja" onChange={(e) => trocarNova(n, { significado: e.target.value })} /></label>
          <Dica>Exemplos: aparecem no cartão da palavra e na ficha do Conteúdo.</Dica>
          <Frases valor={n.exemplos} mudar={(v) => trocarNova(n, { exemplos: v })} rotulo="exemplo" exemplo={{ en: 'Can I order now?', pt: 'Posso pedir agora?' }} />
        </div>
      ))}
      {!cheio && (
        <>
          <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="buscar no vocabulário ou digitar uma palavra nova" />
          {achados.length > 0 && (
            <ul className="prof-achados">
              {achados.map((a) => (
                <li key={a.ref}>
                  <button type="button" className="ghost small" onClick={() => { mudar({ ...r, palavras: { ...r.palavras, [papel]: [...lista, a.ref] } }); setTermo(''); }}>
                    + <b>{a.titulo}</b> <span className="muted">{a.detalhe}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {termo.trim().length >= 2 && !r.palavrasNovas.some((n) => n.en.toLowerCase() === termo.trim().toLowerCase()) && (
            <button type="button" className="ghost small" onClick={() => { mudar({ ...r, palavrasNovas: [...r.palavrasNovas, novaVazia(termo.trim(), papel)] }); setTermo(''); }}>
              + criar "{termo.trim()}" como palavra nova
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function EditorDeAula({ dados, inicial, salvar, cancelar, quem }: {
  /** dados de quem vai estudar a aula (o vocabulário e as aulas dele) */
  dados: UserData;
  inicial: RascunhoAula;
  salvar: (pkg: WeekPackage) => Promise<ResultadoSalvar> | ResultadoSalvar;
  cancelar?: () => void;
  /** "você" ou "o aluno": muda o texto das dicas */
  quem: string;
}) {
  const [r, setR] = useState(inicial);
  const [gravando, setGravando] = useState(false);
  const [res, setRes] = useState<ResultadoSalvar | null>(null);
  const mudar = (m: Partial<RascunhoAula>) => { setR((x) => ({ ...x, ...m })); setRes(null); };

  const nome = (ref: ContentRef) => {
    const [tipo, id] = ref.split(':');
    const c = dados.content ?? {};
    return (tipo === 'word' ? c.words?.find((x) => x.id === id)?.word
      : tipo === 'expression' ? c.expressions?.find((x) => x.id === id)?.text
      : tipo === 'pattern' ? c.patterns?.find((x) => x.id === id)?.formula
      : c.grammar?.find((x) => x.id === id)?.title) ?? id;
  };

  const pkg = useMemo(() => pacoteDoRascunho(r, dados), [r, dados]);
  const conferencia = useMemo(() => (r.title.trim() ? checkPackage(dados, pkg, { replacePlanned: false }) : null), [pkg, dados, r.title]);
  const aquecer = [...r.palavras.revisar, ...r.palavras.apoio, ...r.palavras.novas].filter((x) => x.startsWith('word:'));
  const ex = (i: number, m: Partial<ExercicioRascunho>) => mudar({ exercicios: r.exercicios.map((x, j) => (j === i ? { ...x, ...m } : x)) });
  const tr = (i: number, m: Partial<TreinoChat>) => mudar({ treino: r.treino.map((x, j) => (j === i ? { ...x, ...m } : x)) });

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setGravando(true);
    try {
      const x = await salvar(pkg);
      setRes(x);
      if (x.ok && !r.id) setR({ ...inicial, date: r.date });
    } finally {
      setGravando(false);
    }
  };

  return (
    <form className="form editor-aula" onSubmit={enviar}>
      <p className="muted">
        Só o <b>dia</b>, o <b>tipo</b> e o <b>título</b> são obrigatórios. O que ficar em branco o app monta sozinho a partir das palavras.
        Quanto mais você preencher, mais a aula fica do seu jeito.
      </p>

      <Parte titulo="1. O básico" onde="aparece na lista de aulas, no topo da aula e na folha impressa" aberta>
        <div className="ed-grade">
          <label>Dia *<input type="date" required value={r.date} onChange={(e) => mudar({ date: e.target.value })} /></label>
        </div>
        <div>
          <div className="seg" role="group" aria-label="Tipo de aula">
            {TIPOS.map((k) => <button key={k} type="button" className={r.kind === k ? 'on' : ''} onClick={() => mudar({ kind: k })}>{KIND_LABEL[k]}</button>)}
          </div>
          <Dica>{KIND_LABEL[r.kind]}: {TIPO_DICA[r.kind]}.</Dica>
        </div>
        <label>Título *<input required maxLength={120} value={r.title} onChange={(e) => mudar({ title: e.target.value })} placeholder="Pedindo comida no restaurante" /></label>
        <label>Objetivo<textarea rows={2} value={r.objective} onChange={(e) => mudar({ objective: e.target.value })} placeholder="Pedir um prato, uma bebida e a conta com educação" />
          <Dica>Uma frase sobre o que a aula trabalha. Aparece abaixo do título.</Dica></label>
        <label>Quando usar<input maxLength={140} value={r.whenToUse} onChange={(e) => mudar({ whenToUse: e.target.value })} placeholder="Em restaurantes, lanchonetes e cafés" />
          <Dica>Resumo curto que sai na folha impressa (cabe cerca de 116 letras).</Dica></label>
      </Parte>

      <Parte titulo="2. Palavras da aula" onde="viram os cartões da aula, os exemplos e a base dos exercícios" aberta>
        {PAPEIS.map((x) => <Palavras key={x.p} dados={dados} papel={x.p} r={r} mudar={setR} nome={nome} />)}
      </Parte>

      <Parte titulo="3. Cartões da aula" onde="a sequência que o aluno percorre no aplicativo">
        <label>Aquecimento
          <select value={r.aquecimento} onChange={(e) => mudar({ aquecimento: e.target.value })}>
            <option value="">automático (a primeira de "para revisar")</option>
            {aquecer.map((x) => <option key={x} value={x}>{nome(x)}</option>)}
          </select>
          <Dica>A palavra que abre a aula como lembrança.</Dica></label>
        <div><h4>Escuta</h4><Dica>Frases que {quem} ouve e tenta entender antes de ver o texto (treina ouvir).</Dica>
          <Frases valor={r.escuta} mudar={(v) => mudar({ escuta: v })} rotulo="frase de escuta" exemplo={{ en: "I'd like the chicken, please.", pt: 'Eu queria o frango, por favor.' }} /></div>
        <div><h4>Fala</h4><Dica>Frases que {quem} repete em voz alta; o microfone confere a pronúncia (treina falar).</Dica>
          <Frases valor={r.fala} mudar={(v) => mudar({ fala: v })} rotulo="frase de fala" exemplo={{ en: 'Can I have the bill?', pt: 'Pode trazer a conta?' }} /></div>
        <div><h4>Missão</h4><Dica>Uma situação real e o que dizer nela, passo a passo (treina usar).</Dica>
          <label>Situação<input value={r.missao.situacao} onChange={(e) => mudar({ missao: { ...r.missao, situacao: e.target.value } })} placeholder="Você chega num restaurante em Nova York" /></label>
          <Frases valor={r.missao.tarefas} mudar={(v) => mudar({ missao: { ...r.missao, tarefas: v } })} rotulo="tarefa" exemplo={{ en: 'A table for two, please.', pt: 'Uma mesa para dois, por favor.' }} /></div>
      </Parte>

      <Parte titulo="4. Folha impressa" onde="o papel que o aluno preenche à mão e escaneia depois">
        <div><h4>Conceito principal (✎ COPIE)</h4><Dica>O que {quem} copia à mão. Até {LIMITES.copy} linhas.</Dica>
          <Linhas valor={r.copy} mudar={(v) => mudar({ copy: v })} rotulo="linha" exemplo="order = pedir · I'd like… = Eu queria…" max={LIMITES.copy} /></div>
        <div><h4>Tente sem consultar</h4><Dica>Perguntas rápidas para responder de memória. Até {LIMITES.quiz}.</Dica>
          <Linhas valor={r.quiz} mudar={(v) => mudar({ quiz: v })} rotulo="pergunta" exemplo="Como se pede a conta?" max={LIMITES.quiz} /></div>
        <label>Minha prática<textarea rows={2} value={r.practice} onChange={(e) => mudar({ practice: e.target.value })} placeholder="Escreva o seu pedido completo num restaurante" />
          <Dica>A instrução da escrita livre no fim da folha.</Dica></label>
      </Parte>

      <Parte titulo="5. Explicação no aplicativo" onde="o primeiro cartão da aula, antes das palavras">
        <label>Introdução<textarea rows={3} value={r.intro} onChange={(e) => mudar({ intro: e.target.value })} placeholder="Hoje você vai aprender a pedir comida…" />
          <Dica>A explicação do professor, com as suas palavras.</Dica></label>
        <label>Situação de uso<input value={r.contexto} onChange={(e) => mudar({ contexto: e.target.value })} placeholder="Num restaurante, falando com o garçom" /></label>
        <div><h4>Dicas</h4><Linhas valor={r.dicas} mudar={(v) => mudar({ dicas: v })} rotulo="dica" exemplo='Use "I&apos;d like" em vez de "I want": soa mais educado' /></div>
      </Parte>

      <Parte titulo={`6. Exercícios${r.exercicios.length ? ` (${r.exercicios.length})` : ''}`} onde="a parte de praticar da aula; sem nenhum, o app gera a partir das palavras">
        <Dica>Uma aula completa tem de 8 a 12, misturando os tipos. A habilidade vai para o relatório de progresso.</Dica>
        {r.exercicios.map((e, i) => {
          const t = EXERCICIOS.find((x) => x.tipo === e.type)!;
          return (
            <div key={i} className="ed-exercicio">
              <div className="ed-linha">
                <b>{i + 1}.</b>
                <select value={e.type} aria-label="Tipo de exercício" onChange={(ev) => ex(i, { type: ev.target.value as ExerciseType })}>
                  {EXERCICIOS.map((x) => <option key={x.tipo} value={x.tipo}>{x.nome}</option>)}
                </select>
                <select value={e.habilidade ?? ''} aria-label="Habilidade" onChange={(ev) => ex(i, { habilidade: (ev.target.value || undefined) as Habilidade | undefined })}>
                  <option value="">habilidade: automática</option>
                  {HABILIDADES.map((h) => <option key={h.h} value={h.h}>{h.nome}</option>)}
                </select>
                <button type="button" className="ghost small" aria-label="Tirar exercício" onClick={() => mudar({ exercicios: r.exercicios.filter((_, j) => j !== i) })}>×</button>
              </div>
              <Dica>{t.dica}.</Dica>
              <label>Enunciado<input value={e.prompt} onChange={(ev) => ex(i, { prompt: ev.target.value })} placeholder={e.type === 'fill' ? "I'd ____ the fish, please." : 'Como você pede a conta?'} /></label>
              {e.type !== 'match' && (
                <label>Resposta{e.type === 'produce' ? ' modelo' : ''}<input value={e.answer} onChange={(ev) => ex(i, { answer: ev.target.value })} placeholder="Can I have the bill? | Check, please." />
                  <Dica>Se mais de uma estiver certa, separe com |</Dica></label>
              )}
              {t.opcoes && <label>{t.opcoes.split('  ')[0]}<input value={e.options} onChange={(ev) => ex(i, { options: ev.target.value })} placeholder={t.opcoes.split('  ')[1]?.replace(/[()]/g, '').replace('ex.: ', '')} /></label>}
            </div>
          );
        })}
        <button type="button" className="ghost small" onClick={() => mudar({ exercicios: [...r.exercicios, { type: 'choice', prompt: '', answer: '', options: '' }] })}>+ exercício</button>
      </Parte>

      <Parte titulo="7. Treino na conversa" onde="perguntas que o amigo de treino faz no chat, ligadas a esta aula">
        {r.treino.map((t, i) => (
          <div key={i} className="ed-exercicio">
            <div className="ed-linha">
              <input value={t.en} placeholder="What would you like to eat?" aria-label="Pergunta em inglês" onChange={(e) => tr(i, { en: e.target.value })} />
              <button type="button" className="ghost small" aria-label="Tirar" onClick={() => mudar({ treino: r.treino.filter((_, j) => j !== i) })}>×</button>
            </div>
            <div className="ed-grade">
              <input value={t.pt ?? ''} placeholder="O que você gostaria de comer?" aria-label="Tradução" onChange={(e) => tr(i, { pt: e.target.value })} />
              <input value={t.resposta ?? ''} placeholder="I'd like ____, please." aria-label="Modelo de resposta" onChange={(e) => tr(i, { resposta: e.target.value })} />
            </div>
          </div>
        ))}
        <Dica>Tradução e modelo de resposta (mostrado como dica) são opcionais.</Dica>
        <button type="button" className="ghost small" onClick={() => mudar({ treino: [...r.treino, { en: '' }] })}>+ pergunta</button>
      </Parte>

      <Parte titulo="8. Resultado esperado" onde="aparece no fim da aula, para o aluno se avaliar">
        <label>Ao final, {quem} consegue…<input value={r.resultado} onChange={(e) => mudar({ resultado: e.target.value })} placeholder="pedir uma refeição completa e a conta" /></label>
        <div><h4>Critérios</h4><Dica>Como saber que conseguiu.</Dica>
          <Linhas valor={r.criterios} mudar={(v) => mudar({ criterios: v })} rotulo="critério" exemplo={'Usa "I\'d like" para pedir'} /></div>
      </Parte>

      {conferencia && (conferencia.errors.length > 0 || conferencia.warnings.length > 0 || conferencia.integracao.length > 0) && (
        <section className="ed-conferencia">
          <h3>Conferência</h3>
          {conferencia.errors.length > 0 && <ul className="check-list err">{conferencia.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          {conferencia.integracao.length > 0 && <ul className="check-list">{conferencia.integracao.map((m, i) => <li key={i} className={m.ok ? 'ok' : 'warn'}>{m.ok ? '✓ ' : '⚠ '}{m.texto}</li>)}</ul>}
          {conferencia.warnings.length > 0 && <ul className="check-list warn">{conferencia.warnings.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        </section>
      )}
      {res && !res.ok && res.erros.length > 0 && <ul className="check-list err">{res.erros.map((m, i) => <li key={i}>{m}</li>)}</ul>}
      {res?.ok && res.mensagem && <p className="ok-line">{res.mensagem}</p>}
      <div className="actions">
        {cancelar && <button type="button" className="ghost" onClick={cancelar}>Cancelar</button>}
        <button className="primary" type="submit" disabled={gravando || !!conferencia?.errors.length}>
          {gravando ? 'Gravando…' : r.id ? 'Salvar alterações' : 'Gravar aula'}
        </button>
      </div>
    </form>
  );
}
