import { Estado } from './estados';
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

/**
 * Contrato de uma regra.
 *
 * Os parâmetros ajustáveis (limiares, probabilidades, vento…) NÃO aparecem
 * aqui: cada regra os captura no fechamento da sua função criadora. Assim a
 * simulação não precisa conhecer os parâmetros de nenhuma regra específica, e
 * acrescentar uma regra nova não muda nenhum tipo existente.
 */
export interface Regra {
  /** Identificador estável, usado em seletores e na exportação de dados. */
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
