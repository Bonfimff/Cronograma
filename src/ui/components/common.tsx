import type { Session, SessionKind, SessionStatus } from '../../core/types';
import { KIND_LABEL } from '../../core/planning/weeks';
import { fmtShort, weekdayShort } from '../../core/dates';

const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: 'planejada', in_progress: 'em andamento', done: 'concluída',
};

export const MASTERY_LABEL: Record<string, string> = {
  absorbed: 'Consegui absorver o conteúdo', review: 'Preciso de revisão', reinforce: 'Preciso de reforço',
};
export const UNDERSTOOD_LABEL: Record<string, string> = { yes: 'Sim', partial: 'Parcialmente', no: 'Não' };
export const USAGE_LABEL: Record<string, string> = { yes: 'Sim', hard: 'Com dificuldade', no: 'Não' };

export function Kind({ k }: { k: SessionKind }) {
  return <span className={`kind k-${k}`}>{KIND_LABEL[k]}</span>;
}

export function SessionRow({ s, showDate }: { s: Session; showDate?: boolean }) {
  return (
    <a className="row" href={`#/sessao/${s.id}`}>
      {showDate && <span className="row-date">{weekdayShort(s.date)} {fmtShort(s.date)}</span>}
      <span className="row-main">
        <span className="row-title">{s.title}</span>
        <span className="row-sub">
          <Kind k={s.kind} /> <span className="mono">{s.id}</span>
        </span>
      </span>
      <span className={`status st-${s.status}`}>{STATUS_LABEL[s.status]}</span>
    </a>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}
