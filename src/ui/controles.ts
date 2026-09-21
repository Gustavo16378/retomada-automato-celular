import type { Estatisticas, IdMapa, Raio, TipoContorno, TipoVizinhanca } from '../engine';
import { campo, definirTexto, elemento, formatarNumero } from './dom';

/**
 * Painel de controles.
 *
 * Este módulo é o ÚNICO que conhece os identificadores do HTML. Ele não conhece
 * a simulação: apenas dispara os eventos declarados abaixo e recebe de volta os
 * números para exibir. Essa inversão mantém a interface trocável — dá para
 * redesenhar o painel inteiro sem tocar em `main.ts` nem na engine.
 */
export interface ManipuladoresControles {
  aoAlternarExecucao: () => void;
  aoPassoUnico: () => void;
  aoReiniciar: () => void;
  aoMudarVelocidade: (geracoesPorSegundo: number) => void;
  aoMudarMapa: (mapa: IdMapa) => void;
  aoMudarSemente: (texto: string) => void;
  aoSortearSemente: () => void;
  aoMudarVizinhanca: (tipo: TipoVizinhanca) => void;
  aoMudarRaio: (raio: Raio) => void;
  aoMudarContorno: (tipo: TipoContorno) => void;
}

/** O que `main.ts` pode pedir ao painel depois de conectado. */
export interface Controles {
  atualizarEstatisticas: (estatisticas: Estatisticas, vivas: number) => void;
  definirRodando: (rodando: boolean) => void;
  definirSemente: (texto: string) => void;
  lerSemente: () => string;
  lerMapa: () => IdMapa;
  lerVizinhanca: () => TipoVizinhanca;
  lerRaio: () => Raio;
}

/**
 * Converte o texto de um `<select>` em um valor do tipo esperado.
 *
 * O DOM só devolve `string`; sem essa checagem, uma opção digitada errada no
 * HTML viraria um valor inválido correndo solto pela engine. Aqui o erro
 * aparece na hora, com o valor problemático no aviso.
 */
function escolhaValida<T extends string>(valor: string, opcoes: readonly T[], rotulo: string): T {
  const encontrada = opcoes.find((opcao) => opcao === valor);
  if (encontrada === undefined) {
    throw new Error(`Valor inválido para ${rotulo}: "${valor}".`);
  }
  return encontrada;
}

const MAPAS: readonly IdMapa[] = ['vazio', 'glider', 'aleatorio'];
const VIZINHANCAS: readonly TipoVizinhanca[] = ['vonNeumann', 'moore'];
const CONTORNOS: readonly TipoContorno[] = ['periodico', 'fixo'];

export function conectarControles(manipuladores: ManipuladoresControles): Controles {
  const botaoExecutar = elemento<HTMLButtonElement>('btn-executar');
  const botaoPasso = elemento<HTMLButtonElement>('btn-passo');
  const botaoReiniciar = elemento<HTMLButtonElement>('btn-reiniciar');
  const botaoSortear = elemento<HTMLButtonElement>('btn-sortear');

  const controleVelocidade = campo<HTMLInputElement>('ctrl-velocidade');
  const controleMapa = campo<HTMLSelectElement>('ctrl-mapa');
  const controleSemente = campo<HTMLInputElement>('ctrl-semente');
  const controleVizinhanca = campo<HTMLSelectElement>('ctrl-vizinhanca');
  const controleRaio = campo<HTMLSelectElement>('ctrl-raio');
  const controleContorno = campo<HTMLSelectElement>('ctrl-contorno');

  const valorVelocidade = elemento('val-velocidade');
  const statGeracao = elemento('stat-geracao');
  const statVivas = elemento('stat-vivas');
  const statPercentual = elemento('stat-percentual');

  botaoExecutar.addEventListener('click', manipuladores.aoAlternarExecucao);
  botaoPasso.addEventListener('click', manipuladores.aoPassoUnico);
  botaoReiniciar.addEventListener('click', manipuladores.aoReiniciar);
  botaoSortear.addEventListener('click', manipuladores.aoSortearSemente);

  // `input` (e não `change`) para o resultado acompanhar o arrastar do controle.
  controleVelocidade.addEventListener('input', () => {
    const velocidade = Number(controleVelocidade.value);
    definirTexto(valorVelocidade, `${velocidade} ger/s`);
    manipuladores.aoMudarVelocidade(velocidade);
  });

  controleMapa.addEventListener('change', () => {
    manipuladores.aoMudarMapa(escolhaValida(controleMapa.value, MAPAS, 'mapa inicial'));
  });

  controleSemente.addEventListener('change', () => {
    manipuladores.aoMudarSemente(controleSemente.value);
  });

  controleVizinhanca.addEventListener('change', () => {
    manipuladores.aoMudarVizinhanca(
      escolhaValida(controleVizinhanca.value, VIZINHANCAS, 'vizinhança'),
    );
  });

  controleRaio.addEventListener('change', () => {
    manipuladores.aoMudarRaio(controleRaio.value === '2' ? 2 : 1);
  });

  controleContorno.addEventListener('change', () => {
    manipuladores.aoMudarContorno(escolhaValida(controleContorno.value, CONTORNOS, 'contorno'));
  });

  // Estado inicial exibido, para o painel já abrir coerente com os valores do HTML.
  definirTexto(valorVelocidade, `${Number(controleVelocidade.value)} ger/s`);

  return {
    atualizarEstatisticas(estatisticas, vivas): void {
      definirTexto(statGeracao, String(estatisticas.geracao));
      definirTexto(statVivas, vivas.toLocaleString('pt-BR'));
      definirTexto(
        statPercentual,
        `${formatarNumero((vivas / estatisticas.total) * 100)} %`,
      );
    },

    definirRodando(rodando): void {
      definirTexto(botaoExecutar, rodando ? '⏸ Pausar' : '▶ Executar');
      // Avançar uma geração com a simulação rodando não faria sentido: o botão
      // some de cena enquanto ela está em movimento.
      botaoPasso.disabled = rodando;
      botaoExecutar.setAttribute('aria-pressed', String(rodando));
    },

    definirSemente(texto): void {
      controleSemente.value = texto;
    },

    lerSemente(): string {
      return controleSemente.value;
    },

    lerMapa(): IdMapa {
      return escolhaValida(controleMapa.value, MAPAS, 'mapa inicial');
    },

    lerVizinhanca(): TipoVizinhanca {
      return escolhaValida(controleVizinhanca.value, VIZINHANCAS, 'vizinhança');
    },

    lerRaio(): Raio {
      return controleRaio.value === '2' ? 2 : 1;
    },
  };
}
