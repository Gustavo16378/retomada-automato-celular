import { describe, expect, it } from 'vitest';
import {
  aplicarMapa,
  criarRegraJogoDaVida,
  criarRng,
  Estado,
  sementeDeTexto,
  Simulacao,
  VIVA,
  type ContextoCelula,
  type Regra,
} from '../src/engine';

/**
 * Reprodutibilidade é requisito do trabalho: a mesma semente precisa gerar
 * exatamente a mesma simulação, do primeiro ao último pixel. Sem isso não dá
 * para repetir um experimento no relatório nem comparar duas execuções.
 *
 * Os testes vão do mais baixo nível (o gerador) ao mais alto (a simulação
 * inteira, com uma regra que consome números aleatórios a cada célula).
 */

/**
 * Regra artificial só para o teste: cada célula tem 20% de chance de virar
 * contaminação leve e 20% de voltar a solo. Serve para exercitar o consumo do
 * gerador dentro do laço principal, coisa que o Jogo da Vida (determinístico)
 * não faz. A regra do cenário da cidade, que chega na etapa 3, é probabilística
 * exatamente assim.
 */
function criarRegraRuido(): Regra {
  return {
    id: 'ruido',
    nome: 'Ruído (apenas para teste)',
    aplicar(ctx: ContextoCelula): Estado {
      if (ctx.rng.sorteio(0.2)) return Estado.CONTAMINADO_LEVE;
      if (ctx.rng.sorteio(0.2)) return Estado.SOLO;
      return ctx.estado;
    },
  };
}

function rodar(semente: number, regra: Regra, geracoes: number): Uint8Array {
  const sim = new Simulacao({ largura: 24, altura: 16, semente, regra });
  aplicarMapa(sim, 'aleatorio', semente);
  for (let i = 0; i < geracoes; i++) sim.passo();
  // Cópia: `grade` devolve o vetor interno, que continuaria mudando se a
  // simulação avançasse depois.
  return Uint8Array.from(sim.grade);
}

describe('gerador pseudoaleatório (mulberry32)', () => {
  it('a mesma semente produz a mesma sequência', () => {
    const a = criarRng(12345);
    const b = criarRng(12345);
    const sequenciaA = Array.from({ length: 50 }, () => a.proximo());
    const sequenciaB = Array.from({ length: 50 }, () => b.proximo());
    expect(sequenciaA).toEqual(sequenciaB);
  });

  it('sementes diferentes produzem sequências diferentes', () => {
    const a = criarRng(1);
    const b = criarRng(2);
    expect(a.proximo()).not.toBe(b.proximo());
  });

  it('todos os valores ficam no intervalo [0, 1)', () => {
    const rng = criarRng(-987654);
    for (let i = 0; i < 1000; i++) {
      const valor = rng.proximo();
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThan(1);
    }
  });

  it('sorteio(0) nunca ocorre e sorteio(1) sempre ocorre', () => {
    const rng = criarRng(7);
    for (let i = 0; i < 200; i++) {
      expect(rng.sorteio(0)).toBe(false);
      expect(rng.sorteio(1)).toBe(true);
    }
  });

  it('sementeDeTexto é estável e aceita números digitados direto', () => {
    expect(sementeDeTexto('cidade-01')).toBe(sementeDeTexto('cidade-01'));
    expect(sementeDeTexto('cidade-01')).not.toBe(sementeDeTexto('cidade-02'));
    expect(sementeDeTexto(' 42 ')).toBe(42);
  });
});

describe('reprodutibilidade da simulação', () => {
  it('a mesma semente gera exatamente a mesma simulação (regra determinística)', () => {
    const a = rodar(2024, criarRegraJogoDaVida(), 30);
    const b = rodar(2024, criarRegraJogoDaVida(), 30);
    expect(a).toEqual(b);
  });

  it('a mesma semente gera exatamente a mesma simulação (regra probabilística)', () => {
    const a = rodar(2024, criarRegraRuido(), 30);
    const b = rodar(2024, criarRegraRuido(), 30);
    expect(a).toEqual(b);
  });

  it('sementes diferentes geram simulações diferentes', () => {
    const a = rodar(1, criarRegraJogoDaVida(), 10);
    const b = rodar(2, criarRegraJogoDaVida(), 10);
    expect(a).not.toEqual(b);
  });

  it('reiniciar recria o gerador, e não apenas a grade', () => {
    // Se `reiniciar` não recriasse o gerador, a segunda sopa aleatória sairia
    // diferente da primeira, porque a sequência continuaria de onde parou.
    const sim = new Simulacao({
      largura: 24,
      altura: 16,
      semente: 99,
      regra: criarRegraJogoDaVida(),
    });

    aplicarMapa(sim, 'aleatorio');
    const primeira = Uint8Array.from(sim.grade);

    for (let i = 0; i < 5; i++) sim.passo();
    aplicarMapa(sim, 'aleatorio');

    expect(Uint8Array.from(sim.grade)).toEqual(primeira);
    expect(sim.geracao).toBe(0);
  });
});

describe('estatísticas e histórico', () => {
  it('conta as células por estado e registra uma linha por geração', () => {
    const sim = new Simulacao({
      largura: 10,
      altura: 10,
      semente: 5,
      regra: criarRegraJogoDaVida(),
    });
    aplicarMapa(sim, 'vazio');

    const inicial = sim.estatisticas();
    expect(inicial.geracao).toBe(0);
    expect(inicial.contagem[Estado.SOLO]).toBe(100);
    expect(inicial.total).toBe(100);

    sim.definirCelula(1, 1, VIVA);
    // A geração continua sendo a 0, então o histórico não pode ganhar uma linha
    // nova — a existente é atualizada.
    expect(sim.estatisticas().contagem[VIVA]).toBe(1);
    expect(sim.historico).toHaveLength(1);

    sim.passo();
    expect(sim.historico).toHaveLength(2);
    expect(sim.historico[1]!.geracao).toBe(1);
  });

  it('os percentuais somam o esperado para uma grade metade concreto', () => {
    const sim = new Simulacao({
      largura: 10,
      altura: 10,
      semente: 5,
      regra: criarRegraJogoDaVida(),
    });
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 10; x++) sim.definirCelula(x, y, Estado.CONCRETO);
    }

    const estatisticas = sim.estatisticas();
    expect(estatisticas.percentualConcreto).toBeCloseTo(50);
    expect(estatisticas.percentualVegetacao).toBeCloseTo(0);
    expect(estatisticas.percentualContaminado).toBeCloseTo(0);
  });
});
