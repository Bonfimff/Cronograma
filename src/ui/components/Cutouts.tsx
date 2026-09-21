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
