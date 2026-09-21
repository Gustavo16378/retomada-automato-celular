import { describe, expect, it } from 'vitest';
import {
  criarRegraJogoDaVida,
  desenharPadrao,
  PADRAO_PLANADOR,
  Simulacao,
  VIVA,
} from '../src/engine';

/**
 * O Jogo da Vida funciona aqui como teste de integração da engine inteira.
 *
 * Se o planador anda certo, então quatro coisas estão simultaneamente corretas:
 * a vizinhança de Moore, o contorno periódico, a atualização síncrona (double
 * buffering) e a ordem de varredura. É um teste barato com cobertura enorme, e
 * um comportamento verificável na literatura — o que é bom para o relatório.
 */

function novaSimulacao(largura = 20, altura = 20): Simulacao {
  return new Simulacao({
    largura,
    altura,
    semente: 1,
    regra: criarRegraJogoDaVida(),
    vizinhanca: 'moore',
    raio: 1,
    contorno: 'periodico',
  });
}

/** Conjunto das coordenadas vivas, no formato "x,y". */
function celulasVivas(sim: Simulacao): Set<string> {
  const vivas = new Set<string>();
  for (let y = 0; y < sim.altura; y++) {
    for (let x = 0; x < sim.largura; x++) {
      if (sim.obterCelula(x, y) === VIVA) vivas.add(`${x},${y}`);
    }
  }
  return vivas;
}

/** Desloca um conjunto de coordenadas, respeitando o contorno periódico. */
function deslocar(vivas: Set<string>, dx: number, dy: number, largura: number, altura: number): Set<string> {
  const movidas = new Set<string>();
  for (const chave of vivas) {
    const [x, y] = chave.split(',').map(Number) as [number, number];
    movidas.add(`${(x + dx + largura) % largura},${(y + dy + altura) % altura}`);
  }
  return movidas;
}

function avancar(sim: Simulacao, geracoes: number): void {
  for (let i = 0; i < geracoes; i++) sim.passo();
}

describe('Jogo da Vida — planador', () => {
  it('desloca 1 célula na diagonal a cada 4 gerações', () => {
    const sim = novaSimulacao();
    desenharPadrao(sim, PADRAO_PLANADOR, 5, 5);

    const inicial = celulasVivas(sim);
    expect(inicial.size).toBe(5);

    avancar(sim, 4);

    expect(celulasVivas(sim)).toEqual(deslocar(inicial, 1, 1, sim.largura, sim.altura));
    expect(sim.geracao).toBe(4);
  });

  it('mantém o deslocamento por vários ciclos (4 células em 16 gerações)', () => {
    const sim = novaSimulacao();
    desenharPadrao(sim, PADRAO_PLANADOR, 5, 5);
    const inicial = celulasVivas(sim);

    avancar(sim, 16);

    expect(celulasVivas(sim)).toEqual(deslocar(inicial, 4, 4, sim.largura, sim.altura));
  });

  it('atravessa a borda e reaparece do outro lado (contorno periódico)', () => {
    // Grade pequena: em 40 gerações o planador percorre 10 células em diagonal e
    // dá a volta completa, voltando exatamente à posição inicial.
    const sim = novaSimulacao(10, 10);
    desenharPadrao(sim, PADRAO_PLANADOR, 4, 4);
    const inicial = celulasVivas(sim);

    avancar(sim, 40);

    expect(celulasVivas(sim)).toEqual(inicial);
  });
});

describe('Jogo da Vida — padrões de referência', () => {
  it('o bloco é uma estrutura estável', () => {
    const sim = novaSimulacao();
    desenharPadrao(sim, ['XX', 'XX'], 4, 4);
    const inicial = celulasVivas(sim);

    avancar(sim, 10);

    expect(celulasVivas(sim)).toEqual(inicial);
  });

  it('o pisca-pisca oscila com período 2', () => {
    const sim = novaSimulacao();
    desenharPadrao(sim, ['XXX'], 4, 4);
    const horizontal = celulasVivas(sim);

    sim.passo();
    const vertical = celulasVivas(sim);
    expect(vertical).toEqual(new Set(['5,3', '5,4', '5,5']));
    expect(vertical).not.toEqual(horizontal);

    sim.passo();
    expect(celulasVivas(sim)).toEqual(horizontal);
  });

  it('uma célula isolada morre de solidão (regra S23)', () => {
    const sim = novaSimulacao();
    desenharPadrao(sim, ['X'], 4, 4);

    sim.passo();

    expect(celulasVivas(sim).size).toBe(0);
  });

  it('a vizinhança de Von Neumann muda o resultado da mesma configuração', () => {
    // Não é um teste do Jogo da Vida em si, e sim da plugabilidade: com apenas 4
    // vizinhos, o pisca-pisca não oscila — ele morre.
    const sim = novaSimulacao();
    sim.definirVizinhanca('vonNeumann', 1);
    desenharPadrao(sim, ['XXX'], 4, 4);

    sim.passo();

    expect(celulasVivas(sim).size).toBe(1);
  });
});
