import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { store } from './core/storage/store';
import { bindUserContent } from './core/content/userContent';
import { ligarSincronizacaoAutomatica } from './core/api/auto';
import './ui/styles.css';

bindUserContent(store);
ligarSincronizacaoAutomatica();

createRoot(document.getElementById('root')!).render(<App />);

// A página só fica isolada (ver public/isolamento.js) a partir da carga seguinte à instalação.
// Uma tentativa por sessão: onde o navegador não isola, como o Safari, nada de recarregar em ciclo.
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (crossOriginIsolated || sessionStorage.getItem('ingles-hibrido:isolando')) return;
    sessionStorage.setItem('ingles-hibrido:isolando', '1');
    location.reload();
  });
  void navigator.serviceWorker.register('./isolamento.js').catch(() => { /* segue com um núcleo */ });
}
