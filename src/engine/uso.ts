/**
 * Uso original do solo: uma camada ESTÁTICA, paralela à grade.
 *
 * Ela guarda o que cada célula era quando o mapa foi gerado — rua, casa, prédio,
 * usina — e existe por um motivo só: permitir que o renderizador desenhe o
 * concreto com aparências diferentes. Sem ela, uma rua e um telhado seriam o
 * mesmo cinza, porque para as REGRAS os dois são exatamente a mesma coisa: o
 * estado `CONCRETO`.
 *
 * Duas consequências importantes, e as duas são intencionais:
 *
 *  - **A camada não participa de nenhuma regra.** Ela nem sequer é passada para
 *    a simulação: `aplicarMapa` a devolve, `main.ts` a guarda e entrega direto ao
 *    renderizador. Assim uma regra não tem como ler o uso do solo nem por
 *    acidente — a separação é estrutural, não uma questão de disciplina.
 *  - **Ela não muda com o tempo.** Quando a vegetação racha o concreto de uma
 *    casa, o ESTADO vira grama e passa a ser desenhado como grama, mas o uso
 *    continua dizendo "aqui havia uma casa". É o que permite, mais adiante,
 *    desenhar ruínas em vez de mato liso.
 */
export enum Uso {
  /** Fora da cidade: floresta, clareiras, quintais. */
  NATUREZA = 0,
  RUA = 1,
  /**
   * Três variantes de casa, que são o mesmo uso com telhados de tons diferentes.
   *
   * Por que não uma variante só, deixando a variação por conta do ruído por
   * célula? Porque o ruído varia CÉLULA a célula: um telhado de 3x3 sairia
   * salpicado. A variante é sorteada uma vez por casa, na geração do mapa, e
   * pinta o telhado inteiro de um tom só — que é como um telhado se parece.
   */
  CASA_A = 2,
  CASA_B = 3,
  CASA_C = 4,
  PREDIO = 5,
  USINA = 6,
}

/** Quantidade de usos distintos. Usado para dimensionar a tabela de cores. */
export const TOTAL_USOS = 7;

/** A camada em si: um byte por célula, no mesmo formato e ordem da grade. */
export type CamadaDeUso = Uint8Array;

/** Cria uma camada vazia (tudo natureza) para uma grade do tamanho informado. */
export function criarCamadaDeUso(totalCelulas: number): CamadaDeUso {
  return new Uint8Array(totalCelulas);
}

/** As três variantes de casa, na ordem, para o gerador sortear entre elas. */
export const VARIANTES_DE_CASA: readonly Uso[] = [Uso.CASA_A, Uso.CASA_B, Uso.CASA_C];
