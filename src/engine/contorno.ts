/**
 * Condições de contorno: o que acontece quando um vizinho cai fora da grade.
 *
 * Todo autômato celular finito precisa responder a essa pergunta, porque as
 * células da borda têm vizinhos "inexistentes". As duas opções clássicas estão
 * aqui e são intercambiáveis na interface, já que mudam bastante o resultado:
 *
 *  - periódico (toroidal): a grade se fecha sobre si mesma, a borda direita
 *    encosta na esquerda e a de cima na de baixo. É o contorno usado nos testes
 *    do Jogo da Vida, porque um planador pode viajar indefinidamente.
 *  - fixo: fora da grade não existe célula. Quem pergunta recebe
 *    `FORA_DA_GRADE` e decide o que fazer — no nosso cenário, tratar como solo
 *    limpo, ou seja, o entorno da cidade funciona como um sumidouro que dilui a
 *    contaminação nas bordas.
 */
export type TipoContorno = 'periodico' | 'fixo';

/**
 * Valor devolvido pelo resolvedor quando a coordenada não corresponde a nenhuma
 * célula. É -1 por ser um índice impossível em um vetor, o que torna a checagem
 * barata (`if (i === FORA_DA_GRADE)`) sem precisar de `null`/`undefined`.
 */
export const FORA_DA_GRADE = -1;

/**
 * Traduz uma coordenada (x, y) — possivelmente fora dos limites — para um índice
 * do vetor linear da grade, ou `FORA_DA_GRADE`.
 */
export type ResolvedorIndice = (x: number, y: number) => number;

/** Rótulos para a interface. */
export const NOME_CONTORNO: Readonly<Record<TipoContorno, string>> = {
  periodico: 'Periódico (toroidal)',
  fixo: 'Fixo (fora = solo limpo)',
};

/**
 * Monta o resolvedor de índices para uma grade de tamanho fixo.
 *
 * As dimensões são capturadas no fechamento (closure) em vez de virarem
 * parâmetros da função devolvida. Isso evita repassar largura e altura milhões
 * de vezes por segundo — a cada geração, esta função é chamada uma vez por
 * vizinho de cada célula.
 */
export function criarResolvedor(
  tipo: TipoContorno,
  largura: number,
  altura: number,
): ResolvedorIndice {
  if (tipo === 'periodico') {
    return (x, y) => {
      // O `%` do JavaScript preserva o sinal (-1 % 160 === -1), então somamos a
      // dimensão antes do segundo `%` para trazer o valor de volta ao intervalo
      // [0, dimensão). É o que faz a coluna -1 virar a última coluna.
      const cx = ((x % largura) + largura) % largura;
      const cy = ((y % altura) + altura) % altura;
      return cy * largura + cx;
    };
  }

  return (x, y) => {
    if (x < 0 || y < 0 || x >= largura || y >= altura) return FORA_DA_GRADE;
    return y * largura + x;
  };
}
