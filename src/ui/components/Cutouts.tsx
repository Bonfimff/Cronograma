import { useEffect, useRef } from 'react';

/**
 * Recortes de imagem da referência (pasta /IMG, tratados em public/cut).
 * São fotos/gravuras com fundo já removido — entram como enfeite, nunca
 * carregando informação: por isso ficam com alt vazio e não são clicáveis.
 */

const BASE = import.meta.env.BASE_URL;

type C = { className?: string; width?: number | string };

function Cut({ file, className, width }: C & { file: string }) {
  return (
    <img
      src={`${BASE}cut/${file}.webp`}
      className={`cutout ${className ?? ''}`}
      width={width}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

/** Filósofo de óculos escuros — o personagem do topo da referência. */
export const Philosopher = (p: C) => <Cut file="philosopher" {...p} />;
/** Gato professor de casaca, com ponteiro e lousa. */
export const CatTeacher = (p: C) => <Cut file="cat-teacher" {...p} />;
/** Corvo lendo em cima de uma pilha de livros antigos. */
export const CrowBooks = (p: C) => <Cut file="crow-books" {...p} />;
/** Fantasminha adesivo. */
export const GhostCut = (p: C) => <Cut file="ghost" {...p} />;
/**
 * O fantasma vagando pela tela. Ele escolhe um ponto qualquer do espaço livre e
 * vai flutuando até lá: a velocidade sobe e desce devagar (nada de linha reta),
 * o corpo balança de leve como quem boia, inclina para o lado do movimento,
 * vira de frente para onde vai e fica um pouco maior quando desce — como se
 * estivesse mais perto. Ao chegar, escolhe outro canto e recomeça.
 */
export function GhostFloat({ className, width = 104 }: C) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const TOP = 96; // abaixo do cabeçalho
    const BOTTOM = 104; // acima da barra de navegação
    const size = typeof width === 'number' ? width : 104;
    const margin = size * 0.28; // folga para a inclinação e o zoom não passarem da borda
    const area = () => ({
      x0: margin,
      x1: Math.max(margin, window.innerWidth - size - margin),
      y0: TOP,
      y1: Math.max(TOP, window.innerHeight - size - BOTTOM),
    });

    const spot = () => {
      const a = area();
      return { x: a.x0 + Math.random() * (a.x1 - a.x0), y: a.y0 + Math.random() * (a.y1 - a.y0) };
    };
    /** Próximo destino: longe do lugar atual, para ele cruzar a tela inteira. */
    const pick = (from?: { x: number; y: number }) => {
      const a = area();
      const far = Math.hypot(a.x1 - a.x0, a.y1 - a.y0) * 0.45;
      let best = spot();
      if (!from) return best;
      for (let i = 0; i < 12 && Math.hypot(best.x - from.x, best.y - from.y) < far; i++) best = spot();
      return best;
    };

    let pos = spot();
    let target = pick(pos);
    let vx = 0;
    let vy = 0;
    let face = 1; // 1 olhando para a direita, -1 para a esquerda
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // segundos, sem saltos ao voltar de outra aba
      last = now;

      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 24) target = pick(pos);

      // acelera na direção do alvo e perde velocidade no caminho: o movimento
      // ganha inércia e faz curvas largas em vez de virar de bico
      const pull = 52; // aceleração rumo ao destino
      vx += (dx / dist) * pull * dt;
      vy += (dy / dist) * pull * dt;
      const drag = Math.pow(0.42, dt); // freio do ar: segura a velocidade sem travar
      vx *= drag;
      vy *= drag;

      pos = { x: pos.x + vx, y: pos.y + vy };
      const a = area();
      pos.x = Math.min(a.x1, Math.max(a.x0, pos.x));
      pos.y = Math.min(a.y1, Math.max(a.y0, pos.y));

      const t = now / 1000;
      const bob = Math.sin(t * 1.7) * 6 + Math.sin(t * 0.9) * 3; // sobe e desce boiando
      const sway = Math.sin(t * 1.1) * 2.5; // balanço do lençol
      if (Math.abs(vx) > 0.25) face = vx > 0 ? 1 : -1;
      const tilt = Math.max(-14, Math.min(14, vx * 2.2)) + sway;
      // mais perto do rodapé, um tico maior: dá profundidade ao passeio
      const depth = 0.92 + ((pos.y - a.y0) / Math.max(1, a.y1 - a.y0)) * 0.22;

      el.style.transform =
        `translate(${pos.x.toFixed(1)}px, ${(pos.y + bob).toFixed(1)}px) ` +
        `rotate(${tilt.toFixed(2)}deg) scale(${depth.toFixed(3)}, ${(depth * 0.99).toFixed(3)}) ` +
        `scaleX(${face})`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onResize = () => { target = pick(pos); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [width]);

  return (
    <img
      ref={ref}
      src={`${BASE}cut/ghost.webp`}
      className={`cutout ${className ?? ''}`}
      width={width}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

/** Mãos digitando num laptop, em meio-tom. */
export const LaptopCut = (p: C) => <Cut file="laptop" {...p} />;
/** Sujeito escondido atrás do jornal. */
export const NewspaperMan = (p: C) => <Cut file="newspaper-man" {...p} />;

/**
 * O mesmo sujeito, piscando e olhando de lado. A bolinha do olho é fixa na
 * imagem, então cada olho recebe uma elipse da cor do papel por cima (que
 * apaga a bolinha original) e uma pupila nova que anda de um lado pro outro.
 * As pálpebras vêm depois, para passarem por cima de tudo.
 */
export function NewspaperManLive({ className, width }: C) {
  return (
    <span className={`cut-live newsman ${className ?? ''}`} style={{ width }}>
      <Cut file="newspaper-man" />
      <i className="eyeball eyeball-l"><i className="pupil" /></i>
      <i className="eyeball eyeball-r"><i className="pupil" /></i>
      <i className="lid lid-l" />
      <i className="lid lid-r" />
    </span>
  );
}
/** Poste de placas de rua, bem alto. */
export const Signpost = (p: C) => <Cut file="signpost" {...p} />;

/**
 * O mesmo poste, com o semáforo aceso: o recorte é uma imagem chapada, então
 * as três luzes são bolinhas por cima, posicionadas em porcentagem da imagem
 * (assim acompanham qualquer largura). O ciclo é verde → amarelo → vermelho.
 */
export function SignpostLive({ className, width }: C) {
  return (
    <span className={`cut-live signpost ${className ?? ''}`} style={{ width }}>
      <Cut file="signpost" />
      <i className="lamp lamp-red" />
      <i className="lamp lamp-amber" />
      <i className="lamp lamp-green" />
    </span>
  );
}
/**
 * Cabra berrando, quadro a quadro. Os 4 quadros (boca aberta → fechando →
 * quase fechada → fechada) ficam lado a lado numa imagem só, já alinhados entre
 * si; o CSS troca o quadro visível no compasso do berro.
 */
export function GoatTalking({ className, width }: C) {
  return (
    <span
      className={`goat-talk ${className ?? ''}`}
      style={{ width, backgroundImage: `url(${BASE}cut/goat-talk.webp)` }}
      aria-hidden
    />
  );
}
/** Dinossauro subindo preso a balões. */
export const Trex = (p: C) => <Cut file="trex" {...p} />;
/** Guaxinim com café e espada. */
export const Raccoon = (p: C) => <Cut file="raccoon" {...p} />;
/** Capivara de luvas de boxe. */
export const Capybara = (p: C) => <Cut file="capybara" {...p} />;
/** Corvo de capa e botas amarelas. */
export const CrowRaincoat = (p: C) => <Cut file="crow-raincoat" {...p} />;
/** Gato de óculos escuros gritando no megafone. */
export const CatMegaphone = (p: C) => <Cut file="cat-megaphone" {...p} />;
