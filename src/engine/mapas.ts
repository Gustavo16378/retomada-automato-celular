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
export type IdMapa = 'vazio' | 'glider' | 'aleatorio';

export const NOME_MAPA: Readonly<Record<IdMapa, string>> = {
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

/**
 * Carrega um mapa inicial. É o único ponto que a interface precisa conhecer.
 *
 * @param semente se informada, troca a semente antes de desenhar.
 */
export function aplicarMapa(sim: Simulacao, id: IdMapa, semente?: number): void {
  sim.reiniciar(semente);

  switch (id) {
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
