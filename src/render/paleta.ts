import { Estado, TODOS_OS_ESTADOS, TOTAL_ESTADOS } from '../engine';

/**
 * Paleta de cores do autômato.
 *
 * A escolha das cores é parte da leitura do fenômeno, não enfeite:
 *  - o solo é marrom bem escuro para que qualquer contaminação salte à vista;
 *  - a contaminação vai de lima "tóxico" a roxo, passando por um ocre doentio;
 *    a mudança de matiz (e não só de brilho) é o que permite distinguir os três
 *    níveis mesmo em células de poucos pixels;
 *  - a vegetação usa três verdes que escurecem conforme a planta amadurece, o
 *    que faz uma área recuperada parecer mais "densa" à distância;
 *  - a fábrica é o único vermelho da paleta, então ela nunca se confunde com
 *    nada — é a fonte do problema e precisa ser localizável de imediato.
 */
export const COR_ESTADO: Readonly<Record<Estado, string>> = {
  [Estado.SOLO]: '#3a2a1d',
  [Estado.CONTAMINADO_LEVE]: '#cbd62f',
  [Estado.CONTAMINADO_MODERADO]: '#a4843a',
  [Estado.CONTAMINADO_GRAVE]: '#7b3fa8',
  [Estado.FABRICA]: '#d9453a',
  [Estado.CONCRETO]: '#8b9099',
  [Estado.GRAMA]: '#5c9e3f',
  [Estado.ARBUSTO]: '#3a7d33',
  [Estado.ARVORE]: '#21592a',
};

/** Cor do fundo em volta da grade (o canvas costuma sobrar alguns pixels). */
export const COR_FUNDO = '#12100e';

/** Converte "#rrggbb" em [r, g, b]. */
export function hexParaRgb(hex: string): [number, number, number] {
  const valor = Number.parseInt(hex.slice(1), 16);
  return [(valor >> 16) & 0xff, (valor >> 8) & 0xff, valor & 0xff];
}

/**
 * A mesma paleta em bytes, no formato que o `ImageData` espera.
 *
 * Fica pré-calculada porque o renderizador consulta a cor de cada célula a cada
 * quadro: seriam ~16 mil conversões de texto para número por quadro, 60 vezes
 * por segundo. Aqui a busca vira uma indexação em vetor: `PALETA_RGB[estado * 3]`.
 */
export const PALETA_RGB: Uint8Array = (() => {
  const bytes = new Uint8Array(TOTAL_ESTADOS * 3);
  for (const estado of TODOS_OS_ESTADOS) {
    const [r, g, b] = hexParaRgb(COR_ESTADO[estado]);
    bytes[estado * 3] = r;
    bytes[estado * 3 + 1] = g;
    bytes[estado * 3 + 2] = b;
  }
  return bytes;
})();
