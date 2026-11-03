/**
 * Vários núcleos para as vozes: o navegador só libera threads em WebAssembly quando a página está
 * isolada, por estes cabeçalhos. O GitHub Pages não deixa configurá-los, então este service worker
 * os acrescenta às respostas do próprio site. Não guarda nada: tudo continua vindo da rede.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (new URL(pedido.url).origin !== self.location.origin) return;
  if (pedido.cache === 'only-if-cached' && pedido.mode !== 'same-origin') return;
  e.respondWith(fetch(pedido).then((r) => {
    const cabecalhos = new Headers(r.headers);
    cabecalhos.set('Cross-Origin-Opener-Policy', 'same-origin');
    // credentialless: fontes e outros recursos de fora continuam carregando, só que sem cookies
    cabecalhos.set('Cross-Origin-Embedder-Policy', 'credentialless');
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: cabecalhos });
  }));
});
