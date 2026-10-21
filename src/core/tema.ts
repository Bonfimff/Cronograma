/**
 * Tema da interface: claro, num papel envelhecido, ou escuro.
 *
 * O site abre sempre no claro. O sistema do usuário não decide isso: quem estuda
 * numa tela escura por acidente lê pior as folhas, que são desenhadas no papel
 * claro. Quem preferir o escuro troca em Ajustes, e a escolha fica no aparelho.
 *
 * O valor é escrito em `data-tema` na raiz do documento, e o index.html aplica
 * isso antes da primeira pintura, para a tela não piscar na cor errada.
 */

export type Tema = 'escuro' | 'claro';
export const TEMA_KEY = 'ingles-hibrido:tema';

/** Com o que o site abre, antes de qualquer escolha. O mesmo valor está no index.html. */
export const TEMA_PADRAO: Tema = 'claro';

export function temaGuardado(): Tema | null {
  try {
    const v = localStorage.getItem(TEMA_KEY);
    return v === 'claro' || v === 'escuro' ? v : null;
  } catch {
    return null;
  }
}

export function temaAtual(): Tema {
  return temaGuardado() ?? TEMA_PADRAO;
}

export function aplicarTema(t: Tema): void {
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem(TEMA_KEY, t); } catch { /* sem armazenamento */ }
}
