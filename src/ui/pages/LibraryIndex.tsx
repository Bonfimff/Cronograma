import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useData, useRoute } from '../hooks';
import { store } from '../../core/storage/store';
import type { ContentRef, UserData } from '../../core/types';
import { content } from '../../core/content/repository';
import { reviewStatus } from '../../core/reviews/reviews';
import { addSheetItem, createSheet, deleteSheet, removeSheetItem, sheetsOf } from '../../core/library/sheets';
import { buscar } from '../../core/content/search';
import { favoritas } from '../../core/library/favoritas';
import { LaptopCut } from '../components/Cutouts';

/** Duração da virada de folha. */
const TURN_MS = 900;
const NEW_TAB = 'nova';
const CAPA = 'capa';

type Tab = { key: string; label: ReactNode; count?: number };

/**
 * Biblioteca como um caderno: a capa lista as folhas (vocabulário, expressões,
 * padrões, gramática e as folhas criadas pelo usuário) e escolher uma vira a
 * página. A folha antiga continua por cima durante a virada e sai girando pela
 * borda, revelando a nova embaixo. Voltar desdobra no sentido contrário.
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

  // a página Hoje pode pedir uma folha: #/conteudo?folha=word
  const pedida = useRoute().query.get('folha');
  const [tab, setTab] = useState(pedida ?? CAPA);
  const [turning, setTurning] = useState<{ from: string; dir: 1 | -1 } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = tab === CAPA || tabs.some((t) => t.key === tab) ? tab : CAPA; // folha apagada volta pra capa

  // ordem do caderno: a capa e depois as folhas, na ordem das guias
  const ordem = [CAPA, ...tabs.map((t) => t.key)];

  const open = (key: string) => {
    if (key === current) return;
    window.clearTimeout(timer.current);
    const de = ordem.indexOf(current);
    const para = ordem.indexOf(key); // folha recém-criada ainda não está na lista: entra no fim
    setTurning({ from: current, dir: para === -1 || para > de ? 1 : -1 });
    setTab(key);
    timer.current = window.setTimeout(() => setTurning(null), TURN_MS);
  };

  /** Arrastar o dedo para o lado vira a folha, como num caderno. */
  const toque = useRef<{ x: number; y: number } | null>(null);
  const comecar = (e: React.TouchEvent) => {
    const t = e.touches[0];
    toque.current = { x: t.clientX, y: t.clientY };
  };
  const terminar = (e: React.TouchEvent) => {
    const ini = toque.current;
    toque.current = null;
    if (!ini || turning) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - ini.x;
    const dy = t.clientY - ini.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // rolagem, não virada
    const i = ordem.indexOf(current);
    const alvo = ordem[dx < 0 ? i + 1 : i - 1];
    if (alvo) open(alvo);
  };

  // o caderno ocupa da sua posição até a barra de baixo, para todas as folhas
  // terem a mesma altura (e, por isso, o mesmo número de linhas)
  const livro = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const medir = () => {
      const el = livro.current;
      if (!el) return;
      const barra = document.querySelector('.nav') as HTMLElement | null;
      const debaixo = barra && getComputedStyle(barra).position === 'fixed' ? barra.offsetHeight : 0;
      const topo = el.getBoundingClientRect().top - (el.offsetHeight ? 0 : 0);
      let altura = Math.max(240, window.innerHeight - topo - debaixo - 12);
      el.style.height = `${altura}px`;
      // a rolagem tem de acontecer dentro da folha, nunca na página: se ainda
      // sobrar algo rolando (recuos, barra estática no computador), encolhe o
      // caderno até a página caber inteira na tela
      for (let i = 0; i < 4; i++) {
        const sobra = document.documentElement.scrollHeight - window.innerHeight;
        if (sobra <= 0 || altura <= 240) break;
        altura = Math.max(240, altura - sobra);
        el.style.height = `${altura}px`;
      }
    };
    medir();
    const depois = requestAnimationFrame(medir); // depois de a folha se acomodar
    window.addEventListener('resize', medir);
    return () => {
      cancelAnimationFrame(depois);
      window.removeEventListener('resize', medir);
    };
  }, [current]);

  return (
    <>
      {/* cabeçalho enxuto: voltar, título e o recorte na mesma linha, para o
          caderno começar mais alto e caber mais folha na tela */}
      <section className="hero lib-hero">
        <button
          className={`lib-voltar ${current === CAPA ? 'oculto' : ''}`}
          onClick={() => open(CAPA)}
          tabIndex={current === CAPA ? -1 : 0}
          aria-label="Voltar para a capa"
        >
          ‹
        </button>
        <h1>Biblioteca</h1>
        <LaptopCut className="lib-cut" width="58" />
      </section>

      {/*
        Pra frente: a folha nova fica embaixo e a antiga vira por cima, dobrando.
        Pra trás: a antiga fica embaixo e a nova volta por cima, desdobrando
        (a mesma animação ao contrário) — como num caderno de verdade.
      */}
      <div className="lib-book" ref={livro} onTouchStart={comecar} onTouchEnd={terminar}>
        {turning && turning.dir < 0 ? (
          <>
            <Sheet key={turning.from} tabKey={turning.from} data={data} onCreated={open} tabs={tabs} onOpen={open} ordem={ordem} />
            <PageFold key={`volta-${current}`} tabKey={current} data={data} tabs={tabs} ordem={ordem} reverse />
          </>
        ) : (
          <>
            <Sheet key={current} tabKey={current} data={data} onCreated={open} tabs={tabs} onOpen={open} ordem={ordem} />
            {turning && <PageFold key={`vira-${turning.from}`} tabKey={turning.from} data={data} tabs={tabs} ordem={ordem} />}
          </>
        )}
        {/* o rodapé fica preso ao caderno, não à folha: assim não rola junto */}
        <Numero tabKey={current} ordem={ordem} onOpen={open} />
      </div>
    </>
  );
}

type CorpoProps = {
  tabKey: string;
  data: UserData;
  onCreated: (key: string) => void;
  tabs: Tab[];
  onOpen: (key: string) => void;
};

/** Rodapé discreto: o número da folha e a volta para a primeira página. */
function Numero({ tabKey, ordem, onOpen }: { tabKey: string; ordem: string[]; onOpen?: (key: string) => void }) {
  const i = ordem.indexOf(tabKey);
  if (i < 0) return null;
  return (
    <p className="lib-pagina">
      {i > 0 && onOpen && (
        <button className="lib-inicio" onClick={() => onOpen(CAPA)}>« início</button>
      )}
      {i + 1} / {ordem.length}
    </p>
  );
}

function Sheet({ tabKey, data, onCreated, tabs, onOpen, ordem }: CorpoProps & { ordem: string[] }) {
  const folha = useRef<HTMLElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const [vazias, setVazias] = useState(0);

  // sobrando espaço no pé da folha, a pauta segue em branco até o fim
  useLayoutEffect(() => {
    const medir = () => {
      const f = folha.current;
      const c = corpo.current;
      if (!f || !c) return;
      const estilo = getComputedStyle(f);
      const pauta = parseFloat(estilo.getPropertyValue('--pauta')) || 34;
      const util = f.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom);
      setVazias(Math.max(0, Math.floor((util - c.offsetHeight) / pauta)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (folha.current) ro.observe(folha.current);
    if (corpo.current) ro.observe(corpo.current);
    return () => ro.disconnect();
  }, [tabKey, data]);

  return (
    <article className="lib-sheet" ref={folha}>
      <div ref={corpo}>
        <SheetBody tabKey={tabKey} data={data} onCreated={onCreated} tabs={tabs} onOpen={onOpen} />
      </div>
      {Array.from({ length: vazias }, (_, i) => <div key={i} className="lib-vazia" aria-hidden />)}
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
function PageFold({ tabKey, data, tabs, ordem, reverse }: { tabKey: string; data: UserData; tabs: Tab[]; ordem: string[]; reverse?: boolean }) {
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
        <SheetBody tabKey={tabKey} data={data} onCreated={() => {}} tabs={tabs} onOpen={() => {}} />
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

function SheetBody({ tabKey, data, onCreated, tabs, onOpen }: CorpoProps) {
  const st = (r: string) => reviewStatus(data, r as ContentRef)?.state;

  // capa do caderno: a busca e o índice das folhas
  if (tabKey === CAPA) return <Capa data={data} tabs={tabs} onOpen={onOpen} />;

  if (tabKey === 'word') {
    return (
      <>
        <Titulo chave="word">Vocabulário</Titulo>
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
        <Titulo chave="expression">Expressões</Titulo>
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
        <Titulo chave="pattern">Padrões</Titulo>
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
        <Titulo chave="grammar">Gramática</Titulo>
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

/** Título da folha com a estrela ao lado. */
function Titulo({ chave, children }: { chave?: string; children: ReactNode }) {
  return (
    <h2 className="lib-title">
      <span>{children}</span>
      {chave && <Estrela chave={chave} />}
    </h2>
  );
}

/** Estrela que marca a folha para ela aparecer na página Hoje. */
function Estrela({ chave }: { chave: string }) {
  const marcadas = useSyncExternalStore((cb) => favoritas.subscribe(cb), () => favoritas.get());
  const marcada = marcadas.includes(chave);
  return (
    <button
      className={`lib-estrela ${marcada ? 'on' : ''}`}
      onClick={() => favoritas.alternar(chave)}
      aria-pressed={marcada}
      title={marcada ? 'Tirar da página Hoje' : 'Mostrar na página Hoje'}
    >
      {marcada ? '★' : '☆'}
    </button>
  );
}

/** Primeira folha: campo de busca e, abaixo, a lista das folhas. */
function Capa({ data, tabs, onOpen }: { data: UserData; tabs: Tab[]; onOpen: (key: string) => void }) {
  const [termo, setTermo] = useState('');
  const achados = buscar(data, termo);
  const buscando = termo.trim().length >= 2;

  // a capa mostra só as folhas marcadas com estrela (as outras continuam a um
  // deslize ou a uma busca de distância); sem nenhuma marcada, mostra todas
  const marcadas = useSyncExternalStore((cb) => favoritas.subscribe(cb), () => favoritas.get());
  const escolhidas = tabs.filter((t) => marcadas.includes(t.key));
  const lista = escolhidas.length
    ? [...escolhidas, ...tabs.filter((t) => t.key === NEW_TAB)]
    : tabs;

  return (
    <>
      <h2 className="lib-title">Folhas</h2>

      <div className="lib-busca">
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar palavra ou folha"
          aria-label="Buscar palavra ou folha"
        />
      </div>

      {buscando ? (
        achados.length ? (
          <ul className="lib-list">
            {achados.map((a) => (
              <li key={a.chave}>
                {a.href ? (
                  <a className="lib-row" href={a.href}>
                    <span className="lib-main"><b className="en">{a.titulo}</b> <em>{a.onde}</em></span>
                    <span className="lib-side">{a.detalhe}</span>
                  </a>
                ) : (
                  <button className="lib-row" onClick={() => a.folha && onOpen(a.folha)}>
                    <span className="lib-main"><b className="en">{a.titulo}</b> <em>{a.onde}</em></span>
                    <span className="lib-side">{a.detalhe}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="lib-note">Nada encontrado para "{termo}".</p>
        )
      ) : (
        <ul className="lib-list">
          {lista.map((t) => (
            <li key={t.key}>
              <button className={`lib-row ${t.key === NEW_TAB ? 'lib-nova' : ''}`} onClick={() => onOpen(t.key)}>
                <span className="lib-main">{t.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NewSheetForm({ onCreated }: { onCreated: (key: string) => void }) {
  const [title, setTitle] = useState('');
  return (
    <>
      <h2 className="lib-title">Nova folha</h2>
      <p className="lib-note">Dê um nome à folha (por exemplo "Trabalho", "Viagem" ou "Palavras do filme") e depois vá anotando as palavras e expressões nela.</p>
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
      <Titulo chave={sheet.id}>{sheet.title}</Titulo>
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
