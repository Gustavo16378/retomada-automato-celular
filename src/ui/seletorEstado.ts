import { NOME_ESTADO, TODOS_OS_ESTADOS, type Estado } from '../engine';
import { Aparencia, COR_APARENCIA } from '../render';

/**
 * Seletor do estado que o pincel pinta.
 *
 * É gerado a partir da lista de estados da engine, e não escrito no HTML: assim
 * um estado novo aparece no painel sozinho, com a cor certa, sem ninguém
 * lembrar de atualizar duas listas.
 *
 * Os botões são amostras da cor real usada no mapa — é a mesma paleta, lida da
 * camada de desenho. Um seletor com cores só parecidas seria pior que nenhum.
 */

export interface SeletorDeEstado {
  /** Estado escolhido no momento. */
  selecionado: () => Estado;
  /** Escolhe um estado por código (usado para restaurar o padrão). */
  selecionar: (estado: Estado) => void;
}

/**
 * Cor de amostra de um estado.
 *
 * O concreto é o único caso que precisa de escolha: no mapa ele aparece como
 * rua, telhado ou prédio conforme o uso do solo, e o pincel pinta concreto
 * genérico. A amostra usa o cinza de prédio, que é o mais neutro dos três.
 */
function corDaAmostra(estado: Estado): string {
  const aparencia = (estado as number) === Aparencia.CONCRETO ? Aparencia.PREDIO : (estado as number as Aparencia);
  return COR_APARENCIA[aparencia];
}

export function conectarSeletorDeEstado(
  container: HTMLElement,
  inicial: Estado,
): SeletorDeEstado {
  let escolhido = inicial;
  const botoes = new Map<Estado, HTMLButtonElement>();

  const destacar = (): void => {
    for (const [estado, botao] of botoes) {
      const ativo = estado === escolhido;
      botao.classList.toggle('ativo', ativo);
      botao.setAttribute('aria-pressed', String(ativo));
    }
  };

  for (const estado of TODOS_OS_ESTADOS) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'amostra';
    botao.title = NOME_ESTADO[estado];
    // O nome vai no rótulo acessível porque a cor sozinha não identifica nada
    // para quem usa leitor de tela — nem para quem não distingue os três verdes.
    botao.setAttribute('aria-label', NOME_ESTADO[estado]);
    botao.style.setProperty('--cor-amostra', corDaAmostra(estado));
    botao.addEventListener('click', () => {
      escolhido = estado;
      destacar();
    });

    botoes.set(estado, botao);
    container.append(botao);
  }

  destacar();

  return {
    selecionado: () => escolhido,
    selecionar(estado: Estado): void {
      escolhido = estado;
      destacar();
    },
  };
}
