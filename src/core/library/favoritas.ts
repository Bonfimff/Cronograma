/**
 * Folhas marcadas com estrela na Biblioteca. Ficam no aparelho, como a escolha
 * de tema: é um gosto de quem usa, não conteúdo de estudo. A página Hoje lê
 * daqui para mostrar só o que foi marcado.
 */

const KEY = 'ingles-hibrido:folhas-favoritas';

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

function ler(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

let atual = ler();

export const favoritas = {
  get: () => atual,
  tem: (chave: string) => atual.includes(chave),
  alternar(chave: string) {
    atual = atual.includes(chave) ? atual.filter((k) => k !== chave) : [...atual, chave];
    try { localStorage.setItem(KEY, JSON.stringify(atual)); } catch { /* sem armazenamento */ }
    ouvintes.forEach((o) => o());
  },
  subscribe(o: Ouvinte) {
    ouvintes.add(o);
    return () => { ouvintes.delete(o); };
  },
};
