import { defineConfig } from 'vite';

/**
 * Configuração propositalmente mínima: o projeto não usa framework nem plugins.
 *
 * `base: './'` gera caminhos relativos no build, o que permite publicar tanto na
 * raiz de um domínio (caso do Cloudflare Pages) quanto dentro de um subdiretório,
 * sem precisar reconfigurar nada na hora do deploy.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
