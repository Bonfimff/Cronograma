import type { ReactNode } from 'react';

/**
 * Rabiscos e recortes desenhados em SVG (nada de imagem externa), no traço de giz da referência:
 * silhueta escura com contorno claro, cantos arredondados e leve irregularidade.
 */

type P = { className?: string; width?: number | string };

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Filtros usados pelos recortes de papel rasgado. Renderize uma vez na raiz do app. */
export function DoodleDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="defs">
      <defs>
        <filter id="torn">
          <feTurbulence type="fractalNoise" baseFrequency="0.015 0.06" numOctaves="4" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="torn-soft">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.05" numOctaves="3" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

/** Rosto de gato fofo, de olhos fechados — escuro por dentro, contorno claro. */
export function Cat({ className, width }: P) {
  return (
    <svg viewBox="0 0 60 56" className={className} width={width} aria-hidden>
      <g fill="var(--paper)" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
        <path d="M14 22 9 5l17 7zM46 22l5-17-17 7z" />
        <path d="M14 22c-3 7-3 15 1 20 4 6 9 8 15 8s11-2 15-8c4-5 4-13 1-20L34 12c-2-1-6-1-8 0z" />
      </g>
      <path d="M16 20l-2-8 7 3M44 20l2-8-7 3" fill="currentColor" opacity=".45" stroke="none" />
      <g {...stroke} strokeWidth={1.9}>
        <path d="M20 31c2 2.4 5 2.4 7 0M33 31c2 2.4 5 2.4 7 0" />
        <path d="m28 37 2 2 2-2M30 39v2" strokeWidth={1.7} />
        <path d="M30 41c-1.4 1.8-3.8 1.8-5 .3M30 41c1.4 1.8 3.8 1.8 5 .3" strokeWidth={1.5} />
        <path d="M4 32h11M4 39l11-3M56 32H45M56 39l-11-3" strokeWidth={1.5} opacity=".85" />
      </g>
    </svg>
  );
}

/** Fantasminha arredondado com a barra de baixo ondulada. */
export function Ghost({ className, width }: P) {
  return (
    <svg viewBox="0 0 44 52" className={className} width={width} aria-hidden>
      <path d="M8 47V23a14 14 0 0 1 28 0v24l-5-4-4 4-5-4-5 4z" {...stroke} fill="var(--paper)" />
      <ellipse cx="17" cy="23" rx="2.1" ry="3" fill="currentColor" />
      <ellipse cx="29" cy="23" rx="2.1" ry="3" fill="currentColor" />
      <path d="M20 31c1.4 1.6 3.2 1.6 4.6 0" {...stroke} strokeWidth={1.6} />
    </svg>
  );
}

/** Pilha de livros tortos, com marcas de páginas. */
export function Books({ className, width }: P) {
  return (
    <svg viewBox="0 0 60 50" className={className} width={width} aria-hidden>
      <g {...stroke} fill="var(--paper)">
        <rect x="5" y="34" width="46" height="10" rx="2" />
        <rect x="9" y="23" width="38" height="10" rx="2" transform="rotate(-2.5 28 28)" />
        <rect x="13" y="12" width="30" height="10" rx="2" transform="rotate(2.5 28 17)" />
      </g>
      <g {...stroke} strokeWidth={1.4} opacity=".8">
        <path d="M12 34v10M16 34v10M16 23v10M20 23v10M20 12v10M23 12v10" />
      </g>
    </svg>
  );
}

export function Plane({ className, width }: P) {
  return (
    <svg viewBox="0 0 48 40" className={className} width={width} aria-hidden>
      <path d="M44 6 4 21l16 5 4 12 7-11 13-21z" {...stroke} />
      <path d="M20 26 44 6" {...stroke} strokeWidth={1.6} />
      <path d="M2 34c4-1 7-3 9-6M8 38c3-1 5-2 7-4" {...stroke} strokeWidth={1.4} />
    </svg>
  );
}

export function Sparkle({ className, width }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} width={width} aria-hidden>
      <path d="M16 2c1 8 6 13 14 14-8 1-13 6-14 14-1-8-6-13-14-14C10 15 15 10 16 2z" fill="currentColor" />
    </svg>
  );
}

export function Arrow({ className, width }: P) {
  return (
    <svg viewBox="0 0 56 34" className={className} width={width} aria-hidden>
      <path d="M3 8c12-6 28-4 38 6 3 3 5 7 6 11" {...stroke} strokeWidth={2.4} />
      <path d="M40 24l7 2 2-8" {...stroke} strokeWidth={2.4} />
    </svg>
  );
}

export function Crown({ className, width }: P) {
  return (
    <svg viewBox="0 0 44 30" className={className} width={width} aria-hidden>
      <path d="M4 26 6 6l8 8 8-11 8 11 8-8 2 20z" fill="currentColor" />
    </svg>
  );
}

export function Bolt({ className, width }: P) {
  return (
    <svg viewBox="0 0 26 40" className={className} width={width} aria-hidden>
      <path d="M15 2 4 22h7l-3 16L22 16h-8l3-14z" fill="currentColor" />
    </svg>
  );
}

export function CalendarDoodle({ className, width }: P) {
  return (
    <svg viewBox="0 0 44 40" className={className} width={width} aria-hidden>
      <rect x="4" y="8" width="36" height="28" rx="3" {...stroke} fill="var(--paper)" />
      <path d="M4 17h36M13 4v8M31 4v8" {...stroke} />
      <path d="M13 24h3M21 24h3M29 24h3M13 30h3M21 30h3" {...stroke} strokeWidth={2.4} />
    </svg>
  );
}

/** Videogamezinho de mão. */
export function Device({ className, width }: P) {
  return (
    <svg viewBox="0 0 34 44" className={className} width={width} aria-hidden>
      <rect x="4" y="3" width="26" height="38" rx="5" {...stroke} fill="var(--paper)" />
      <rect x="8" y="7" width="18" height="14" rx="2" {...stroke} strokeWidth={1.6} />
      <path d="M10 30h6M13 27v6" {...stroke} strokeWidth={1.8} />
      <circle cx="23" cy="28" r="1.8" fill="currentColor" />
      <circle cx="26" cy="33" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** Traço curvo à mão, usado pra sublinhar frases. */
export function Swash({ className, width }: P) {
  return (
    <svg viewBox="0 0 160 12" className={className} width={width} aria-hidden preserveAspectRatio="none">
      <path d="M4 8C38 2 92 1 128 5c11 1 21 3 28 4" {...stroke} strokeWidth={3} />
    </svg>
  );
}

/** Selo escrito à mão com risquinhos de brilho dos dois lados ("good job", "level up"…). */
export function Praise({ children, className }: { children: ReactNode; className?: string }) {
  const rays = (
    <svg viewBox="0 0 16 36" className="praise-burst" aria-hidden>
      <path d="M3 18h9M5 6l7 6M5 30l7-6" {...stroke} strokeWidth={2.4} />
    </svg>
  );
  return (
    <span className={`praise ${className ?? ''}`}>
      {rays}
      <b>{children}</b>
      <span className="flip">{rays}</span>
    </span>
  );
}

/* ── Ícones da barra de navegação, no mesmo traço de giz ────────────────── */

export function IconHome({ className, width }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={width} aria-hidden>
      <path d="M3.5 10.5 12 3.5l8.5 7" {...stroke} strokeWidth={1.9} />
      <path d="M5.5 9.6v9.4c0 .6.5 1 1 1h11c.6 0 1-.4 1-1V9.6" {...stroke} strokeWidth={1.9} />
      <path d="M9.6 20.4v-5.3c0-.5.4-.9.9-.9h3c.5 0 .9.4.9.9v5.3" {...stroke} strokeWidth={1.7} />
    </svg>
  );
}

export function IconWeek({ className, width }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={width} aria-hidden>
      <rect x="3.2" y="5.2" width="17.6" height="15.4" rx="2.4" {...stroke} strokeWidth={1.9} />
      <path d="M3.4 10h17.2M8 3.4v3.6M16 3.4v3.6" {...stroke} strokeWidth={1.9} />
      <path d="M7.4 13.6h2M14.6 13.6h2M7.4 17.2h2M11 17.2h2" {...stroke} strokeWidth={1.8} />
    </svg>
  );
}

export function IconReview({ className, width }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={width} aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" {...stroke} strokeWidth={1.9} />
      <path d="M20.4 3.2 19.9 8l-4.7-.8" {...stroke} strokeWidth={1.9} />
    </svg>
  );
}

export function IconContent({ className, width }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={width} aria-hidden>
      <path d="M12 6.6C10 5 7.6 4.4 4.2 4.6c-.5 0-.9.4-.9.9v12c0 .5.4.9 1 .9 3.2-.2 5.6.4 7.7 2 2.1-1.6 4.5-2.2 7.7-2 .6 0 1-.4 1-.9v-12c0-.5-.4-.9-.9-.9-3.4-.2-5.8.4-7.8 2z" {...stroke} strokeWidth={1.9} />
      <path d="M12 6.6v11.8" {...stroke} strokeWidth={1.7} />
    </svg>
  );
}

export function IconGames({ className, width }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={width} aria-hidden>
      <path d="M8 7.6h8c2.6 0 4.4 1.9 4.8 4.4l.5 3.3c.3 1.9-1 3.3-2.7 3.3-1 0-1.8-.5-2.4-1.3l-1-1.3H8.8l-1 1.3c-.6.8-1.4 1.3-2.4 1.3-1.7 0-3-1.4-2.7-3.3l.5-3.3C3.6 9.5 5.4 7.6 8 7.6z" {...stroke} strokeWidth={1.9} />
      <path d="M6.6 11.6v2.6M5.3 12.9h2.6" {...stroke} strokeWidth={1.8} />
      <circle cx="16" cy="11.9" r="1.1" fill="currentColor" />
      <circle cx="18" cy="14.3" r="1.1" fill="currentColor" />
    </svg>
  );
}

/* ── Miudezas ───────────────────────────────────────────────────────────── */

/** Camerazinha, pro botão de escanear a folha. */
export function Camera({ className, width }: P) {
  return (
    <svg viewBox="0 0 26 22" className={className} width={width} aria-hidden>
      <path d="M2.6 6.8h4.6l1.8-3.2h7.8l1.8 3.2h4.8c.6 0 1 .5 1 1v10.4c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1V7.8c0-.5.4-1 1-1z" {...stroke} strokeWidth={1.8} />
      <circle cx="13" cy="12.6" r="4.2" {...stroke} strokeWidth={1.8} />
      <circle cx="21" cy="9.4" r=".9" fill="currentColor" />
    </svg>
  );
}

/** Caderninho de espiral. */
export function Notebook({ className, width }: P) {
  return (
    <svg viewBox="0 0 38 44" className={className} width={width} aria-hidden>
      <path d="M9 4h23c1 0 1.8.8 1.8 1.8v33.4c0 1-.8 1.8-1.8 1.8H9c-1 0-1.8-.8-1.8-1.8V5.8C7.2 4.8 8 4 9 4z" {...stroke} fill="var(--paper)" strokeWidth={2} />
      <path d="M14 12h14M14 19h14M14 26h9" {...stroke} strokeWidth={1.7} opacity=".8" />
      <path d="M6 9h6M6 16h6M6 23h6M6 30h6" {...stroke} strokeWidth={2.2} />
    </svg>
  );
}

export function Pencil({ className, width }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={width} aria-hidden>
      <path d="M4 20.2l1-4.4L15.6 5.2a2 2 0 0 1 2.8 0l1.4 1.4a2 2 0 0 1 0 2.8L9.2 20 4.8 21z" {...stroke} strokeWidth={1.9} />
      <path d="M14.4 6.6l3.8 3.8" {...stroke} strokeWidth={1.7} />
    </svg>
  );
}

export function Seedling({ className, width }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={width} aria-hidden>
      <path d="M12 21v-8.4" {...stroke} strokeWidth={1.9} />
      <path d="M12 13C9.6 13 7 11.4 6.6 8 10 7.6 12.4 9.6 12 13z" {...stroke} strokeWidth={1.8} />
      <path d="M12.4 14.6c2.4-.4 4.6-2.6 4.4-6-3.4.2-5.2 2.6-4.4 6z" {...stroke} strokeWidth={1.8} />
    </svg>
  );
}

/** Selo em estrela (o "level up!" da referência). */
export function StarBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`starbadge ${className ?? ''}`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <path
          d="M50 2 59 24l22-11-8 23 24 3-18 16 18 16-24 3 8 23-22-11-9 22-9-22-22 11 8-23-24-3 18-16-18-16 24-3-8-23 22 11z"
          fill="var(--paper)" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"
        />
      </svg>
      <b>{children}</b>
    </span>
  );
}

/** Ícone do tipo de sessão — cada tipo ganha um rabisco próprio. */
export function KindIcon({ kind, className, width }: P & { kind: string }) {
  switch (kind) {
    case 'new': return <Seedling className={className} width={width} />;
    case 'practice': return <Pencil className={className} width={width} />;
    case 'review': return <IconReview className={className} width={width} />;
    case 'reinforce': return <Bolt className={className} width={width} />;
    default: return <Books className={className} width={width} />;
  }
}
