import { Estado, TOTAL_USOS, Uso } from '../engine';

/**
 * Paleta de cores do autômato.
 *
 * A escolha das cores é parte da leitura do fenômeno, não enfeite:
 *
 *  - o solo é marrom bem escuro para que qualquer contaminação salte à vista;
 *  - a contaminação é verde-amarelada e vai ficando mais SATURADA e mais CLARA
 *    conforme o nível sobe, terminando em um chartreuse que parece brilhar no
 *    escuro. A progressão é de intensidade, não de matiz, o que a torna legível
 *    mesmo em células de poucos pixels;
 *  - a vegetação usa três verdes francos, mais escuros e menos amarelados que a
 *    contaminação, para que mata viva e solo envenenado nunca se confundam;
 *  - a usina é o único tom FRIO da paleta. Cercada de verdes, cinzas e marrons,
 *    ela não tem como se perder de vista — e é a origem de tudo o que acontece.
 */

/**
 * Aparências: o que o renderizador de fato desenha.
 *
 * Não é a mesma coisa que o estado. Para as REGRAS, uma rua, um telhado e uma
 * parede de prédio são o mesmo `Estado.CONCRETO`; para os OLHOS, não. As três
 * aparências extras no fim da lista resolvem isso, escolhidas pela camada de uso
 * do solo (ver `uso.ts`), que é estática e não participa de nenhuma regra.
 */
export enum Aparencia {
  SOLO = 0,
  CONTAMINADO_LEVE = 1,
  CONTAMINADO_MODERADO = 2,
  CONTAMINADO_GRAVE = 3,
  USINA = 4,
  CONCRETO = 5,
  GRAMA = 6,
  ARBUSTO = 7,
  ARVORE = 8,
  RUA = 9,
  CASA_A = 10,
  CASA_B = 11,
  CASA_C = 12,
  PREDIO = 13,
}

export const TOTAL_APARENCIAS = 14;

export const COR_APARENCIA: Readonly<Record<Aparencia, string>> = {
  [Aparencia.SOLO]: '#3b2c20',
  // Escala radioativa: oliva fosco -> verde-limão -> chartreuse.
  [Aparencia.CONTAMINADO_LEVE]: '#6c7a2c',
  [Aparencia.CONTAMINADO_MODERADO]: '#9fbe33',
  [Aparencia.CONTAMINADO_GRAVE]: '#d4f53f',
  [Aparencia.USINA]: '#35c8dc',
  // Concreto genérico: só aparece se alguém pintar concreto com o pincel, fora
  // de qualquer construção do mapa.
  [Aparencia.CONCRETO]: '#7c8087',
  [Aparencia.GRAMA]: '#4e9440',
  [Aparencia.ARBUSTO]: '#357336',
  [Aparencia.ARVORE]: '#1f4f2c',
  [Aparencia.RUA]: '#3c3f44',
  // Três terrosos de telhado: telha, barro e areia queimada.
  [Aparencia.CASA_A]: '#8a4f38',
  [Aparencia.CASA_B]: '#6f4630',
  [Aparencia.CASA_C]: '#9a6b42',
  [Aparencia.PREDIO]: '#9aa0a8',
};

/** Cor do fundo em volta da grade (o canvas costuma sobrar alguns pixels). */
export const COR_FUNDO = '#12100e';

/**
 * Aparência de uma célula de concreto, conforme o uso original do solo.
 *
 * A usina tem estado próprio, então o uso `USINA` nunca chega aqui; ele consta
 * da tabela só para que ela fique completa e o índice não escape do vetor.
 */
const APARENCIA_DO_USO: Readonly<Record<Uso, Aparencia>> = {
  [Uso.NATUREZA]: Aparencia.CONCRETO,
  [Uso.RUA]: Aparencia.RUA,
  [Uso.CASA_A]: Aparencia.CASA_A,
  [Uso.CASA_B]: Aparencia.CASA_B,
  [Uso.CASA_C]: Aparencia.CASA_C,
  [Uso.PREDIO]: Aparencia.PREDIO,
  [Uso.USINA]: Aparencia.USINA,
};

/**
 * Tabela estado + uso -> aparência, montada uma vez.
 *
 * Só o concreto olha para o uso do solo; todos os outros estados têm aparência
 * própria. Resolver isso com uma tabela (em vez de um `if` por pixel) deixa o
 * laço de desenho sem um único desvio condicional.
 */
export const APARENCIA_POR_ESTADO_E_USO: Uint8Array = (() => {
  const tabela = new Uint8Array(TOTAL_USOS * 16);
  for (let estado = 0; estado < 16; estado++) {
    for (let uso = 0; uso < TOTAL_USOS; uso++) {
      // O concreto sempre consulta o uso; o solo, só quando é rua — asfalto é
      // terra batida coberta, então a rua LIMPA é desenhada como asfalto, mas a
      // contaminada mostra a contaminação, e a tomada pelo mato mostra o mato.
      const consultaOUso =
        estado === Estado.CONCRETO || (estado === Estado.SOLO && uso === Uso.RUA);
      tabela[uso * 16 + estado] = consultaOUso ? APARENCIA_DO_USO[uso as Uso] : estado;
    }
  }
  return tabela;
})();

/** Converte "#rrggbb" em [r, g, b]. */
export function hexParaRgb(hex: string): [number, number, number] {
  const valor = Number.parseInt(hex.slice(1), 16);
  return [(valor >> 16) & 0xff, (valor >> 8) & 0xff, valor & 0xff];
}

/* -------------------------------------------------------------------------- */
/* Variação de tom por célula                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Quantidade de tons por aparência.
 *
 * Ímpar de propósito, para que exista um tom exatamente central — a cor pura da
 * paleta —, com metade dos níveis escurecendo e metade clareando.
 */
export const NIVEIS_DE_TOM = 9;

/**
 * Quanto o tom mais extremo se afasta da cor base, em unidades de 0 a 255.
 *
 * Tem que ser DISCRETO: com uma amplitude grande, um tom claro de árvore fica
 * parecido com um tom escuro de grama, e as manchas de vegetação — que o gerador
 * de mapa trabalhou para formar — se desmancham em chuvisco.
 */
const AMPLITUDE_MAXIMA = 13;

/**
 * Amplitude da variação por aparência.
 *
 * Superfícies naturais variam muito (folhagem, terra batida); superfícies
 * construídas variam pouco, senão um prédio parece corroído. A usina não varia
 * nada: ela é um bloco artificial e precisa ler como um objeto único.
 */
const AMPLITUDE: Readonly<Record<Aparencia, number>> = {
  [Aparencia.SOLO]: 1,
  [Aparencia.CONTAMINADO_LEVE]: 0.8,
  [Aparencia.CONTAMINADO_MODERADO]: 0.8,
  [Aparencia.CONTAMINADO_GRAVE]: 0.7,
  [Aparencia.USINA]: 0,
  [Aparencia.CONCRETO]: 0.4,
  [Aparencia.GRAMA]: 1,
  [Aparencia.ARBUSTO]: 1,
  [Aparencia.ARVORE]: 1,
  [Aparencia.RUA]: 0.5,
  [Aparencia.CASA_A]: 0.35,
  [Aparencia.CASA_B]: 0.35,
  [Aparencia.CASA_C]: 0.35,
  [Aparencia.PREDIO]: 0.45,
};

/**
 * Paleta completa em bytes: uma cor pronta para cada (aparência, tom).
 *
 * Esta tabela é o coração do desempenho do renderizador. Sem ela, cada pixel
 * exigiria aplicar a variação de tom na hora — três somas e três limitações de
 * faixa, 25 mil vezes por quadro. Com ela, sobra uma indexação:
 *
 *     indice = (aparencia * NIVEIS_DE_TOM + tom) * 3
 *
 * São 14 aparências x 9 tons x 3 bytes = 378 bytes, que cabem inteiros no cache
 * mais rápido do processador.
 */
export const PALETA_VARIADA: Uint8Array = (() => {
  const bytes = new Uint8Array(TOTAL_APARENCIAS * NIVEIS_DE_TOM * 3);
  const centro = (NIVEIS_DE_TOM - 1) / 2;

  for (let aparencia = 0; aparencia < TOTAL_APARENCIAS; aparencia++) {
    const [r, g, b] = hexParaRgb(COR_APARENCIA[aparencia as Aparencia]);
    const amplitude = AMPLITUDE[aparencia as Aparencia] * AMPLITUDE_MAXIMA;

    for (let tom = 0; tom < NIVEIS_DE_TOM; tom++) {
      // Desvio de -1 a +1 em torno da cor base, multiplicado pela amplitude.
      const desvio = ((tom - centro) / centro) * amplitude;
      const i = (aparencia * NIVEIS_DE_TOM + tom) * 3;
      bytes[i] = limitar(r + desvio);
      bytes[i + 1] = limitar(g + desvio);
      bytes[i + 2] = limitar(b + desvio);
    }
  }

  return bytes;
})();

function limitar(valor: number): number {
  return valor < 0 ? 0 : valor > 255 ? 255 : Math.round(valor);
}

/**
 * Tom de uma célula, a partir apenas das coordenadas dela.
 *
 * Depender SÓ de (x, y) é o ponto todo: a variação precisa ser estável entre
 * quadros. Se viesse de `Math.random()`, o mapa cintilaria a cada geração; se
 * dependesse do estado, uma célula mudaria de tom ao ser contaminada, o que
 * confundiria a leitura da mancha.
 *
 * O embaralhamento é um hash inteiro simples (as constantes são primos grandes,
 * escolhidos para espalhar bem os bits): vizinhos próximos recebem tons
 * descorrelacionados, e é isso que tira o aspecto chapado das áreas grandes.
 */
export function tomDaCelula(x: number, y: number): number {
  let hash = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2545f491);
  hash ^= hash >>> 13;
  return (hash >>> 0) % NIVEIS_DE_TOM;
}
