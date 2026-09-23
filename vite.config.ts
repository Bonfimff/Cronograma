import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` habilita HTTPS local — necessário para usar a câmera ao vivo no celular pela rede.
// `base` relativo: o site é servido na raiz do domínio próprio (eita.exksvol.com)
// e também responderia em usuario.github.io/Cronograma/ — com caminhos relativos
// os mesmos arquivos funcionam nos dois lugares.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
}));
