import { describe, expect, it } from 'vitest';
import { criarResolvedor, FORA_DA_GRADE } from '../src/engine';

/**
 * A condição de contorno é a fonte mais comum de bugs sutis em autômatos
 * celulares: um erro de sinal no `%` só aparece nas bordas, e a olho nu parece
 * apenas "um comportamento estranho na beirada". Por isso os dois contornos são
 * testados isoladamente, antes de qualquer regra.
 */
describe('contorno periódico (toroidal)', () => {
  const largura = 10;
  const altura = 6;
  const resolver = criarResolvedor('periodico', largura, altura);

  it('o vizinho à esquerda da coluna 0 é a última coluna', () => {
    // Célula (0, 3): o vizinho em x = -1 deve dar a volta para x = 9.
    expect(resolver(-1, 3)).toBe(3 * largura + (largura - 1));
  });

  it('o vizinho acima da linha 0 é a última linha', () => {
    expect(resolver(4, -1)).toBe((altura - 1) * largura + 4);
  });

  it('o vizinho à direita da última coluna é a coluna 0', () => {
    expect(resolver(largura, 2)).toBe(2 * largura + 0);
  });

  it('dá a volta também para deslocamentos maiores que a grade', () => {
    expect(resolver(-largura - 1, 0)).toBe(largura - 1);
  });

  it('coordenadas internas continuam valendo o índice linear normal', () => {
    expect(resolver(7, 5)).toBe(5 * largura + 7);
  });
});

describe('contorno fixo', () => {
  const resolver = criarResolvedor('fixo', 10, 6);

  it('devolve FORA_DA_GRADE para qualquer coordenada além da borda', () => {
    expect(resolver(-1, 3)).toBe(FORA_DA_GRADE);
    expect(resolver(3, -1)).toBe(FORA_DA_GRADE);
    expect(resolver(10, 3)).toBe(FORA_DA_GRADE);
    expect(resolver(3, 6)).toBe(FORA_DA_GRADE);
  });

  it('devolve o índice linear para coordenadas internas', () => {
    expect(resolver(0, 0)).toBe(0);
    expect(resolver(9, 5)).toBe(59);
  });
});
