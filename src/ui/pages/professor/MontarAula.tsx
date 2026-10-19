import { useMemo, useState } from 'react';
import type { SyncRecord } from '../../../core/api/client';
import { addDays, fmtShort, today, weekdayName, weekStartOf } from '../../../core/dates';
import { KIND_LABEL } from '../../../core/planning/weeks';
import { checkPackage, exportPackage, parsePackage, templatePackage, type WeekPackage } from '../../../core/planning/weekPackage';
import { contextoDoAluno } from '../../../core/planning/contextoAluno';
import { rascunhoDaSessao, rascunhoVazio } from '../../../core/planning/rascunhoAula';
import { montarPacote, removerAula } from '../../../core/professor/montagem';
import type { UserData } from '../../../core/types';
import { EditorDeAula, type ResultadoSalvar } from '../../components/EditorDeAula';

function baixar(nome: string, dados: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
  a.download = nome;
  a.click();
}

type Aplicar = (pkg: WeekPackage, replacePlanned?: boolean) => Promise<ResultadoSalvar>;

/** Montar aula para o aluno: à mão (editor completo) ou pela IA (modelo com o progresso dele + JSON). */
export function MontarAula({ dados, aluno, gravar, gravando }: {
  dados: UserData; aluno: string; gravar: (itens: SyncRecord[]) => Promise<boolean>; gravando: boolean;
}) {
  const [modo, setModo] = useState<'mao' | 'ia'>('mao');
  const [editando, setEditando] = useState<string | null>(null);
  const sessao = editando ? dados.sessions.find((s) => s.id === editando) : undefined;

  const aplicar: Aplicar = async (pkg, replacePlanned = false) => {
    const m = montarPacote(dados, pkg, { replacePlanned });
    if (!m.ok) return { ok: false, erros: m.erros };
    if (!m.registros.length) return { ok: true, erros: [], mensagem: 'Nada mudou.' };
    if (!(await gravar(m.registros))) return { ok: false, erros: ['Não foi possível gravar na conta do aluno.'] };
    const date = pkg.days.length === 1 ? pkg.days[0].date : undefined;
    return {
      ok: true, erros: [],
      mensagem: `${m.sessaoId && date ? `Aula ${m.sessaoId}` : 'Semana'} gravada${date ? ` para ${weekdayName(date)} ${fmtShort(date)}` : ''}. O aluno recebe na próxima sincronização.`,
    };
  };

  const planejadas = dados.sessions
    .filter((s) => s.date >= today() && s.status === 'planned')
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="seg" role="group" aria-label="Como montar">
        <button type="button" className={modo === 'mao' ? 'on' : ''} onClick={() => setModo('mao')}>À mão</button>
        <button type="button" className={modo === 'ia' ? 'on' : ''} onClick={() => setModo('ia')}>Com IA (JSON)</button>
      </div>

      {modo === 'mao' ? (
        <>
          <h2>{sessao ? `Editar: ${sessao.title}` : 'Nova aula'}</h2>
          <EditorDeAula
            key={editando ?? 'nova'}
            dados={dados}
            quem="o aluno"
            inicial={sessao ? rascunhoDaSessao(sessao, dados) : rascunhoVazio(addDays(today(), 1))}
            salvar={async (pkg) => { const r = await aplicar(pkg); if (r.ok && sessao) setEditando(null); return r; }}
            cancelar={sessao ? () => setEditando(null) : undefined}
          />
        </>
      ) : <PelaIA dados={dados} aluno={aluno} aplicar={aplicar} gravando={gravando} />}

      <section>
        <h2>Aulas planejadas</h2>
        {planejadas.length ? (
          <ul className="prof-lista">
            {planejadas.map((s) => (
              <li key={s.id}>
                <span><b>{weekdayName(s.date)} {fmtShort(s.date)}</b> · <span className={`kind k-${s.kind}`}>{KIND_LABEL[s.kind]}</span> {s.title} <span className="mono muted">{s.id}</span></span>
                <span className="prof-botoes">
                  <button type="button" className="ghost small" onClick={() => { setModo('mao'); setEditando(s.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
                  <button type="button" className="ghost small" disabled={gravando} onClick={() => { if (confirm(`Tirar a aula "${s.title}"?`)) void gravar(removerAula(dados, s.id)); }}>Tirar</button>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Nenhuma aula por fazer.</p>}
      </section>
    </>
  );
}

/** O modelo leva o vocabulário e os avanços do aluno; a IA devolve o JSON da semana. */
function PelaIA({ dados, aluno, aplicar, gravando }: { dados: UserData; aluno: string; aplicar: Aplicar; gravando: boolean }) {
  const [semana, setSemana] = useState(weekStartOf(addDays(today(), 7)));
  const [texto, setTexto] = useState('');
  const [substituir, setSubstituir] = useState(false);
  const [res, setRes] = useState<ResultadoSalvar | null>(null);
  const lido = useMemo(() => (texto.trim() ? parsePackage(texto) : null), [texto]);
  const pkg = lido && typeof lido !== 'string' ? lido : null;
  const check = useMemo(() => (pkg ? checkPackage(dados, pkg, { replacePlanned: substituir }) : null), [pkg, dados, substituir]);
  const nome = aluno.split('@')[0];

  return (
    <section className="form">
      <h2>Com IA</h2>
      <ol className="ed-passos">
        <li>
          Baixe o modelo. Ele leva o vocabulário de {nome}, o que está firme, o que está sendo esquecido e o pedido pronto para colar numa IA.
          <div className="ed-linha">
            <div className="stepper">
              <button type="button" aria-label="Semana anterior" onClick={() => setSemana(addDays(semana, -7))}>‹</button>
              <span>{fmtShort(semana)} a {fmtShort(addDays(semana, 6))}</span>
              <button type="button" aria-label="Próxima semana" onClick={() => setSemana(addDays(semana, 7))}>›</button>
            </div>
            <button type="button" className="ghost small" onClick={() => baixar(`modelo-${nome}-${semana}.json`, templatePackage(semana, contextoDoAluno(dados)))}>Baixar modelo</button>
            <button type="button" className="ghost small" onClick={() => baixar(`semana-${nome}-${semana}.json`, exportPackage(dados, semana))}>Exportar a semana</button>
          </div>
        </li>
        <li>Cole o modelo na IA e peça a semana (ou só uma aula).</li>
        <li>
          Traga de volta o JSON que a IA devolveu. A conferência usa o vocabulário de {nome}.
          <label className="ghost file">
            Escolher arquivo .json
            <input type="file" accept="application/json,.json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setTexto(await f.text()); setRes(null); } e.target.value = ''; }} />
          </label>
          <textarea className="json-box" rows={8} value={texto} placeholder="…ou cole o JSON aqui" spellCheck={false} onChange={(e) => { setTexto(e.target.value); setRes(null); }} />
        </li>
      </ol>
      {typeof lido === 'string' && <p className="error">{lido}</p>}
      {res?.ok && <p className="ok-line">{res.mensagem}</p>}
      {check && (
        <>
          {check.errors.length > 0 && <ul className="check-list err">{check.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          {check.integracao.length > 0 && <ul className="check-list">{check.integracao.map((m, i) => <li key={i} className={m.ok ? 'ok' : 'warn'}>{m.ok ? '✓ ' : '⚠ '}{m.texto}</li>)}</ul>}
          {check.warnings.length > 0 && <ul className="check-list warn">{check.warnings.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          {check.summary.week && (
            <p className="muted">
              Semana de {fmtShort(check.summary.week)}: {check.summary.sessions} aula(s) em {check.summary.days} dia(s)
              {check.summary.plan.update.length > 0 && `, ${check.summary.plan.update.length} atualizada(s)`}
              {check.summary.plan.keep.length > 0 && `, ${check.summary.plan.keep.length} já iniciada(s) mantida(s)`}.
            </p>
          )}
          <label className="check">
            <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
            <span>Nos dias do arquivo, tirar as aulas não iniciadas que não estão nele{check.summary.plan.remove.length > 0 && ` (${check.summary.plan.remove.join(', ')})`}</span>
          </label>
          {res && !res.ok && <ul className="check-list err">{res.erros.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          <div className="actions">
            <button className="primary" type="button" disabled={!check.ok || gravando} onClick={async () => { const r = await aplicar(pkg!, substituir); setRes(r); if (r.ok) setTexto(''); }}>
              {gravando ? 'Gravando…' : `Gravar na conta de ${nome}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
