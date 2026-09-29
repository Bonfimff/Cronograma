/**
 * Nomes que o usuário deu às folhas da Biblioteca.
 *
 * As folhas de fábrica (vocabulário, expressões, padrões, gramática) têm um
 * nome padrão, mas quem estuda pode preferir outro. O nome escolhido fica no
 * aparelho, junto com as estrelas: é preferência de quem usa, não conteúdo.
 */

const KEY = 'ingles-hibrido:nomes-folhas';

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

function ler(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

let atual = ler();

export const nomes = {
  get: () => atual,
  /** O nome escolhido para a folha, ou o padrão quando não houve troca. */
  de: (chave: string, padrao: string) => atual[chave]?.trim() || padrao,
  definir(chave: string, nome: string) {
    const limpo = nome.trim();
    atual = { ...atual };
    if (limpo) atual[chave] = limpo;
    else delete atual[chave]; // vazio volta ao nome de fábrica
    try { localStorage.setItem(KEY, JSON.stringify(atual)); } catch { /* sem armazenamento */ }
    ouvintes.forEach((o) => o());
  },
  subscribe(o: Ouvinte) {
    ouvintes.add(o);
    return () => { ouvintes.delete(o); };
  },
};
