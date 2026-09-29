/**
 * Tema da interface: escuro (o de sempre) ou claro, num papel envelhecido.
 *
 * A escolha fica no aparelho. Sem escolha, segue o sistema do usuário. O valor
 * é escrito em `data-tema` na raiz do documento e o index.html aplica isso antes
 * da primeira pintura, para a tela não piscar na cor errada.
 */

export type Tema = 'escuro' | 'claro';
export const TEMA_KEY = 'ingles-hibrido:tema';

export function temaDoSistema(): Tema {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro';
}

export function temaGuardado(): Tema | null {
  try {
    const v = localStorage.getItem(TEMA_KEY);
    return v === 'claro' || v === 'escuro' ? v : null;
  } catch {
    return null;
  }
}

export function temaAtual(): Tema {
  return temaGuardado() ?? temaDoSistema();
}

export function aplicarTema(t: Tema): void {
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem(TEMA_KEY, t); } catch { /* sem armazenamento */ }
}
