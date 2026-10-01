import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { store } from './core/storage/store';
import { bindUserContent } from './core/content/userContent';
import { ligarSincronizacaoAutomatica } from './core/api/auto';
import './ui/styles.css';

bindUserContent(store);
ligarSincronizacaoAutomatica();

createRoot(document.getElementById('root')!).render(<App />);
