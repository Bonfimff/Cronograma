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
/** Poste de placas de rua, bem alto. */
export const Signpost = (p: C) => <Cut file="signpost" {...p} />;
/** Bode de olhos arregalados, gritando. */
export const Goat = (p: C) => <Cut file="goat" {...p} />;
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
