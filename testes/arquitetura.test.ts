import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Teste de arquitetura.
 *
 * O enunciado do trabalho exige que a engine seja independente da interface.
 * Isso é fácil de respeitar no primeiro dia e fácil de quebrar no terceiro —
 * basta alguém acrescentar um `console` de depuração que use algo do navegador,
 * ou importar uma cor do renderizador "só para testar". Este teste transforma a
 * regra de arquitetura em algo verificável automaticamente, junto com o resto da
 * suíte.
 */

const diretorioEngine = fileURLToPath(new URL('../src/engine', import.meta.url));

/** Identificadores que só existem no navegador. Nenhum pode aparecer na engine. */
const IDENTIFICADORES_PROIBIDOS = [
  'document',
  'window',
  'navigator',
  'localStorage',
  'sessionStorage',
  'fetch',
  'requestAnimationFrame',
  'HTMLElement',
  'HTMLCanvasElement',
  'CanvasRenderingContext2D',
  'ImageData',
];

function arquivosDaEngine(): string[] {
  return readdirSync(diretorioEngine).filter((nome) => nome.endsWith('.ts'));
}

describe('a engine não depende do navegador', () => {
  it('encontra os arquivos da engine', () => {
    expect(arquivosDaEngine().length).toBeGreaterThan(0);
  });

  it.each(arquivosDaEngine())('%s não usa nenhuma API do navegador', (nome) => {
    const conteudo = readFileSync(join(diretorioEngine, nome), 'utf8');
    for (const identificador of IDENTIFICADORES_PROIBIDOS) {
      const ocorrencia = new RegExp(`\\b${identificador}\\b`);
      expect(
        ocorrencia.test(conteudo),
        `${nome} referencia "${identificador}", que só existe no navegador`,
      ).toBe(false);
    }
  });

  it.each(arquivosDaEngine())('%s não importa nada de fora da engine', (nome) => {
    const conteudo = readFileSync(join(diretorioEngine, nome), 'utf8');
    // Captura tanto `import ... from '...'` quanto `export ... from '...'`.
    const importacoes = [...conteudo.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);

    for (const caminho of importacoes) {
      expect(
        caminho.startsWith('./'),
        `${nome} importa "${caminho}"; a engine só pode importar dos próprios módulos`,
      ).toBe(true);
    }
  });
});
