import { describe, expect, it } from 'vitest';
import {
  aplicarMapa,
  COLUNAS_CSV,
  criarParametrosCenario,
  criarRegraCenario,
  Estado,
  montarCsv,
  Simulacao,
} from '../src/engine';

/**
 * O CSV é o que leva a simulação para fora do navegador — para a planilha do
 * relatório. Um erro aqui só apareceria depois, na hora de montar o gráfico, com
 * os dados já coletados; daí valer a pena testá-lo.
 */

function simulacaoDeTeste(): Simulacao {
  const sim = new Simulacao({
    largura: 30,
    altura: 20,
    semente: 11,
    regra: criarRegraCenario(criarParametrosCenario({ fase: 'acidente' })),
    contorno: 'fixo',
  });
  aplicarMapa(sim, 'cidade');
  return sim;
}

describe('exportação em CSV', () => {
  it('tem cabeçalho e uma linha por geração', () => {
    const sim = simulacaoDeTeste();
    for (let g = 0; g < 5; g++) sim.passo();

    const linhas = montarCsv(sim.historico).trim().split('\n');

    expect(linhas[0]).toBe(COLUNAS_CSV.join(';'));
    // Geração 0 mais as cinco calculadas.
    expect(linhas).toHaveLength(7);
    expect(linhas[1]!.startsWith('0;')).toBe(true);
    expect(linhas[6]!.startsWith('5;')).toBe(true);
  });

  it('todas as linhas têm a mesma quantidade de colunas do cabeçalho', () => {
    const sim = simulacaoDeTeste();
    for (let g = 0; g < 3; g++) sim.passo();

    for (const linha of montarCsv(sim.historico).trim().split('\n')) {
      expect(linha.split(';')).toHaveLength(COLUNAS_CSV.length);
    }
  });

  it('as contagens por estado somam o total de células', () => {
    const sim = simulacaoDeTeste();
    sim.passo();

    const linha = montarCsv(sim.historico).trim().split('\n')[1]!.split(';');
    // Colunas 1..9 são as contagens por estado; a 10 é o total.
    const soma = linha.slice(1, 10).reduce((acumulado, valor) => acumulado + Number(valor), 0);
    expect(soma).toBe(Number(linha[10]));
    expect(soma).toBe(sim.totalCelulas);
  });

  it('usa vírgula decimal nos percentuais, no formato brasileiro', () => {
    const sim = simulacaoDeTeste();
    sim.passo();

    const percentuais = montarCsv(sim.historico).trim().split('\n')[1]!.split(';').slice(11);
    expect(percentuais).toHaveLength(3);
    for (const valor of percentuais) {
      expect(valor).toMatch(/^\d+,\d$/);
    }
  });

  it('o percentual declarado bate com a contagem da mesma linha', () => {
    const sim = simulacaoDeTeste();
    for (let g = 0; g < 4; g++) sim.passo();

    const colunas = montarCsv(sim.historico).trim().split('\n').at(-1)!.split(';');
    const vegetacao =
      Number(colunas[7]) + Number(colunas[8]) + Number(colunas[9]); // grama, arbusto, árvore
    const esperado = ((vegetacao / Number(colunas[10])) * 100).toFixed(1).replace('.', ',');

    expect(colunas[12]).toBe(esperado);
  });

  it('um histórico vazio produz só o cabeçalho', () => {
    expect(montarCsv([]).trim()).toBe(COLUNAS_CSV.join(';'));
  });

  it('a coluna da usina reflete o bloco do reator', () => {
    const sim = simulacaoDeTeste();
    sim.passo();
    const colunas = montarCsv(sim.historico).trim().split('\n')[1]!.split(';');
    expect(Number(colunas[5])).toBe(sim.estatisticas().contagem[Estado.USINA]);
  });
});
