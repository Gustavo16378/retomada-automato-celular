import { FORA_DA_GRADE, type ResolvedorIndice } from './contorno';
import { Estado } from './estados';

/**
 * Vizinhanças plugáveis.
 *
 * As duas vizinhanças clássicas em grades quadradas:
 *  - Von Neumann: distância de Manhattan (|dx| + |dy| <= raio) — os vizinhos
 *    ortogonais. Raio 1 dá 4 vizinhos; raio 2 dá 12.
 *  - Moore: distância de Chebyshev (máx(|dx|, |dy|) <= raio) — inclui as
 *    diagonais. Raio 1 dá 8 vizinhos; raio 2 dá 24.
 *
 * O Jogo da Vida clássico é definido sobre Moore raio 1; o cenário da cidade
 * funciona nas duas, e comparar o espalhamento da contaminação entre elas é um
 * dos experimentos possíveis no relatório.
 */
export type TipoVizinhanca = 'vonNeumann' | 'moore';

/** O trabalho pede raio 1 ou 2; o tipo impede passar valores fora disso. */
export type Raio = 1 | 2;

/** Deslocamento relativo até um vizinho. */
export interface Deslocamento {
  readonly dx: number;
  readonly dy: number;
}

/** Rótulos para a interface. */
export const NOME_VIZINHANCA: Readonly<Record<TipoVizinhanca, string>> = {
  vonNeumann: 'Von Neumann',
  moore: 'Moore',
};

/**
 * Calcula a lista de deslocamentos de uma vizinhança.
 *
 * O resultado é calculado UMA vez e reaproveitado a cada geração (ver a classe
 * `Vizinhanca`). Gerar essa lista dentro do laço principal alocaria milhares de
 * objetos por geração e travaria a animação.
 */
export function criarDeslocamentos(tipo: TipoVizinhanca, raio: Raio): readonly Deslocamento[] {
  const lista: Deslocamento[] = [];

  // A varredura é sempre na mesma ordem (linha a linha, da esquerda para a
  // direita) para que a simulação seja determinística.
  for (let dy = -raio; dy <= raio; dy++) {
    for (let dx = -raio; dx <= raio; dx++) {
      if (dx === 0 && dy === 0) continue; // a própria célula não é vizinha dela
      const distancia =
        tipo === 'vonNeumann'
          ? Math.abs(dx) + Math.abs(dy) // Manhattan
          : Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev
      if (distancia <= raio) lista.push({ dx, dy });
    }
  }

  return lista;
}

/** Função chamada para cada vizinho durante a varredura. */
export type VisitanteVizinho = (estado: Estado, dx: number, dy: number) => void;

/** Predicado usado por `contar`. */
export type PredicadoVizinho = (estado: Estado) => boolean;

/**
 * Leitor de vizinhança: combina deslocamentos + condição de contorno + grade.
 *
 * É a peça que as regras usam para "olhar em volta" sem saber nada sobre como a
 * grade é armazenada nem sobre qual contorno está ativo.
 *
 * Decisão de desempenho deliberada: esta classe é MUTÁVEL e reutilizada. A
 * simulação cria uma única instância e apenas a reposiciona (`posicionar`) a
 * cada célula. Criar um objeto novo por célula significaria ~16 mil objetos por
 * geração, a até 60 gerações por segundo — pressão de coletor de lixo suficiente
 * para causar engasgos visíveis na animação.
 */
export class Vizinhanca {
  /** Quantidade de vizinhos desta configuração (4, 8, 12 ou 24). */
  readonly total: number;

  private readonly deslocamentos: readonly Deslocamento[];
  private readonly resolver: ResolvedorIndice;
  private readonly estadoFora: Estado;
  private grade: Uint8Array;
  private x = 0;
  private y = 0;

  constructor(
    deslocamentos: readonly Deslocamento[],
    resolver: ResolvedorIndice,
    grade: Uint8Array,
    estadoFora: Estado = Estado.SOLO,
  ) {
    this.deslocamentos = deslocamentos;
    this.resolver = resolver;
    this.grade = grade;
    this.estadoFora = estadoFora;
    this.total = deslocamentos.length;
  }

  /**
   * Aponta o leitor para outro vetor de células.
   *
   * Necessário por causa do double buffering: a cada geração a grade "atual"
   * troca de lugar com a "próxima", e o leitor precisa sempre ler da atual.
   */
  usarFonte(grade: Uint8Array): void {
    this.grade = grade;
  }

  /** Centraliza a leitura na célula (x, y). */
  posicionar(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Percorre todos os vizinhos da célula atual. */
  paraCada(visitar: VisitanteVizinho): void {
    for (let i = 0; i < this.deslocamentos.length; i++) {
      const d = this.deslocamentos[i]!;
      const indice = this.resolver(this.x + d.dx, this.y + d.dy);
      // Com contorno fixo, o "lado de fora" conta como solo limpo: é o que faz a
      // contaminação se dissipar nas bordas em vez de dar a volta na grade.
      const estado = indice === FORA_DA_GRADE ? this.estadoFora : (this.grade[indice]! as Estado);
      visitar(estado, d.dx, d.dy);
    }
  }

  /** Conta quantos vizinhos satisfazem o predicado. */
  contar(predicado: PredicadoVizinho): number {
    let quantidade = 0;
    for (let i = 0; i < this.deslocamentos.length; i++) {
      const d = this.deslocamentos[i]!;
      const indice = this.resolver(this.x + d.dx, this.y + d.dy);
      const estado = indice === FORA_DA_GRADE ? this.estadoFora : (this.grade[indice]! as Estado);
      if (predicado(estado)) quantidade++;
    }
    return quantidade;
  }
}
