import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useData } from '../hooks';
import { store } from '../../core/storage/store';
import type { ContentRef, UserData } from '../../core/types';
import { content } from '../../core/content/repository';
import { reviewStatus } from '../../core/reviews/reviews';
import { addSheetItem, createSheet, deleteSheet, removeSheetItem, sheetsOf } from '../../core/library/sheets';
import { LaptopCut, NewspaperManLive } from '../components/Cutouts';

/** Duração da virada de folha. */
const TURN_MS = 900;
const NEW_TAB = 'nova';

type Tab = { key: string; label: string; count?: number };

/**
 * Biblioteca como um caderno: cada sub-aba é uma folha (vocabulário,
 * expressões, padrões, gramática e as folhas criadas pelo usuário). Trocar de
 * aba vira a folha — a antiga continua por cima durante a virada e sai girando
 * pela borda, revelando a nova embaixo.
 */
export function LibraryIndex() {
  const data = useData();
  const custom = sheetsOf(data);
  const tabs: Tab[] = [
    { key: 'word', label: 'Vocabulário', count: content.words.length },
    { key: 'expression', label: 'Expressões', count: content.expressions.length },
    { key: 'pattern', label: 'Padrões', count: content.patterns.length },
    { key: 'grammar', label: 'Gramática', count: content.grammar.length },
    ...custom.map((s) => ({ key: s.id, label: s.title, count: s.items.length })),
    { key: NEW_TAB, label: '+ nova folha' },
  ];

  const [tab, setTab] = useState('word');
  const [turning, setTurning] = useState<{ from: string; dir: 1 | -1 } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = tabs.some((t) => t.key === tab) ? tab : 'word'; // folha apagada volta pro vocabulário
  const navRef = useRef<HTMLElement>(null);

  // a faixa de abas rola de lado no celular: mantém a aba aberta à vista
  useEffect(() => {
    navRef.current?.querySelector('.on')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [current]);

  const open = (key: string) => {
    if (key === current) return;
    const at = (k: string) => tabs.findIndex((t) => t.key === k);
    window.clearTimeout(timer.current);
    const to = at(key); // folha recém-criada ainda não está na lista: ela entra no fim
    setTurning({ from: current, dir: to === -1 || to > at(current) ? 1 : -1 });
    setTab(key);
    timer.current = window.setTimeout(() => setTurning(null), TURN_MS);
  };

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Conteúdo</p>
        <h1>Biblioteca <LaptopCut className="cut-title" width="86" /></h1>
        <p className="lead">
          {content.words.length} palavras · {content.expressions.length} expressões · {content.patterns.length} padrões ·{' '}
          {custom.length} {custom.length === 1 ? 'folha sua' : 'folhas suas'}.
        </p>
        <NewspaperManLive className="cut-corner" width={84} />
      </section>

      <nav className="lib-tabs" aria-label="Folhas" ref={navRef}>
        {tabs.map((t) => (
          <button key={t.key} className={t.key === current ? 'on' : ''} onClick={() => open(t.key)}>
            {t.label}{t.count !== undefined && <small>{t.count}</small>}
          </button>
        ))}
      </nav>

      {/*
        Pra frente: a folha nova fica embaixo e a antiga vira por cima, dobrando.
        Pra trás: a antiga fica embaixo e a nova volta por cima, desdobrando
        (a mesma animação ao contrário) — como num caderno de verdade.
      */}
      <div className="lib-book">
        {turning && turning.dir < 0 ? (
          <>
            <Sheet key={turning.from} tabKey={turning.from} data={data} onCreated={open} />
            <PageFold key={`volta-${current}`} tabKey={current} data={data} reverse />
          </>
        ) : (
          <>
            <Sheet key={current} tabKey={current} data={data} onCreated={open} />
            {turning && <PageFold key={`vira-${turning.from}`} tabKey={turning.from} data={data} />}
          </>
        )}
      </div>
    </>
  );
}

function Sheet({ tabKey, data, onCreated }: { tabKey: string; data: UserData; onCreated: (key: string) => void }) {
  return (
    <article className="lib-sheet">
      <SheetBody tabKey={tabKey} data={data} onCreated={onCreated} />
    </article>
  );
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/**
 * A folha virando, vista de cima. Uma linha de dobra atravessa a folha da
 * direita pra esquerda, um pouco inclinada (o canto de baixo sai na frente, como
 * quando se puxa a folha pela ponta). À esquerda da dobra fica a frente da
 * folha; a parte que já passou da dobra vira a aba: o verso do papel, espelhado
 * na linha da dobra. Um brilho marca a curva e uma sombra cai na folha de baixo.
 *
 * `reverse` roda a mesma dobra de trás pra frente — a folha volta desdobrando.
 * A geometria é calculada a cada quadro (clip-path + matriz de reflexão).
 */
function PageFold({ tabKey, data, reverse }: { tabKey: string; data: UserData; reverse?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLElement>(null);
  const flap = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const shine = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const W = wrap.current!.offsetWidth;
    const H = front.current!.offsetHeight;
    flap.current!.style.height = `${H}px`;

    const apply = (t: number) => {
      const xM = W * (1 - easeInOut(t)); // dobra, na altura do meio
      const slant = Math.sin(Math.PI * t) * 0.24 * W; // inclinação: o canto de baixo lidera
      const xT = xM + slant / 2;
      const xB = xM - slant / 2;

      front.current!.style.clipPath = `polygon(0 0, ${xT}px 0, ${xB}px ${H}px, 0 ${H}px)`;
      flap.current!.style.clipPath = `polygon(${xT}px 0, ${W}px 0, ${W}px ${H}px, ${xB}px ${H}px)`;

      // reflexão na reta da dobra, que passa por (xT, 0) com direção (dx, H)
      const len = Math.hypot(xB - xT, H);
      const ux = (xB - xT) / len;
      const uy = H / len;
      const a = 2 * ux * ux - 1;
      const b = 2 * ux * uy;
      const d = 2 * uy * uy - 1;
      flap.current!.style.transform = `matrix(${a}, ${b}, ${b}, ${d}, ${xT - a * xT}, ${-b * xT})`;

      // faixas de brilho (na aba, junto da dobra) e de sombra (na folha de baixo)
      const angle = Math.atan2(-ux, uy);
      const lift = Math.sin(Math.PI * t);
      const flapW = W - xM;
      const band = (el: HTMLDivElement, width: number, left: boolean, opacity: number) => {
        el.style.width = `${width}px`;
        el.style.height = `${len * 1.3}px`;
        el.style.opacity = String(opacity);
        el.style.transform =
          `translate(${xT}px, 0) rotate(${angle}rad) translate(${left ? -width : 0}px, -12%)`;
      };
      band(shine.current!, Math.min(44, flapW * 0.8), true, lift);
      band(shade.current!, Math.min(70, flapW + 24), false, lift * 0.9);
    };

    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / TURN_MS);
      apply(reverse ? 1 - p : p);
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    apply(reverse ? 1 : 0);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reverse]);

  return (
    <div className="fold" ref={wrap} aria-hidden>
      <div className="fold-shade" ref={shade} />
      <article className="lib-sheet fold-front" ref={front}>
        <SheetBody tabKey={tabKey} data={data} onCreated={() => {}} />
      </article>
      <div className="fold-flap" ref={flap} />
      <div className="fold-shine" ref={shine} />
    </div>
  );
}

function Row({ href, main, side, state }: { href: string; main: ReactNode; side: ReactNode; state?: string }) {
  return (
    <li>
      <a href={href} className="lib-row">
        <span className="lib-main">{state && <span className={`dot s-${state}`} />}{main}</span>
        <span className="lib-side">{side}</span>
      </a>
    </li>
  );
}

function SheetBody({ tabKey, data, onCreated }: { tabKey: string; data: UserData; onCreated: (key: string) => void }) {
  const st = (r: string) => reviewStatus(data, r as ContentRef)?.state;

  if (tabKey === 'word') {
    return (
      <>
        <h2 className="lib-title">Vocabulário</h2>
        <ul className="lib-list">
          {content.words.map((w) => (
            <Row
              key={w.id}
              href={`#/conteudo/word:${w.id}`}
              state={st(`word:${w.id}`)}
              main={<><b className="en">{w.word}</b> <em>{w.type}</em></>}
              side={w.translations.map((t) => t.text).join(', ')}
            />
          ))}
        </ul>
      </>
    );
  }
  if (tabKey === 'expression') {
    return (
      <>
        <h2 className="lib-title">Expressões</h2>
        <ul className="lib-list">
          {content.expressions.map((e) => (
            <Row
              key={e.id}
              href={`#/conteudo/expression:${e.id}`}
              state={st(`expression:${e.id}`)}
              main={<b className="en">{e.text}</b>}
              side={e.translation}
            />
          ))}
        </ul>
      </>
    );
  }
  if (tabKey === 'pattern') {
    return (
      <>
        <h2 className="lib-title">Padrões</h2>
        <ul className="lib-list">
          {content.patterns.map((p) => (
            <Row key={p.id} href={`#/conteudo/pattern:${p.id}`} state={st(`pattern:${p.id}`)} main={<b className="en">{p.formula}</b>} side={p.name} />
          ))}
        </ul>
      </>
    );
  }
  if (tabKey === 'grammar') {
    return (
      <>
        <h2 className="lib-title">Gramática</h2>
        <ul className="lib-list">
          {content.grammar.map((g) => (
            <Row key={g.id} href={`#/conteudo/grammar:${g.id}`} state={st(`grammar:${g.id}`)} main={<b>{g.title}</b>} side="" />
          ))}
        </ul>
      </>
    );
  }
  if (tabKey === NEW_TAB) return <NewSheetForm onCreated={onCreated} />;

  const sheet = sheetsOf(data).find((s) => s.id === tabKey);
  if (!sheet) return null;
  return <CustomSheet id={sheet.id} />;
}

function NewSheetForm({ onCreated }: { onCreated: (key: string) => void }) {
  const [title, setTitle] = useState('');
  return (
    <>
      <h2 className="lib-title">Nova folha</h2>
      <p className="lib-note">Dê um nome à folha — por exemplo "Trabalho", "Viagem" ou "Palavras do filme" — e depois vá anotando as palavras e expressões nela.</p>
      <form
        className="lib-form"
        onSubmit={(e) => {
          e.preventDefault();
          let id: string | null = null;
          store.update((d) => { id = createSheet(d, title); });
          if (id) { setTitle(''); onCreated(id); }
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome da folha" maxLength={40} />
        <button className="primary" disabled={!title.trim()}>Criar folha</button>
      </form>
    </>
  );
}

function CustomSheet({ id }: { id: string }) {
  const data = useData();
  const sheet = sheetsOf(data).find((s) => s.id === id);
  const [en, setEn] = useState('');
  const [pt, setPt] = useState('');
  const enRef = useRef<HTMLInputElement>(null);
  if (!sheet) return null;

  return (
    <>
      <h2 className="lib-title">{sheet.title}</h2>
      {sheet.items.length ? (
        <ul className="lib-list">
          {sheet.items.map((it, i) => (
            <li key={`${it.en}-${i}`} className="lib-row">
              <span className="lib-main"><b className="en">{it.en}</b></span>
              <span className="lib-side">{it.pt}</span>
              <button
                className="lib-del"
                onClick={() => store.update((d) => removeSheetItem(d, id, i))}
                aria-label={`Tirar ${it.en}`}
              >✕</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lib-note">Folha em branco. Anote a primeira palavra aqui embaixo.</p>
      )}
      <form
        className="lib-form"
        onSubmit={(e) => {
          e.preventDefault();
          let ok = false;
          store.update((d) => { ok = addSheetItem(d, id, en, pt); });
          if (ok) { setEn(''); setPt(''); enRef.current?.focus(); }
        }}
      >
        <input ref={enRef} value={en} onChange={(e) => setEn(e.target.value)} placeholder="Inglês" lang="en" />
        <input value={pt} onChange={(e) => setPt(e.target.value)} placeholder="Português" />
        <button className="primary" disabled={!en.trim() || !pt.trim()}>Anotar</button>
      </form>
      <button
        className="link lib-remove"
        onClick={() => {
          if (window.confirm(`Apagar a folha "${sheet.title}" e tudo o que está anotado nela?`)) {
            store.update((d) => deleteSheet(d, id));
          }
        }}
      >apagar esta folha</button>
    </>
  );
}
