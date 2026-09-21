import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` habilita HTTPS local — necessário para usar a câmera ao vivo no celular pela rede.
// `base` alinhado ao nome do repositório porque o GitHub Pages serve em usuario.github.io/Cronograma/.
export default defineConfig(({ mode }) => ({
  base: '/Cronograma/',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
}));
