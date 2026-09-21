import { describe, expect, it } from 'vitest';
import {
  criarDeslocamentos,
  criarResolvedor,
  Estado,
  Vizinhanca,
  type Deslocamento,
} from '../src/engine';

/** Transforma a lista em um conjunto de strings "dx,dy", para comparar sem depender da ordem. */
function comoConjunto(deslocamentos: readonly Deslocamento[]): Set<string> {
  return new Set(deslocamentos.map((d) => `${d.dx},${d.dy}`));
}

describe('contagem de vizinhos por tipo e raio', () => {
  it('Von Neumann raio 1 tem 4 vizinhos (apenas ortogonais)', () => {
    const deslocamentos = criarDeslocamentos('vonNeumann', 1);
    expect(deslocamentos).toHaveLength(4);
    expect(comoConjunto(deslocamentos)).toEqual(new Set(['0,-1', '-1,0', '1,0', '0,1']));
  });

  it('Moore raio 1 tem 8 vizinhos (inclui as diagonais)', () => {
    expect(criarDeslocamentos('moore', 1)).toHaveLength(8);
  });

  it('Von Neumann raio 2 tem 12 vizinhos', () => {
    expect(criarDeslocamentos('vonNeumann', 2)).toHaveLength(12);
  });

  it('Moore raio 2 tem 24 vizinhos', () => {
    expect(criarDeslocamentos('moore', 2)).toHaveLength(24);
  });

  it('nenhuma vizinhança inclui a própria célula', () => {
    for (const tipo of ['vonNeumann', 'moore'] as const) {
      for (const raio of [1, 2] as const) {
        expect(comoConjunto(criarDeslocamentos(tipo, raio)).has('0,0')).toBe(false);
      }
    }
  });
});

describe('leitura da vizinhança sobre a grade', () => {
  const largura = 5;
  const altura = 5;

  /** Grade 5x5 com uma cruz de árvores em volta do centro (2,2). */
  function gradeComCruz(): Uint8Array {
    const grade = new Uint8Array(largura * altura).fill(Estado.SOLO);
    grade[1 * largura + 2] = Estado.ARVORE; // acima
    grade[3 * largura + 2] = Estado.ARVORE; // abaixo
    grade[2 * largura + 1] = Estado.ARVORE; // esquerda
    grade[2 * largura + 3] = Estado.ARVORE; // direita
    return grade;
  }

  const ehArvore = (estado: Estado) => estado === Estado.ARVORE;

  it('conta os vizinhos ortogonais em Von Neumann', () => {
    const grade = gradeComCruz();
    const vizinhanca = new Vizinhanca(
      criarDeslocamentos('vonNeumann', 1),
      criarResolvedor('fixo', largura, altura),
      grade,
    );
    vizinhanca.posicionar(2, 2);
    expect(vizinhanca.contar(ehArvore)).toBe(4);
  });

  it('com contorno fixo, o lado de fora conta como solo limpo', () => {
    const grade = new Uint8Array(largura * altura).fill(Estado.CONTAMINADO_GRAVE);
    const vizinhanca = new Vizinhanca(
      criarDeslocamentos('moore', 1),
      criarResolvedor('fixo', largura, altura),
      grade,
    );
    // Canto superior esquerdo: dos 8 vizinhos, 5 estão fora da grade.
    vizinhanca.posicionar(0, 0);
    expect(vizinhanca.contar((e) => e === Estado.SOLO)).toBe(5);
    expect(vizinhanca.contar((e) => e === Estado.CONTAMINADO_GRAVE)).toBe(3);
  });

  it('com contorno periódico, o canto enxerga o lado oposto da grade', () => {
    const grade = new Uint8Array(largura * altura).fill(Estado.CONTAMINADO_GRAVE);
    const vizinhanca = new Vizinhanca(
      criarDeslocamentos('moore', 1),
      criarResolvedor('periodico', largura, altura),
      grade,
    );
    vizinhanca.posicionar(0, 0);
    expect(vizinhanca.contar((e) => e === Estado.SOLO)).toBe(0);
    expect(vizinhanca.contar((e) => e === Estado.CONTAMINADO_GRAVE)).toBe(8);
  });

  it('paraCada informa o deslocamento de cada vizinho (base para o vento)', () => {
    const grade = gradeComCruz();
    const vizinhanca = new Vizinhanca(
      criarDeslocamentos('vonNeumann', 1),
      criarResolvedor('fixo', largura, altura),
      grade,
    );
    vizinhanca.posicionar(2, 2);

    const vistos: string[] = [];
    vizinhanca.paraCada((estado, dx, dy) => {
      if (estado === Estado.ARVORE) vistos.push(`${dx},${dy}`);
    });

    expect(new Set(vistos)).toEqual(new Set(['0,-1', '-1,0', '1,0', '0,1']));
  });

  it('usarFonte troca a grade lida, como exige o double buffering', () => {
    const vazia = new Uint8Array(largura * altura).fill(Estado.SOLO);
    const vizinhanca = new Vizinhanca(
      criarDeslocamentos('moore', 1),
      criarResolvedor('periodico', largura, altura),
      vazia,
    );
    vizinhanca.posicionar(2, 2);
    expect(vizinhanca.contar(ehArvore)).toBe(0);

    vizinhanca.usarFonte(gradeComCruz());
    expect(vizinhanca.contar(ehArvore)).toBe(4);
  });
});
