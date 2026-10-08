/**
 * Sincronização automática.
 *
 * A tela da Conta tem o botão para sincronizar na hora, mas ninguém deveria
 * precisar passar por lá: enquanto houver conta ligada, este módulo manda o que
 * mudou e traz o que é novo sozinho. Dispara ao abrir o aplicativo, quando a
 * aba volta a aparecer e pouco depois de qualquer alteração nos dados, sempre
 * com uma folga para não falar com o servidor a cada tecla digitada.
 */

import { session } from './session';
import { store } from '../storage/store';
import { sincronizar, sincronizando } from './sync';

const FOLGA = 4000;
const INTERVALO_MINIMO = 15000;

let pendente: ReturnType<typeof setTimeout> | null = null;
let ultima = 0;

function tentar(): void {
  if (!session.signedIn || !session.api.configured) return;
  if (pendente) return;
  const espera = Math.max(FOLGA, INTERVALO_MINIMO - (Date.now() - ultima));
  pendente = setTimeout(() => {
    pendente = null;
    ultima = Date.now();
    sincronizar().catch(() => { /* sem rede ou sessão vencida: tenta na próxima */ });
  }, espera);
}

/** Liga os gatilhos. Chamado uma vez, na partida do aplicativo. */
export function ligarSincronizacaoAutomatica(): void {
  store.subscribe(() => { if (!sincronizando()) tentar(); });
  session.subscribe(() => tentar());
  window.addEventListener('focus', tentar);
  // outra aba entrou em outra conta (ou saiu): esta recarrega para seguir a mesma conta
  window.addEventListener('storage', (e) => {
    if (e.key !== 'ingles-hibrido:conta:v1') return;
    let email: string | null = null;
    try { email = (JSON.parse(e.newValue ?? 'null') as { email?: string } | null)?.email ?? null; } catch { /* ignora */ }
    if (email !== session.get().email) location.reload();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tentar();
  });
  tentar();
}
