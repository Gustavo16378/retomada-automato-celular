import { Estado } from './estados';
import { MORTA, VIVA } from './regras';
import type { Simulacao } from './simulacao';

/**
 * Mapas iniciais (condições iniciais do autômato).
 *
 * Todos reiniciam a simulação antes de desenhar, para que a geração volte a
 * zero, o histórico seja descartado e o gerador pseudoaleatório recomece do
 * início da sequência. Sem isso, carregar o mesmo mapa duas vezes com a mesma
 * semente poderia dar resultados diferentes.
 *
 * O mapa "Cidade", gerado proceduralmente, entra na etapa 3 junto com a regra do
 * cenário; aqui estão os mapas que servem ao Jogo da Vida e à validação da
 * engine.
 */
export type IdMapa = 'cidade' | 'vazio' | 'glider' | 'aleatorio';

export const NOME_MAPA: Readonly<Record<IdMapa, string>> = {
  cidade: 'Cidade',
  vazio: 'Vazio',
  glider: 'Planador (glider)',
  aleatorio: 'Sopa aleatória',
};

/**
 * Planador do Jogo da Vida, na orientação que se desloca para sudeste
 * (+1 coluna, +1 linha a cada 4 gerações).
 *
 * Escrito como desenho em texto porque é assim que ele aparece na literatura —
 * quem lê o código compara direto com a figura do relatório. `X` é célula viva.
 */
export const PADRAO_PLANADOR: readonly string[] = [
  '.X.',
  '..X',
  'XXX',
];

/** Densidade padrão da sopa aleatória: proporção de células vivas no início. */
export const DENSIDADE_PADRAO = 0.3;

/** Limpa a grade inteira (por padrão, com solo limpo). */
export function limpar(sim: Simulacao, estado: Estado = Estado.SOLO): void {
  sim.preencher(estado);
}

/**
 * Desenha um padrão em texto na grade, com o canto superior esquerdo em (x0, y0).
 *
 * `.` deixa a célula como está, em vez de apagá-la: assim dá para carimbar vários
 * padrões sobrepostos sem que um apague o outro.
 */
export function desenharPadrao(
  sim: Simulacao,
  padrao: readonly string[],
  x0: number,
  y0: number,
  estadoVivo: Estado = VIVA,
): void {
  for (let linha = 0; linha < padrao.length; linha++) {
    const texto = padrao[linha]!;
    for (let coluna = 0; coluna < texto.length; coluna++) {
      if (texto[coluna] === 'X') {
        sim.definirCelula(x0 + coluna, y0 + linha, estadoVivo);
      }
    }
  }
}

/** Preenche a grade com células vivas sorteadas — a "sopa" clássica do Jogo da Vida. */
export function sopaAleatoria(sim: Simulacao, densidade: number = DENSIDADE_PADRAO): void {
  for (let y = 0; y < sim.altura; y++) {
    for (let x = 0; x < sim.largura; x++) {
      // O sorteio é feito para TODA célula (e não só para as que virarão vivas)
      // de propósito: assim a quantidade de números consumidos do gerador
      // depende apenas do tamanho da grade, e a sequência fica previsível.
      sim.definirCelula(x, y, sim.rng.sorteio(densidade) ? VIVA : MORTA);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Mapa "Cidade", gerado proceduralmente                                      */
/* -------------------------------------------------------------------------- */

/** Ajustes do gerador da cidade. Os padrões foram escolhidos para a grade 160x100. */
export interface OpcoesCidade {
  /** Espessura da faixa de vegetação que cerca a cidade. */
  margemVegetacao: number;
  /** Proporção de células ocupadas dentro da faixa de vegetação. */
  densidadeVegetacao: number;
  larguraQuarteirao: number;
  alturaQuarteirao: number;
  /** Largura das ruas, que são solo exposto entre os quarteirões. */
  larguraRua: number;
  quantidadeFabricas: number;
  /** Chance de um quarteirão ser uma praça (vegetação) em vez de concreto. */
  probPraca: number;
}

export const OPCOES_CIDADE_PADRAO: Readonly<OpcoesCidade> = Object.freeze({
  margemVegetacao: 10,
  densidadeVegetacao: 0.7,
  larguraQuarteirao: 10,
  alturaQuarteirao: 6,
  larguraRua: 3,
  quantidadeFabricas: 5,
  probPraca: 0.08,
});

/** Retângulo de um quarteirão, em coordenadas da grade. */
interface Quarteirao {
  readonly x: number;
  readonly y: number;
  readonly largura: number;
  readonly altura: number;
}

function preencherRetangulo(sim: Simulacao, r: Quarteirao, estado: Estado): void {
  for (let y = r.y; y < r.y + r.altura; y++) {
    for (let x = r.x; x < r.x + r.largura; x++) sim.definirCelula(x, y, estado);
  }
}

/**
 * Sorteia um tipo de vegetação. A grama é a mais comum e a árvore a mais rara,
 * o que dá à faixa verde um aspecto de mata em formação em vez de um bloco liso.
 */
function vegetacaoSorteada(sim: Simulacao): Estado {
  const sorte = sim.rng.proximo();
  if (sorte < 0.5) return Estado.GRAMA;
  if (sorte < 0.82) return Estado.ARBUSTO;
  return Estado.ARVORE;
}

/**
 * Desenha uma cidade vista de cima: faixa de vegetação em volta, quarteirões de
 * concreto separados por ruas de solo exposto e algumas fábricas.
 *
 * Três decisões que moldam a simulação inteira:
 *
 * 1. **As ruas são solo, não concreto.** O concreto é impermeável (regra 5), então
 *    sem ruas a contaminação de uma fábrica cercada de concreto não teria por
 *    onde sair. A malha de ruas é o caminho por onde a mancha se espalha — e é o
 *    que dá ao resultado a cara de uma planta urbana contaminada.
 * 2. **As fábricas ocupam o quarteirão inteiro**, encostando na rua dos quatro
 *    lados. Uma fábrica menor, no miolo do quarteirão, ficaria isolada pelo
 *    concreto e não contaminaria nada.
 * 3. **As fábricas ficam na metade central do mapa.** Assim a faixa de vegetação
 *    da borda sobrevive às primeiras centenas de gerações — e sobreviver é
 *    essencial, porque a regra 3 só faz brotar grama ao lado de vegetação já
 *    existente. Sem nenhuma sobrevivente, a recuperação seria impossível.
 */
export function gerarCidade(sim: Simulacao, ajustes: Partial<OpcoesCidade> = {}): void {
  const opcoes: OpcoesCidade = { ...OPCOES_CIDADE_PADRAO, ...ajustes };

  // 1. Faixa de vegetação cobrindo o mapa todo; a cidade é construída por cima.
  for (let y = 0; y < sim.altura; y++) {
    for (let x = 0; x < sim.largura; x++) {
      const naMargem =
        x < opcoes.margemVegetacao ||
        y < opcoes.margemVegetacao ||
        x >= sim.largura - opcoes.margemVegetacao ||
        y >= sim.altura - opcoes.margemVegetacao;
      if (naMargem && sim.rng.sorteio(opcoes.densidadeVegetacao)) {
        sim.definirCelula(x, y, vegetacaoSorteada(sim));
      }
    }
  }

  // 2. Quarteirões, ladrilhados com uma rua de folga em relação à margem.
  const passoX = opcoes.larguraQuarteirao + opcoes.larguraRua;
  const passoY = opcoes.alturaQuarteirao + opcoes.larguraRua;
  const inicio = opcoes.margemVegetacao + opcoes.larguraRua;
  const limiteX = sim.largura - opcoes.margemVegetacao - opcoes.larguraRua;
  const limiteY = sim.altura - opcoes.margemVegetacao - opcoes.larguraRua;

  const quarteiroes: Quarteirao[] = [];
  for (let y = inicio; y + opcoes.alturaQuarteirao <= limiteY; y += passoY) {
    for (let x = inicio; x + opcoes.larguraQuarteirao <= limiteX; x += passoX) {
      const quarteirao: Quarteirao = {
        x,
        y,
        largura: opcoes.larguraQuarteirao,
        altura: opcoes.alturaQuarteirao,
      };
      quarteiroes.push(quarteirao);
      preencherRetangulo(
        sim,
        quarteirao,
        sim.rng.sorteio(opcoes.probPraca) ? Estado.GRAMA : Estado.CONCRETO,
      );
    }
  }

  // 3. Fábricas, sorteadas entre os quarteirões da região central.
  const centroX = sim.largura / 2;
  const centroY = sim.altura / 2;
  const candidatos = quarteiroes.filter(
    (q) =>
      Math.abs(q.x + q.largura / 2 - centroX) < sim.largura / 4 &&
      Math.abs(q.y + q.altura / 2 - centroY) < sim.altura / 4,
  );

  for (let i = 0; i < opcoes.quantidadeFabricas && candidatos.length > 0; i++) {
    // `splice` remove o sorteado da lista, então duas fábricas nunca caem no
    // mesmo quarteirão.
    const escolhido = candidatos.splice(sim.rng.inteiro(candidatos.length), 1)[0]!;
    preencherRetangulo(sim, escolhido, Estado.FABRICA);
  }
}

/**
 * Carrega um mapa inicial. É o único ponto que a interface precisa conhecer.
 *
 * @param semente se informada, troca a semente antes de desenhar.
 */
export function aplicarMapa(sim: Simulacao, id: IdMapa, semente?: number): void {
  sim.reiniciar(semente);

  switch (id) {
    case 'cidade':
      gerarCidade(sim);
      break;

    case 'vazio':
      // `reiniciar` já deixou tudo como solo limpo.
      break;

    case 'glider':
      // Posicionado perto do canto superior esquerdo para que a viagem em
      // diagonal atravesse a maior parte da grade antes de dar a volta.
      desenharPadrao(sim, PADRAO_PLANADOR, 2, 2);
      break;

    case 'aleatorio':
      sopaAleatoria(sim);
      break;
  }
}
