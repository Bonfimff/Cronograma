/** Baixa uma vez e guarda no Cache Storage: depois a voz funciona sem internet. */
const CACHE = 'eita-vozes-v1';

export const abrirCache = () => caches.open(CACHE);

export async function buscar(url: string, progresso?: (f: number) => void): Promise<Response> {
  const cache = await abrirCache();
  const guardada = await cache.match(url);
  if (guardada) return guardada;
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`Falha ao baixar a voz (${r.status}).`);
  const total = Number(r.headers.get('Content-Length') || 0);
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let lido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    lido += value.length;
    if (total && progresso) progresso(lido / total);
  }
  const resposta = new Response(new Blob(partes as BlobPart[]), { headers: { 'Content-Type': r.headers.get('Content-Type') ?? '' } });
  await cache.put(url, resposta.clone());
  return resposta;
}
