import { defineConfig } from 'vitest/config';

/**
 * Os testes cobrem apenas `src/engine`, que é TypeScript puro.
 *
 * Por isso o ambiente é `node` e não `jsdom`: além de a suíte rodar mais rápido,
 * um teste que acidentalmente dependesse do DOM quebraria na hora — o que é
 * exatamente o comportamento desejado, já que a engine precisa ser independente
 * da interface (ver `testes/arquitetura.test.ts`).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['testes/**/*.test.ts'],
  },
});
