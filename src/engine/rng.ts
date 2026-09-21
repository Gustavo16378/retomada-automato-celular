/**
 * Gerador de números pseudoaleatórios com semente (PRNG).
 *
 * Por que não usar `Math.random()`? Porque ele não aceita semente: duas execuções
 * nunca dariam o mesmo resultado. Como as regras do cenário usam probabilidades
 * (brotar, crescer, rachar), sem semente seria impossível reproduzir um
 * experimento — e reprodutibilidade é requisito do trabalho, tanto para os testes
 * automatizados quanto para gerar de novo a mesma figura no relatório.
 *
 * O algoritmo escolhido é o mulberry32: 32 bits de estado, uma única variável,
 * qualidade estatística suficiente para simulação visual e implementação curta o
 * bastante para caber no relatório. Não serve para criptografia (nem precisa).
 */
export interface Rng {
  /** Semente que originou esta sequência. Guardada para exibir/exportar. */
  readonly semente: number;
  /** Próximo número no intervalo [0, 1). */
  proximo(): number;
  /** Sorteio booleano: verdadeiro com probabilidade `p` (0..1). */
  sorteio(p: number): boolean;
  /** Inteiro em [0, limiteExclusivo). */
  inteiro(limiteExclusivo: number): number;
}

/**
 * Cria um gerador determinístico: a mesma semente produz sempre a mesma
 * sequência de números, na mesma ordem.
 */
export function criarRng(semente: number): Rng {
  // `| 0` força o estado a 32 bits com sinal, que é o que o algoritmo espera.
  let estado = semente | 0;

  const proximo = (): number => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    // `>>> 0` reinterpreta como inteiro sem sinal antes de normalizar para [0,1).
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    semente,
    proximo,
    // A comparação é `<` para que `sorteio(0)` seja sempre falso: `proximo()`
    // pode devolver exatamente 0, e `0 <= 0` daria verdadeiro por engano.
    sorteio: (p: number) => proximo() < p,
    inteiro: (limiteExclusivo: number) => Math.floor(proximo() * limiteExclusivo),
  };
}

/**
 * Converte um texto em semente numérica (hash FNV-1a de 32 bits).
 *
 * Existe para a interface: é mais amigável digitar "cidade-01" do que um número
 * grande, e o mesmo texto sempre gera a mesma simulação. Se o texto já for um
 * número inteiro, ele é usado diretamente — assim uma semente exportada no CSV
 * pode ser colada de volta no campo e reproduzir a execução.
 */
export function sementeDeTexto(texto: string): number {
  const aparado = texto.trim();
  if (/^-?\d+$/.test(aparado)) return Number(aparado) | 0;

  let hash = 0x811c9dc5;
  for (let i = 0; i < aparado.length; i++) {
    hash ^= aparado.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}
