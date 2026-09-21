import {
  ehLenhoso,
  ehVegetacao,
  Estado,
  NIVEL_MAXIMO_CONTAMINACAO,
  nivelDeContaminacao,
} from './estados';
import type { Rng } from './rng';
import type { Vizinhanca } from './vizinhanca';

/**
 * Regras de transição.
 *
 * Uma regra é uma função pura do ponto de vista da grade: recebe o contexto de
 * UMA célula (seu estado, sua posição e um leitor já posicionado na vizinhança)
 * e devolve o estado dela na próxima geração. Ela nunca escreve na grade — quem
 * escreve é a simulação, no buffer da próxima geração. Essa separação é o que
 * garante que todas as células sejam atualizadas em paralelo (de forma síncrona)
 * e não em cascata.
 */

/** Tudo o que uma regra pode consultar sobre a célula que está avaliando. */
export interface ContextoCelula {
  /** Estado atual da célula (na geração que está sendo lida). */
  readonly estado: Estado;
  readonly x: number;
  readonly y: number;
  /** Leitor já centralizado nesta célula. */
  readonly vizinhanca: Vizinhanca;
  /** Gerador com semente, para as regras probabilísticas. */
  readonly rng: Rng;
}

/** Identificadores das regras disponíveis na interface. */
export type IdRegra = 'cidade' | 'jogo-da-vida';

/** Rótulos das regras, para o seletor. */
export const NOME_REGRA: Readonly<Record<IdRegra, string>> = {
  cidade: 'Cidade (contaminação)',
  'jogo-da-vida': 'Jogo da Vida (B3/S23)',
};

/**
 * Contrato de uma regra.
 *
 * Os parâmetros ajustáveis (limiares, probabilidades, vento…) NÃO aparecem
 * aqui: cada regra os captura no fechamento da sua função criadora. Assim a
 * simulação não precisa conhecer os parâmetros de nenhuma regra específica, e
 * acrescentar uma regra nova não muda nenhum tipo existente.
 */
export interface Regra {
  /**
   * Identificador estável, usado em seletores e na exportação de dados.
   *
   * É `string`, e não `IdRegra`, de propósito: regras criadas fora da lista
   * oficial (as dos testes, por exemplo) continuam sendo regras legítimas.
   */
  readonly id: string;
  /** Nome legível para a interface. */
  readonly nome: string;
  /** Estado da célula na próxima geração. */
  aplicar(ctx: ContextoCelula): Estado;
}

/* -------------------------------------------------------------------------- */
/* Jogo da Vida (Conway, B3/S23)                                              */
/* -------------------------------------------------------------------------- */

/**
 * O Jogo da Vida só tem dois estados, viva e morta, mas reaproveitamos o mesmo
 * alfabeto de estados do cenário principal em vez de criar outro: assim a mesma
 * grade, a mesma paleta e o mesmo renderizador servem para as duas regras.
 *
 * Grama para "viva" (verde sobre o marrom do solo) dá o melhor contraste na
 * paleta que já temos, e mantém a leitura temática: vida sobre a terra.
 */
export const VIVA = Estado.GRAMA;
export const MORTA = Estado.SOLO;

/**
 * Predicado declarado no escopo do módulo, e não dentro de `aplicar`.
 *
 * Se estivesse dentro, uma função nova seria alocada para cada célula de cada
 * geração (~16 mil por geração nesta grade). Como ele não depende de nada do
 * contexto, criá-lo uma única vez é de graça.
 */
const ehViva = (estado: Estado): boolean => estado === VIVA;

/**
 * Regra B3/S23: uma célula morta nasce com exatamente 3 vizinhas vivas; uma
 * célula viva sobrevive com 2 ou 3 vizinhas vivas, e morre nos demais casos
 * (solidão ou superpopulação).
 *
 * Serve a dois propósitos no trabalho: é o autômato celular de referência, que
 * qualquer leitor do relatório reconhece, e é um teste vivo da engine — se o
 * planador se desloca corretamente, então vizinhança, contorno e a atualização
 * síncrona por double buffering estão todos corretos.
 */
export function criarRegraJogoDaVida(): Regra {
  return {
    id: 'jogo-da-vida',
    nome: 'Jogo da Vida (B3/S23)',
    aplicar(ctx: ContextoCelula): Estado {
      const vizinhasVivas = ctx.vizinhanca.contar(ehViva);

      if (ehViva(ctx.estado)) {
        // Sobrevivência: S23.
        return vizinhasVivas === 2 || vizinhasVivas === 3 ? VIVA : MORTA;
      }

      // Nascimento: B3. Qualquer estado que não seja VIVA é tratado como morto,
      // o que permite desenhar com o pincel sobre um mapa do cenário da cidade
      // e ver o que acontece sem precisar limpar a grade antes.
      return vizinhasVivas === 3 ? VIVA : MORTA;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Cenário cidade: contaminação industrial e recuperação                      */
/* -------------------------------------------------------------------------- */

/**
 * Direção de onde o vento SOPRA (não para onde ele vai).
 *
 * "Vento norte" é o vento que vem do norte e empurra a contaminação para o sul —
 * é a convenção da meteorologia, e é a que deixa o nome do controle coerente com
 * o que se vê na tela.
 */
export type Vento = 'nenhum' | 'norte' | 'sul' | 'leste' | 'oeste';

export const NOME_VENTO: Readonly<Record<Vento, string>> = {
  nenhum: 'Sem vento',
  norte: 'Norte (empurra para o sul)',
  sul: 'Sul (empurra para o norte)',
  leste: 'Leste (empurra para o oeste)',
  oeste: 'Oeste (empurra para o leste)',
};

/**
 * Todos os limiares e probabilidades do cenário, em um objeto só.
 *
 * O objeto é MUTÁVEL e compartilhado com a interface de propósito: a regra o
 * captura no fechamento, então mexer em um controle passa a valer na geração
 * seguinte, sem precisar reconstruir a regra nem reiniciar a simulação. É o que
 * permite abandonar a cidade no meio da execução e ver o efeito na hora.
 */
export interface ParametrosCidade {
  /* --- estado do cenário ------------------------------------------------- */
  /** Com a cidade abandonada, as fábricas param de emitir. */
  cidadeAbandonada: boolean;
  /** Direção de onde o vento sopra. */
  vento: Vento;

  /* --- emissão e transporte ---------------------------------------------- */
  /** Nível que uma fábrica ATIVA emite (a abandonada emite 0). */
  emissaoFabrica: number;
  /** Peso do vizinho que está do lado de onde o vento vem. */
  pesoVentoForte: number;
  /** Peso do vizinho que está do lado oposto. */
  pesoVentoFraco: number;
  /** Quanto cada vizinho arbusto/árvore desconta da pressão. */
  absorcao: number;

  /* --- dinâmica da contaminação ------------------------------------------ */
  /** Pressão a partir da qual o nível sobe 1. */
  limiarSubida: number;
  /** Pressão até a qual o nível desce 1. */
  limiarDescida: number;
  /** Chance de decair 1 nível por geração fora das duas faixas acima. */
  probDecaimento: number;

  /* --- vegetação ---------------------------------------------------------- */
  /** Pressão a partir da qual a vegetação morre e vira contaminação leve. */
  limiarMorte: number;
  /** Chance de brotar grama, POR vizinho com vegetação. */
  probBrotar: number;
  /** Chance de grama virar arbusto. */
  probCrescer1: number;
  /** Chance de arbusto virar árvore. */
  probCrescer2: number;

  /* --- concreto ----------------------------------------------------------- */
  /** Mínimo de vizinhos arbusto/árvore para o concreto poder rachar (o K da regra). */
  vizinhosParaRachar: number;
  /** Chance de o concreto rachar, uma vez atingido o mínimo acima. */
  probRachar: number;
}

/**
 * Valores calibrados rodando a simulação sem interface (`npm run calibrar`),
 * até bater os alvos do enunciado: contaminação visível em ~30 gerações e
 * recuperação perceptível de 100 a 200 gerações depois do abandono.
 */
export const PARAMETROS_CIDADE_PADRAO: Readonly<ParametrosCidade> = Object.freeze({
  cidadeAbandonada: false,
  vento: 'nenhum',

  emissaoFabrica: 3,
  pesoVentoForte: 2,
  pesoVentoFraco: 0.5,
  absorcao: 0.02,

  limiarSubida: 0.35,
  limiarDescida: 0.15,
  probDecaimento: 0.03,

  limiarMorte: 0.6,
  probBrotar: 0.05,
  probCrescer1: 0.03,
  probCrescer2: 0.015,

  vizinhosParaRachar: 2,
  probRachar: 0.012,
});

/** Cria uma cópia editável dos parâmetros padrão, opcionalmente com ajustes. */
export function criarParametrosCidade(ajustes: Partial<ParametrosCidade> = {}): ParametrosCidade {
  return { ...PARAMETROS_CIDADE_PADRAO, ...ajustes };
}

/**
 * Peso do vizinho conforme o vento.
 *
 * O truque é reduzir as quatro direções a um único número: a componente do
 * deslocamento ao longo do eixo do vento, com sinal NEGATIVO para o lado de onde
 * o vento vem. Assim a comparação é a mesma nos quatro casos.
 */
function pesoDoVento(parametros: ParametrosCidade, dx: number, dy: number): number {
  const { vento } = parametros;
  if (vento === 'nenhum') return 1;

  // Lembrando que y cresce para BAIXO: o vizinho ao norte tem dy negativo.
  const componente =
    vento === 'norte' ? dy : vento === 'sul' ? -dy : vento === 'leste' ? -dx : dx;

  if (componente < 0) return parametros.pesoVentoForte;
  if (componente > 0) return parametros.pesoVentoFraco;
  return 1; // vizinho perpendicular ao vento
}

/**
 * Regra do cenário cidade.
 *
 * A ordem dos blocos dentro de `aplicar` segue a numeração do enunciado, e cada
 * estado cai em exatamente um deles — fábrica, concreto, vegetação ou a faixa
 * solo/contaminação. Não há sobreposição, então não existe "ordem de prioridade"
 * escondida entre as regras.
 *
 * @param parametros objeto compartilhado com a interface; ver `ParametrosCidade`.
 */
export function criarRegraCidade(parametros: ParametrosCidade): Regra {
  /*
   * Acumuladores da varredura da vizinhança, declarados AQUI e não dentro de
   * `aplicar`. Junto com eles, a função `visitar` é criada uma única vez por
   * regra. Se ela fosse criada dentro de `aplicar`, o motor alocaria um
   * fechamento novo para cada uma das 16 mil células, a cada geração.
   */
  let somaPesos = 0;
  let somaPonderada = 0;
  let vizinhosLenhosos = 0;
  let vizinhosComVegetacao = 0;
  let maiorNivelVizinho = 0;
  let emissaoAtual = 0;

  const visitar = (vizinho: Estado, dx: number, dy: number): void => {
    const peso = pesoDoVento(parametros, dx, dy);
    const nivel = nivelDeContaminacao(vizinho, emissaoAtual);

    somaPesos += peso;
    somaPonderada += peso * nivel;

    if (nivel > maiorNivelVizinho) maiorNivelVizinho = nivel;
    if (ehVegetacao(vizinho)) vizinhosComVegetacao++;
    if (ehLenhoso(vizinho)) vizinhosLenhosos++;
  };

  return {
    id: 'cidade',
    nome: 'Cidade (contaminação)',

    aplicar(ctx: ContextoCelula): Estado {
      const estado = ctx.estado;

      // 1. A fábrica é permanente: ela é construção, não solo.
      if (estado === Estado.FABRICA) return Estado.FABRICA;

      somaPesos = 0;
      somaPonderada = 0;
      vizinhosLenhosos = 0;
      vizinhosComVegetacao = 0;
      maiorNivelVizinho = 0;
      emissaoAtual = parametros.cidadeAbandonada ? 0 : parametros.emissaoFabrica;
      ctx.vizinhanca.paraCada(visitar);

      /*
       * PRESSÃO = média ponderada dos níveis dos vizinhos, menos a absorção.
       *
       * Dividir pela SOMA DOS PESOS (e não pela quantidade de vizinhos) é o que
       * mantém os mesmos limiares válidos em Von Neumann, em Moore e com
       * qualquer vento: o resultado continua sendo uma média na escala 0..3.
       *
       * Já a absorção é descontada POR vizinho lenhoso, como pede o enunciado —
       * ou seja, ela não é normalizada. O efeito colateral é coerente: em Moore
       * há mais vizinhos, então uma cortina de árvores bloqueia mais do que em
       * Von Neumann, onde existe menos mata em volta.
       */
      const media = somaPesos === 0 ? 0 : somaPonderada / somaPesos;
      const pressao = Math.max(0, media - parametros.absorcao * vizinhosLenhosos);

      // 5. Concreto: impermeável à contaminação, mas a mata o racha com o tempo.
      if (estado === Estado.CONCRETO) {
        const rachou =
          vizinhosLenhosos >= parametros.vizinhosParaRachar &&
          ctx.rng.sorteio(parametros.probRachar);
        return rachou ? Estado.GRAMA : Estado.CONCRETO;
      }

      // 4. Vegetação: ou morre sob pressão, ou amadurece.
      if (ehVegetacao(estado)) {
        if (pressao >= parametros.limiarMorte) return Estado.CONTAMINADO_LEVE;
        if (estado === Estado.GRAMA && ctx.rng.sorteio(parametros.probCrescer1)) {
          return Estado.ARBUSTO;
        }
        if (estado === Estado.ARBUSTO && ctx.rng.sorteio(parametros.probCrescer2)) {
          return Estado.ARVORE;
        }
        return estado;
      }

      /*
       * 2. Solo e contaminação (0..3): a escala sobe, desce ou se degrada.
       *
       * A CONTAMINAÇÃO SÓ AVANÇA ENQUANTO A CIDADE EMITE. Esta é a decisão de
       * modelagem mais importante do cenário, e ela não é arbitrária — é o que
       * torna a recuperação possível.
       *
       * O motivo é geométrico e vale para qualquer regra deste tipo: o interior
       * de uma mancha sempre enxerga MAIS contaminação (média 3, todos os
       * vizinhos no máximo) do que a frente de avanço (média 1,125, apenas três
       * vizinhos contaminados). Ou seja, "um nível é alcançável" e "um nível se
       * auto-sustenta" são exatamente a mesma condição: tudo o que a mancha
       * consegue conquistar, ela também consegue manter para sempre. Nenhum
       * valor de limiar — absoluto ou relativo ao próprio nível — escapa disso;
       * foi verificado com o script de calibração nos dois formatos.
       *
       * A leitura física é direta: o solo contaminado é um RESERVATÓRIO, não uma
       * fonte. Ele empurra contaminação para os lados enquanto há emissão nova
       * chegando; desligadas as fábricas, o que restou apenas se degrada no
       * lugar. É isso que a condição abaixo expressa.
       */
      let nivel: Estado = estado;
      const podeAvancar = !parametros.cidadeAbandonada;

      if (podeAvancar && pressao >= parametros.limiarSubida && nivel < NIVEL_MAXIMO_CONTAMINACAO) {
        nivel++;
      } else if (pressao <= parametros.limiarDescida) {
        if (nivel > Estado.SOLO) nivel--;
      } else if (nivel > Estado.SOLO && ctx.rng.sorteio(parametros.probDecaimento)) {
        /*
         * Degradação própria da contaminação, independente da vizinhança.
         *
         * É o que limpa o MIOLO da mancha: lá a pressão é alta demais para a
         * descida rápida da linha acima, que só acontece nas bordas, junto ao
         * solo limpo. As duas juntas fazem a mancha encolher de fora para
         * dentro e, ao mesmo tempo, clarear por inteiro.
         */
        nivel--;
      }

      // 3. Solo limpo que continuou limpo e não tem nenhuma contaminação por
      //    perto pode ser colonizado pela vegetação vizinha.
      if (
        estado === Estado.SOLO &&
        nivel === Estado.SOLO &&
        maiorNivelVizinho === 0 &&
        vizinhosComVegetacao > 0 &&
        ctx.rng.sorteio(parametros.probBrotar * vizinhosComVegetacao)
      ) {
        return Estado.GRAMA;
      }

      return nivel;
    },
  };
}
