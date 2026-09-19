import { useState } from 'react';
import type { Exercise } from '../../core/types';
import { checkAnswer, shuffle } from '../../core/exercises/exercises';

const TYPE_LABEL: Record<Exercise['type'], string> = {
  translate: 'Tradução', fill: 'Completar', choice: 'Escolha', match: 'Associação',
  build: 'Construção', qa: 'Pergunta e resposta', produce: 'Produção própria',
};

export function ExerciseView({ ex, onResult }: { ex: Exercise; onResult: (ok: boolean) => void }) {
  const [value, setValue] = useState('');
  const [done, setDone] = useState<null | boolean>(null);
  const [built, setBuilt] = useState<string[]>([]);
  const [matchSel, setMatchSel] = useState<string | null>(null);
  const [matched, setMatched] = useState<Record<string, string>>({});
  const [right] = useState(() => (ex.pairs ? shuffle(ex.pairs.map((p) => p[1]), Math.random) : []));

  const finish = (ok: boolean) => { setDone(ok); onResult(ok); };
  const submit = (v = value) => finish(checkAnswer(ex, v));
  const expected = Array.isArray(ex.answer) ? ex.answer[0] : ex.answer;

  return (
    <div className={`exercise ${done === null ? '' : done ? 'ok' : 'bad'}`}>
      <p className="ex-type">{TYPE_LABEL[ex.type]}</p>
      <p className="ex-prompt">{ex.prompt}</p>

      {(ex.type === 'choice' || ex.type === 'fill') && ex.options && (
        <div className="seg">
          {ex.options.map((o) => (
            <button key={o} disabled={done !== null} className={value === o ? 'on' : ''} onClick={() => { setValue(o); submit(o); }}>{o}</button>
          ))}
        </div>
      )}

      {ex.type === 'fill' && !ex.options && <TextAnswer {...{ value, setValue, submit, done }} />}
      {(ex.type === 'translate' || ex.type === 'qa') && <TextAnswer {...{ value, setValue, submit, done }} />}

      {ex.type === 'build' && ex.tokens && (
        <>
          <p className="built en">{built.join(' ') || '…'}</p>
          <div className="tokens">
            {ex.tokens.map((t, i) => {
              const used = built.filter((b) => b === t).length >= ex.tokens!.slice(0, i + 1).filter((x) => x === t).length;
              return <button key={i} disabled={used || done !== null} onClick={() => setBuilt([...built, t])}>{t}</button>;
            })}
          </div>
          {done === null && (
            <div className="actions left">
              <button className="ghost small" onClick={() => setBuilt([])}>Limpar</button>
              <button className="primary small" disabled={built.length !== ex.tokens.length} onClick={() => submit(built.join(' '))}>Verificar</button>
            </div>
          )}
        </>
      )}

      {ex.type === 'match' && ex.pairs && (
        <div className="match">
          <div>
            {ex.pairs.map(([l]) => (
              <button key={l} className={`en ${matchSel === l ? 'on' : ''} ${matched[l] ? 'used' : ''}`} disabled={!!matched[l] || done !== null} onClick={() => setMatchSel(l)}>{l}</button>
            ))}
          </div>
          <div>
            {right.map((r) => (
              <button key={r} className={Object.values(matched).includes(r) ? 'used' : ''} disabled={!matchSel || Object.values(matched).includes(r) || done !== null}
                onClick={() => {
                  const m = { ...matched, [matchSel!]: r };
                  setMatched(m);
                  setMatchSel(null);
                  if (Object.keys(m).length === ex.pairs!.length) finish(ex.pairs!.every(([a, b]) => m[a] === b));
                }}>{r}</button>
            ))}
          </div>
        </div>
      )}

      {ex.type === 'produce' && (
        <>
          <textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Escreva aqui ou na folha" />
          {done === null && <button className="ghost small" onClick={() => finish(true)}>Feito</button>}
        </>
      )}

      {done !== null && ex.type !== 'produce' && (
        <p className="feedback">
          {done ? 'Correto.' : <>Resposta: <span className="en">{ex.type === 'match' ? ex.pairs!.map((p) => p.join(' = ')).join(' · ') : expected}</span></>}
        </p>
      )}
    </div>
  );
}

function TextAnswer({ value, setValue, submit, done }: { value: string; setValue: (s: string) => void; submit: () => void; done: boolean | null }) {
  return (
    <form className="inline-answer" onSubmit={(e) => { e.preventDefault(); if (value.trim()) submit(); }}>
      <input value={value} disabled={done !== null} onChange={(e) => setValue(e.target.value)} autoCapitalize="off" autoComplete="off" spellCheck={false} />
      {done === null && <button className="primary small">OK</button>}
    </form>
  );
}
