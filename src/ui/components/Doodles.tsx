/**
 * Rabiscos e recortes desenhados em SVG (nada de imagem externa).
 * Todos herdam a cor via `currentColor` e o traço tem leve irregularidade pra parecer feito à mão.
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

/** Gatinho sentado, de olhos fechados — silhueta cheia com os detalhes vazados. */
export function Cat({ className, width }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} width={width} aria-hidden>
      <path d="M13 18 10 3l13 8zM35 18 38 3 25 11z" fill="currentColor" />
      <circle cx="24" cy="20" r="11" fill="currentColor" />
      <path d="M14 28c-3 6-4 12-2 16h24c2-4 1-10-2-16z" fill="currentColor" />
      <path d="M36 42c7 2 11-3 9-9" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" fill="none" />
      <path d="M18 19c1.4 1.6 3 1.6 4.4 0M25.6 19c1.4 1.6 3 1.6 4.4 0" stroke="var(--paper)" strokeWidth={1.7} strokeLinecap="round" fill="none" />
      <path d="M22.2 24c1 1 2.6 1 3.6 0" stroke="var(--paper)" strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Ghost({ className, width }: P) {
  return (
    <svg viewBox="0 0 40 46" className={className} width={width} aria-hidden>
      <path d="M6 42V20a14 14 0 0 1 28 0v22l-5-4-4 4-5-4-5 4-4-4z" {...stroke} />
      <circle cx="15" cy="20" r="1.8" fill="currentColor" />
      <circle cx="26" cy="20" r="1.8" fill="currentColor" />
      <path d="M17 27c2 2 4 2 6 0" {...stroke} strokeWidth={1.6} />
    </svg>
  );
}

/** Pilha de três livros, cada um levemente torto. */
export function Books({ className, width }: P) {
  return (
    <svg viewBox="0 0 48 44" className={className} width={width} aria-hidden>
      <rect x="5" y="31" width="38" height="9" rx="2" {...stroke} />
      <rect x="8" y="20" width="32" height="9" rx="2" {...stroke} transform="rotate(-2 24 24)" />
      <rect x="11" y="9" width="26" height="9" rx="2" {...stroke} transform="rotate(2 24 13)" />
      <path d="M11 31v9M14 20v9M17 9v9" {...stroke} strokeWidth={1.5} />
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
      <rect x="4" y="8" width="36" height="28" rx="3" {...stroke} />
      <path d="M4 17h36M13 4v8M31 4v8" {...stroke} />
      <path d="M13 24h3M21 24h3M29 24h3M13 30h3M21 30h3" {...stroke} strokeWidth={2.4} />
    </svg>
  );
}
