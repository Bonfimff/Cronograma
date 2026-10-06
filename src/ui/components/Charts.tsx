/**
 * Gráficos desenhados à mão livre, no traço do resto do site.
 *
 * Nada de eixo rígido nem grade: as linhas tremem de leve, o traço passa duas
 * vezes como caneta em papel e os números ficam na letra manuscrita. O tremor é
 * sempre o mesmo para os mesmos dados (vem de um sorteio com semente fixa), para
 * o desenho não dançar a cada vez que a tela se redesenha.
 */

type Ponto = [number, number];

/** Sorteio determinístico: mesma semente, mesma sequência. */
function sorteio(semente: number) {
  let s = semente || 1;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5; // -0.5 .. 0.5
  };
}

/** Caminho que passa pelos pontos com um tremor de mão. */
function tremido(pontos: Ponto[], amp: number, semente: number): string {
  const r = sorteio(semente);
  return pontos
    .map(([x, y], i) => `${i ? 'L' : 'M'}${(x + r() * amp).toFixed(1)} ${(y + r() * amp).toFixed(1)}`)
    .join(' ');
}

/** Linha reta desenhada à mão: parte no meio para dar a quebra do traço. */
function risco(x1: number, y1: number, x2: number, y2: number, amp: number, semente: number): string {
  const meio: Ponto = [(x1 + x2) / 2, (y1 + y2) / 2];
  return tremido([[x1, y1], meio, [x2, y2]], amp, semente);
}

export interface BarraItem {
  label: string;
  valor: number;  // 0..1
  nota?: string;
}

/** Barras tortas, cada uma com a sua inclinação. */
export function SketchBars({ itens, altura = 132 }: { itens: BarraItem[]; altura?: number }) {
  if (!itens.length) return null;
  const L = 300, vao = L / itens.length, largura = Math.min(34, vao * 0.56);
  const base = altura - 22;

  return (
    <svg viewBox={`0 0 ${L} ${altura}`} className="grafico" role="img" preserveAspectRatio="none">
      <path d={risco(4, base, L - 4, base, 1.6, 17)} className="g-eixo" />
      {itens.map((it, i) => {
        const x = vao * i + vao / 2;
        const h = Math.max(3, it.valor * (base - 14));
        const incl = ((i % 3) - 1) * 1.6;
        const r = sorteio(i * 91 + 7);
        const meia = largura / 2;
        const topo = base - h;
        const caminho = tremido([
          [x - meia, base], [x - meia + r() * 2, topo + 2], [x + meia + r() * 2, topo],
          [x + meia, base], [x - meia, base],
        ], 1.5, i * 31 + 3);
        return (
          <g key={it.label} transform={`rotate(${incl} ${x} ${base})`}>
            <path d={caminho} className="g-barra" />
            <path d={caminho} className="g-barra-traco" />
          </g>
        );
      })}
    </svg>
  );
}

/** Linha do tempo em traço solto, com a área por baixo hachurada. */
export function SketchLine({ valores, altura = 120 }: { valores: number[]; altura?: number }) {
  if (valores.length < 2) return null;
  const L = 300, base = altura - 20, topo = 12;
  const maior = Math.max(...valores, 1);
  const pontos: Ponto[] = valores.map((v, i) => [
    6 + (i * (L - 12)) / (valores.length - 1),
    base - (v / maior) * (base - topo),
  ]);

  return (
    <svg viewBox={`0 0 ${L} ${altura}`} className="grafico" role="img" preserveAspectRatio="none">
      <path d={risco(4, base, L - 4, base, 1.6, 23)} className="g-eixo" />
      {pontos.map(([x, y], i) => (valores[i] ? <path key={i} d={risco(x, base, x, y + 3, 1.2, i * 13 + 5)} className="g-haste" /> : null))}
      <path d={tremido(pontos, 2.2, 41)} className="g-linha" />
      <path d={tremido(pontos, 3.4, 77)} className="g-linha g-linha-2" />
      {pontos.map(([x, y], i) => (valores[i] ? <circle key={i} cx={x} cy={y} r="2.6" className="g-ponto" /> : null))}
    </svg>
  );
}

/** Régua com um ponto por conteúdo: onde cada um caiu no tempo até firmar. */
export function SketchDots({ valores, maximo }: { valores: number[]; maximo?: number }) {
  if (!valores.length) return null;
  const L = 300, alt = 64, base = 40;
  const teto = Math.max(maximo ?? 0, ...valores, 1);
  return (
    <svg viewBox={`0 0 ${L} ${alt}`} className="grafico" role="img" preserveAspectRatio="none">
      <path d={risco(6, base, L - 6, base, 1.8, 59)} className="g-eixo" />
      {valores.map((v, i) => {
        const r = sorteio(i * 47 + 11);
        const x = 6 + (v / teto) * (L - 12);
        return <circle key={i} cx={x + r() * 3} cy={base - 9 + r() * 10} r={3.4} className="g-ponto g-ponto-cheio" />;
      })}
    </svg>
  );
}

export interface Coluna {
  rotulo: string;
  valor: number;
  /** o número escrito em cima da coluna ("42 min", "78%"); vazio = sem dado */
  texto: string;
  destaque?: boolean;
}

/**
 * Colunas com o valor escrito em cima e o nome embaixo, cada um alinhado à sua coluna.
 * Feito para ler de relance: nada de eixo para decifrar nem linha que some quando há zeros.
 */
export function Colunas({ itens, altura = 140, legenda }: { itens: Coluna[]; altura?: number; legenda?: string }) {
  if (!itens.length) return null;
  const maior = Math.max(...itens.map((c) => c.valor), 1);
  return (
    <figure className="colunas" aria-label={legenda}>
      <div className="colunas-area" style={{ height: altura }}>
        {itens.map((c, i) => (
          <div key={`${c.rotulo}-${i}`} className={`coluna${c.destaque ? ' destaque' : ''}${c.valor ? '' : ' vazia'}`}>
            <span className="coluna-valor">{c.texto || '—'}</span>
            <span className="coluna-barra" style={{ height: `${Math.max(c.valor ? 6 : 2, (c.valor / maior) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="colunas-rotulos">
        {itens.map((c, i) => <span key={`${c.rotulo}-${i}`} className={c.destaque ? 'destaque' : ''}>{c.rotulo}</span>)}
      </div>
      {legenda && <figcaption>{legenda}</figcaption>}
    </figure>
  );
}

/** Anel rabiscado: o traço dá quase a volta e não fecha certinho. */
export function SketchRing({ valor, centro }: { valor: number; centro: string }) {
  const R = 46, c = 60, volta = 2 * Math.PI * R;
  const arco = Math.max(0.02, Math.min(1, valor));
  return (
    <div className="anel">
      <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden>
        <circle cx={c} cy={c} r={R} className="g-anel-fundo" />
        <circle
          cx={c} cy={c} r={R} className="g-anel"
          strokeDasharray={`${volta * arco} ${volta}`}
          transform={`rotate(-96 ${c} ${c})`}
        />
        <circle
          cx={c} cy={c} r={R - 3.5} className="g-anel g-anel-2"
          strokeDasharray={`${volta * arco * 0.96} ${volta}`}
          transform={`rotate(-92 ${c} ${c})`}
        />
      </svg>
      <strong className="anel-num">{centro}</strong>
    </div>
  );
}
