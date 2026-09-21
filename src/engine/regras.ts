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
  /**
   * Segundo leitor, de raio maior, também já centralizado nesta célula.
   *
   * Existe para fontes de longo alcance — no nosso caso, a usina durante o
   * acidente. A simulação só o constrói com raio ampliado se a regra declarar
   * `raioAmplo`; caso contrário ele é igual à vizinhança normal, e varrê-lo sem
   * necessidade só desperdiça trabalho.
   */
  readonly vizinhancaAmpla: Vizinhanca;
  /** Gerador com semente, para as regras probabilísticas. */
  readonly rng: Rng;
}

/** Identificadores das regras disponíveis na interface. */
export type IdRegra = 'acidente' | 'jogo-da-vida';

/** Rótulos das regras, para o seletor. */
export const NOME_REGRA: Readonly<Record<IdRegra, string>> = {
  acidente: 'Acidente nuclear',
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
  /**
   * Raio da vizinhança ampliada de que esta regra precisa, se precisar.
   *
   * É a regra que DECLARA o quanto precisa enxergar, e a simulação providencia —
   * e não o contrário. Assim a engine continua sem saber nada sobre usinas, e uma
   * regra futura que precise de outro alcance não exige mudança nenhuma aqui.
   */
  readonly raioAmplo?: number;
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
/* Cenário: acidente nuclear e recuperação                                    */
/* -------------------------------------------------------------------------- */

/**
 * As três fases do cenário, na ordem em que acontecem.
 *
 * A fase é UM valor do qual derivam três comportamentos diferentes, e deixá-la
 * explícita (em vez de três booleanos soltos) impede estados impossíveis — como
 * "a usina emite mas a cidade ainda está habitada".
 */
export type Fase = 'normal' | 'acidente' | 'sarcofago';

export const NOME_FASE: Readonly<Record<Fase, string>> = {
  normal: 'Operação normal',
  acidente: 'Vazamento em curso',
  sarcofago: 'Sarcófago construído',
};

/** A usina só emite durante o vazamento. */
export function usinaEmite(fase: Fase): boolean {
  return fase === 'acidente';
}

/**
 * A cidade é evacuada no instante do acidente e nunca mais é reocupada.
 *
 * É o que libera o concreto para rachar: enquanto havia gente morando ali, as
 * rachaduras eram tapadas e o mato, arrancado.
 */
export function cidadeEvacuada(fase: Fase): boolean {
  return fase !== 'normal';
}

/**
 * A vegetação só COLONIZA terreno novo depois que o reator é contido.
 *
 * Cada fase tem um motivo diferente para isso, e os dois são físicos:
 *
 *  - na operação normal, a paisagem é mantida — ruas varridas, clareiras
 *    abertas, quintais aparados. A fase é, de propósito, o retrato do "antes";
 *  - durante o vazamento, a precipitação radioativa mata qualquer broto antes
 *    que ele pegue.
 *
 * Sem esta condição o cenário fica estranho nas duas pontas: em cem gerações de
 * operação normal a vegetação salta de 63 % para 95 % do mapa e a cidade some no
 * mato antes do acidente; e, se valesse já na evacuação, haveria um surto de
 * verde logo depois da explosão, justamente quando tudo deveria estar morrendo.
 */
export function naturezaAvanca(fase: Fase): boolean {
  return fase === 'sarcofago';
}

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
 * permite disparar o acidente no meio da execução e ver o efeito na hora.
 */
export interface ParametrosCenario {
  /* --- estado do cenário ------------------------------------------------- */
  fase: Fase;
  /** Direção de onde o vento sopra. */
  vento: Vento;

  /* --- emissão e transporte ---------------------------------------------- */
  /** Intensidade da fonte durante o vazamento, na mesma escala 0..3 da pressão. */
  emissaoUsina: number;
  /** Peso do vizinho que está do lado de onde o vento vem. */
  pesoVentoForte: number;
  /** Peso do vizinho que está do lado oposto. */
  pesoVentoFraco: number;
  /** Quanto cada vizinho arbusto/árvore desconta da pressão. */
  absorcao: number;

  /* --- dinâmica da contaminação ------------------------------------------ */
  /** Quanto a pressão precisa SUPERAR o nível da própria célula para ela subir 1. */
  limiarSubida: number;
  /** Quanto a pressão precisa ficar ABAIXO do nível da própria célula para ela descer 1. */
  limiarDescida: number;
  /** Chance de decair 1 nível por geração fora das duas faixas acima. */
  probDecaimento: number;

  /* --- vegetação ---------------------------------------------------------- */
  /**
   * Pressão que mata a vegetação DURANTE o vazamento.
   *
   * É baixa porque, com o reator exposto, o que mata as plantas é a precipitação
   * radioativa caindo do ar: basta a contaminação alcançar a célula.
   */
  limiarMorte: number;
  /**
   * Pressão que mata a vegetação DEPOIS de o reator ser contido.
   *
   * Bem mais alta: sem nada caindo do céu, sobra apenas o resíduo já depositado
   * no solo, e só uma vizinhança gravemente contaminada ainda mata uma planta.
   *
   * A diferença entre os dois limiares não é detalhe de calibração, é o que faz
   * o cenário ter fim. Com um limiar único e baixo, cada planta morta vira
   * contaminação nova que mata a planta seguinte — uma onda que se alimenta
   * sozinha e continua devorando a floresta muito depois do sarcófago, como o
   * script de calibração mostra sem dificuldade.
   */
  limiarMorteResidual: number;
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
 * Alcance da usina, em células.
 *
 * É o raio da vizinhança ampliada que a regra declara precisar. Com 4, a usina
 * contamina de imediato um halo de algumas dezenas de células em volta — o
 * "chão quente" do acidente — e a partir dali a mancha avança pelas regras
 * normais, de célula em célula.
 *
 * Não pode crescer muito: o custo da varredura é quadrático no raio e ela roda
 * uma vez por célula. Com 4 são 80 vizinhos por célula, e ainda assim só durante
 * o vazamento.
 */
export const RAIO_DA_USINA = 4;

/** Valores calibrados com `npm run calibrar`. Ver o README para a tabela medida. */
export const PARAMETROS_PADRAO: Readonly<ParametrosCenario> = Object.freeze({
  fase: 'normal' as Fase,
  vento: 'nenhum' as Vento,

  emissaoUsina: 3,
  pesoVentoForte: 2,
  pesoVentoFraco: 0.5,
  absorcao: 0.01,

  limiarSubida: 0.12,
  limiarDescida: 0.95,
  probDecaimento: 0.015,

  limiarMorte: 0.08,
  limiarMorteResidual: 0.8,
  probBrotar: 0.05,
  probCrescer1: 0.006,
  probCrescer2: 0.003,

  vizinhosParaRachar: 2,
  probRachar: 0.012,
});

/** Cria uma cópia editável dos parâmetros padrão, opcionalmente com ajustes. */
export function criarParametrosCenario(
  ajustes: Partial<ParametrosCenario> = {},
): ParametrosCenario {
  return { ...PARAMETROS_PADRAO, ...ajustes };
}

/**
 * Peso do vizinho conforme o vento.
 *
 * O truque é reduzir as quatro direções a um único número: a componente do
 * deslocamento ao longo do eixo do vento, com sinal NEGATIVO para o lado de onde
 * o vento vem. Assim a comparação é a mesma nos quatro casos.
 */
function pesoDoVento(parametros: ParametrosCenario, dx: number, dy: number): number {
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
 * Regra do cenário do acidente nuclear.
 *
 * A ordem dos blocos dentro de `aplicar` segue a numeração das regras, e cada
 * estado cai em exatamente um deles — usina, concreto, vegetação ou a faixa
 * solo/contaminação. Não há sobreposição, então não existe "ordem de prioridade"
 * escondida entre as regras.
 *
 * @param parametros objeto compartilhado com a interface; ver `ParametrosCenario`.
 */
export function criarRegraCenario(parametros: ParametrosCenario): Regra {
  /*
   * Acumuladores da varredura da vizinhança, declarados AQUI e não dentro de
   * `aplicar`. Junto com eles, as funções `visitar` e `ehUsina` são criadas uma
   * única vez por regra. Se fossem criadas dentro de `aplicar`, o motor alocaria
   * um fechamento novo para cada uma das 25 mil células, a cada geração.
   */
  let somaPesos = 0;
  let somaPonderada = 0;
  let vizinhosLenhosos = 0;
  let vizinhosComVegetacao = 0;
  let maiorNivelVizinho = 0;

  const visitar = (vizinho: Estado, dx: number, dy: number): void => {
    const peso = pesoDoVento(parametros, dx, dy);
    const nivel = nivelDeContaminacao(vizinho);

    somaPesos += peso;
    somaPonderada += peso * nivel;

    if (nivel > maiorNivelVizinho) maiorNivelVizinho = nivel;
    if (ehVegetacao(vizinho)) vizinhosComVegetacao++;
    if (ehLenhoso(vizinho)) vizinhosLenhosos++;
  };

  const ehUsina = (vizinho: Estado): boolean => vizinho === Estado.USINA;

  /**
   * Termo de fonte da usina: a parcela da pressão que vem do reator exposto.
   *
   * É calculado sobre a vizinhança AMPLIADA, e não sobre a imediata, porque a
   * usina alcança muito mais longe que uma célula de solo contaminado — é o que
   * cria o halo instantâneo em volta do reator no momento do acidente. A conta é
   * a mesma média de sempre, só que sobre outro raio: a fração de células de
   * usina dentro do alcance, vezes a intensidade da emissão.
   *
   * A varredura ampla é cara (80 vizinhos por célula com raio 4), por isso ela
   * só acontece quando a usina está de fato emitindo. Nas fases normal e
   * sarcófago, o custo é uma comparação.
   */
  const pressaoDaUsina = (ctx: ContextoCelula): number => {
    if (!usinaEmite(parametros.fase)) return 0;
    const celulasDeUsina = ctx.vizinhancaAmpla.contar(ehUsina);
    if (celulasDeUsina === 0) return 0;
    return (parametros.emissaoUsina * celulasDeUsina) / ctx.vizinhancaAmpla.total;
  };

  return {
    id: 'acidente',
    nome: 'Acidente nuclear',
    raioAmplo: RAIO_DA_USINA,

    aplicar(ctx: ContextoCelula): Estado {
      const estado = ctx.estado;

      // 1. A usina é permanente: ela é construção, não solo.
      if (estado === Estado.USINA) return Estado.USINA;

      somaPesos = 0;
      somaPonderada = 0;
      vizinhosLenhosos = 0;
      vizinhosComVegetacao = 0;
      maiorNivelVizinho = 0;
      ctx.vizinhanca.paraCada(visitar);

      /*
       * PRESSÃO = média ponderada dos níveis dos vizinhos, mais a fonte, menos a
       * absorção.
       *
       * Dividir pela SOMA DOS PESOS (e não pela quantidade de vizinhos) é o que
       * mantém os mesmos limiares válidos em Von Neumann, em Moore e com
       * qualquer vento: o resultado continua sendo uma média na escala 0..3.
       *
       * Já a absorção é descontada POR vizinho lenhoso, como pedem as regras —
       * ou seja, ela não é normalizada. O efeito colateral é coerente: em Moore
       * há mais vizinhos, então uma cortina de árvores bloqueia mais do que em
       * Von Neumann, onde existe menos mata em volta.
       */
      const media = somaPesos === 0 ? 0 : somaPonderada / somaPesos;
      const pressao = Math.max(
        0,
        media + pressaoDaUsina(ctx) - parametros.absorcao * vizinhosLenhosos,
      );

      // 5. Concreto: impermeável à contaminação, mas a mata o racha com o tempo.
      if (estado === Estado.CONCRETO) {
        // Enquanto a cidade está habitada, ninguém deixa o mato tomar a calçada.
        if (!cidadeEvacuada(parametros.fase)) return Estado.CONCRETO;
        const rachou =
          vizinhosLenhosos >= parametros.vizinhosParaRachar &&
          ctx.rng.sorteio(parametros.probRachar);
        return rachou ? Estado.GRAMA : Estado.CONCRETO;
      }

      // 4. Vegetação: ou morre sob pressão, ou amadurece.
      if (ehVegetacao(estado)) {
        const limiarLetal = usinaEmite(parametros.fase)
          ? parametros.limiarMorte
          : parametros.limiarMorteResidual;
        if (pressao >= limiarLetal) return Estado.CONTAMINADO_LEVE;
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
       * A CONTAMINAÇÃO SÓ AVANÇA ENQUANTO A USINA ESTÁ VAZANDO. Esta é a decisão
       * de modelagem mais importante do cenário, e ela não é arbitrária — é o
       * que torna a recuperação possível.
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
       * fonte. Ele empurra contaminação para os lados enquanto há material novo
       * chegando do reator; fechado o sarcófago, o que restou apenas decai no
       * lugar. É isso que a condição abaixo expressa.
       *
       * Os dois limiares são medidos EM RELAÇÃO AO NÍVEL DA PRÓPRIA CÉLULA, e
       * não em valor absoluto. A leitura vira "a vizinhança está mais
       * contaminada do que eu?", e é isso que faz a mancha ter GRADIENTE em vez
       * de ser um bloco chapado no nível máximo: na frente de avanço a pressão
       * mal dá para o nível 1; algumas células atrás, onde já há vizinhos
       * graves, dá para o 2; e só no miolo, cercado de nível 3 por todos os
       * lados, dá para o 3. É o perfil que se espera de uma pluma real.
       *
       * (Com limiar absoluto, qualquer célula tocada pela mancha subia direto ao
       * máximo, e a pluma virava um polígono de cor única.)
       */
      let nivel: Estado = estado;
      const podeAvancar = usinaEmite(parametros.fase);

      if (podeAvancar && pressao >= nivel + parametros.limiarSubida && nivel < NIVEL_MAXIMO_CONTAMINACAO) {
        nivel++;
      } else if (pressao <= nivel - parametros.limiarDescida) {
        if (nivel > Estado.SOLO) nivel--;
      } else if (nivel > Estado.SOLO && ctx.rng.sorteio(parametros.probDecaimento)) {
        /*
         * Decaimento radioativo: a degradação própria do material, independente
         * da vizinhança.
         *
         * É o que limpa o MIOLO da mancha: lá a pressão é alta demais para a
         * descida rápida da linha acima, que só acontece nas bordas, junto ao
         * solo limpo. As duas juntas fazem a mancha encolher de fora para dentro
         * e, ao mesmo tempo, clarear por inteiro.
         */
        nivel--;
      }

      // 3. Solo limpo que continuou limpo e não tem nenhuma contaminação por
      //    perto pode ser colonizado pela vegetação vizinha — mas só depois de
      //    o reator ser contido (ver `naturezaAvanca`).
      if (
        naturezaAvanca(parametros.fase) &&
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
