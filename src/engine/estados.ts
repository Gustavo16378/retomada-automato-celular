/**
 * Estados possíveis de uma célula da grade.
 *
 * Por que um enum numérico (e não strings)? A grade é armazenada em `Uint8Array`
 * (ver `simulacao.ts`), então cada célula precisa caber em um byte. O enum dá
 * nomes legíveis ao código sem custo nenhum em tempo de execução: depois da
 * compilação sobram apenas os números 0..8.
 *
 * A ORDEM dos valores não é arbitrária — vários trechos do código dependem dela:
 *   - 0..3 formam a escala de contaminação, então "subir/descer um nível" é uma
 *     simples soma/subtração em vez de uma tabela de transição;
 *   - 6..8 formam a escala de vegetação, pelo mesmo motivo (GRAMA cresce para
 *     ARBUSTO, que cresce para ÁRVORE).
 * Qualquer reordenação quebraria as regras; por isso este comentário existe.
 */
export enum Estado {
  /** Solo limpo, sem contaminação e sem vegetação. */
  SOLO = 0,
  CONTAMINADO_LEVE = 1,
  CONTAMINADO_MODERADO = 2,
  CONTAMINADO_GRAVE = 3,
  /** Fonte de contaminação enquanto a cidade estiver ativa. Nunca muda de estado. */
  FABRICA = 4,
  /** Piso urbano: impermeável à contaminação, mas rachável pela vegetação. */
  CONCRETO = 5,
  GRAMA = 6,
  ARBUSTO = 7,
  ARVORE = 8,
}

/** Quantidade de estados distintos. Usado para dimensionar vetores de contagem. */
export const TOTAL_ESTADOS = 9;

/** Lista de todos os estados, útil para montar seletores e legendas na interface. */
export const TODOS_OS_ESTADOS: readonly Estado[] = [
  Estado.SOLO,
  Estado.CONTAMINADO_LEVE,
  Estado.CONTAMINADO_MODERADO,
  Estado.CONTAMINADO_GRAVE,
  Estado.FABRICA,
  Estado.CONCRETO,
  Estado.GRAMA,
  Estado.ARBUSTO,
  Estado.ARVORE,
];

/** Rótulos em português para a interface e para as legendas do relatório. */
export const NOME_ESTADO: Readonly<Record<Estado, string>> = {
  [Estado.SOLO]: 'Solo limpo',
  [Estado.CONTAMINADO_LEVE]: 'Contaminação leve',
  [Estado.CONTAMINADO_MODERADO]: 'Contaminação moderada',
  [Estado.CONTAMINADO_GRAVE]: 'Contaminação grave',
  [Estado.FABRICA]: 'Fábrica',
  [Estado.CONCRETO]: 'Concreto',
  [Estado.GRAMA]: 'Grama',
  [Estado.ARBUSTO]: 'Arbusto',
  [Estado.ARVORE]: 'Árvore',
};

/** Nível máximo da escala de contaminação (equivale a `Estado.CONTAMINADO_GRAVE`). */
export const NIVEL_MAXIMO_CONTAMINACAO = 3;

/** Verdadeiro para os estados 1..3 (não inclui solo limpo). */
export function ehContaminado(estado: Estado): boolean {
  return estado >= Estado.CONTAMINADO_LEVE && estado <= Estado.CONTAMINADO_GRAVE;
}

/**
 * Verdadeiro para solo e para qualquer nível de contaminação (0..3).
 * São as células que participam da dinâmica de subida/descida de nível.
 */
export function ehSoloOuContaminado(estado: Estado): boolean {
  return estado <= Estado.CONTAMINADO_GRAVE;
}

/** Verdadeiro para grama, arbusto e árvore (6..8). */
export function ehVegetacao(estado: Estado): boolean {
  return estado >= Estado.GRAMA && estado <= Estado.ARVORE;
}

/**
 * Nível de contaminação que a célula "emite" para a vizinhança, de 0 a 3.
 *
 * Solo e contaminação usam o próprio valor do estado (daí a ordem do enum ser
 * importante). A fábrica é tratada à parte porque sua emissão depende de a
 * cidade estar ativa ou abandonada — por isso o nível dela é um parâmetro em vez
 * de uma constante. Concreto e vegetação não emitem nada.
 *
 * @param emissaoDaFabrica nível emitido por uma fábrica ativa (0 se abandonada).
 */
export function nivelDeContaminacao(estado: Estado, emissaoDaFabrica: number): number {
  if (ehSoloOuContaminado(estado)) return estado;
  if (estado === Estado.FABRICA) return emissaoDaFabrica;
  return 0;
}
