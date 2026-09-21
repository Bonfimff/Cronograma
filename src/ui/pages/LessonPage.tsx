import { useMemo, useState } from 'react';
import { go, useData } from '../hooks';
import { store } from '../../core/storage/store';
import { findSession, saveExerciseScore } from '../../core/sessions/sessions';
import { examplesBlock, explanationBlock, speak, variationsBlock } from '../../core/lessons/lesson';
import { buildExercises } from '../../core/exercises/exercises';
import { copyBlock } from '../../core/content/repository';
import { Empty } from '../components/common';
import { ExerciseView } from '../components/ExerciseView';

const STEPS = ['Explicação', 'Exemplos', 'Variações', 'Prática', 'Avaliação'];
const VERBS = ['Entender', 'Observar', 'Relacionar', 'Praticar', 'Avaliar'];

function Say({ text }: { text: string }) {
  return <button className="say" onClick={() => speak(text)} aria-label={`Ouvir: ${text}`}>▶</button>;
}

export function LessonPage({ id }: { id: string }) {
  const data = useData();
  const s = findSession(data, id);
  const [step, setStep] = useState(0);
  const [score, setScore] = useState<Record<string, boolean>>({});
  // exercícios gerados uma vez por abertura da aula
  const exercises = useMemo(() => (s ? buildExercises(data, s) : []), [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <Empty>Sessão não encontrada.</Empty>;

  const explain = explanationBlock(s.refs);
  const examples = examplesBlock(s.refs);
  const variations = variationsBlock(s.refs);

  const answered = Object.keys(score).length;
  const correct = Object.values(score).filter(Boolean).length;

  const next = () => {
    if (step === 3) store.update((d) => saveExerciseScore(d, s.id, answered, correct));
    setStep((x) => Math.min(x + 1, STEPS.length - 1));
    window.scrollTo(0, 0);
  };

  return (
    <div className="lesson">
      <header className="lesson-head">
        <a href={`#/sessao/${s.id}`} className="back">‹ {s.title}</a>
        <ol className="steps">
          {STEPS.map((t, i) => (
            <li key={t} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <button onClick={() => setStep(i)}>{t}</button>
            </li>
          ))}
        </ol>
      </header>

      <p className="eyebrow">Bloco {step + 1} · {VERBS[step]}</p>

      {step === 0 && (s.expected || s.app) && (
        <article className="brief">
          {s.expected && <p><span className="eyebrow">Ao final você deve conseguir</span><br /><strong>{s.expected.result}</strong></p>}
          {s.app?.context && <p><span className="eyebrow">Situação</span><br />{s.app.context}</p>}
          {s.app?.intro && <p>{s.app.intro}</p>}
          {s.app?.tips?.length ? <ul>{s.app.tips.map((t) => <li key={t}>{t}</li>)}</ul> : null}
        </article>
      )}

      {step === 0 && s.sheet?.copy?.length ? (
        <div className="copybox">
          <p className="copy-mark">✎ COPIE na folha — Conceito principal</p>
          {s.sheet.copy.slice(0, 3).map((l) => <p key={l}>{l}</p>)}
        </div>
      ) : null}

      {step === 0 && explain.map((e) => (
        <article key={e.ref} className="concept">
          <p className="concept-kind">{e.kind}</p>
          <h2 className="en">{e.title} {e.speak && <Say text={e.speak} />}</h2>
          {e.subtitle && <p className="muted">{e.subtitle}</p>}
          {e.pronunciation && <p className="pron">{e.pronunciation}</p>}
          {e.translations && <p className="tr">{e.translations.join(' · ')}</p>}
          <p>{e.text}</p>
          {e.points && <ul>{e.points.map((p) => <li key={p}>{p}</li>)}</ul>}
          {s.copyRefs.includes(e.ref) && copyBlock(e.ref) && (
            <div className="copybox">
              <p className="copy-mark">✎ COPIE na folha</p>
              {copyBlock(e.ref)!.lines.map((l) => <p key={l}>{l}</p>)}
            </div>
          )}
        </article>
      ))}

      {step === 1 && (
        <ul className="examples">
          {examples.map((x) => (
            <li key={x.id}>
              <p className="en">{x.en} <Say text={x.en} /></p>
              <p className="pt">{x.pt}</p>
              {x.context && <p className="ctx">{x.context}</p>}
            </li>
          ))}
        </ul>
      )}

      {step === 2 && (variations.length ? variations.map((v) => (
        <article key={v.ref} className="concept">
          <h2 className="en">{v.title}</h2>
          <table className="var">
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.head}>
                  <th className="en">{r.head}</th>
                  <td>
                    <strong>{r.body}</strong>
                    {r.note && <span className="muted"> — {r.note}</span>}
                    {r.examples.map((x) => <span key={x.id} className="ex-inline"><span className="en">{x.en}</span> {x.pt}</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )) : <Empty>Sem variações para estes conteúdos.</Empty>)}

      {step === 3 && (
        <>
          <p className="muted">{answered}/{exercises.length} respondidos · {correct} corretos. Faça também os exercícios da folha.</p>
          <ol className="exercises">
            {exercises.map((x) => (
              <li key={x.id}>
                <ExerciseView ex={x} onResult={(ok) => setScore((m) => ({ ...m, [x.id]: ok }))} />
              </li>
            ))}
          </ol>
        </>
      )}

      {step === 4 && (
        <article className="concept">
          {s.expected && (
            <div className="brief">
              <p><span className="eyebrow">Resultado esperado</span><br /><strong>{s.expected.result}</strong></p>
              {s.expected.criteria?.length ? <ul>{s.expected.criteria.map((c) => <li key={c}>{c}</li>)}</ul> : null}
            </div>
          )}
          <h2>Avalie na folha</h2>
          <p>No verso da folha, marque <strong>STATUS DO CONTEÚDO</strong>, <strong>ENTENDI?</strong> e <strong>CONSEGUI UTILIZAR?</strong>, escreva a observação e fotografe o verso para registrar.</p>
          <div className="actions left">
            <a className="primary" href={`#/scan?code=${s.id}`}>Escanear folha</a>
            <button className="ghost" onClick={() => go(`/sessao/${s.id}`)}>Registrar sem folha</button>
          </div>
        </article>
      )}

      {step < 4 && (
        <div className="actions sticky">
          {step > 0 && <button className="ghost" onClick={() => setStep(step - 1)}>Voltar</button>}
          <button className="primary" onClick={next}>Continuar · {STEPS[step + 1]}</button>
        </div>
      )}
    </div>
  );
}
