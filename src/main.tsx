import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { store } from './core/storage/store';
import { bindUserContent } from './core/content/userContent';
import './ui/styles.css';

bindUserContent(store);

createRoot(document.getElementById('root')!).render(<App />);
