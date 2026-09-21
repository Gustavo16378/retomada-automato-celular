import type {
  Estatisticas,
  Fase,
  IdMapa,
  IdRegra,
  Raio,
  TipoContorno,
  TipoVizinhanca,
  Vento,
} from '../engine';
import { NOME_FASE } from '../engine';
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
  aoMudarRegra: (regra: IdRegra) => void;
  aoMudarMapa: (mapa: IdMapa) => void;
  aoMudarSemente: (texto: string) => void;
  aoSortearSemente: () => void;
  aoMudarVizinhanca: (tipo: TipoVizinhanca) => void;
  aoMudarRaio: (raio: Raio) => void;
  aoMudarContorno: (tipo: TipoContorno) => void;
  aoMudarVento: (vento: Vento) => void;
  aoDispararAcidente: () => void;
  aoConstruirSarcofago: () => void;
}

/** O que `main.ts` pode pedir ao painel depois de conectado. */
export interface Controles {
  atualizarEstatisticas: (estatisticas: Estatisticas) => void;
  definirRodando: (rodando: boolean) => void;
  definirFase: (fase: Fase, cenarioAtivo: boolean) => void;
  definirSemente: (texto: string) => void;
  lerSemente: () => string;
  lerRegra: () => IdRegra;
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

const REGRAS: readonly IdRegra[] = ['acidente', 'jogo-da-vida'];
const MAPAS: readonly IdMapa[] = ['cidade', 'vazio', 'glider', 'aleatorio'];
const VIZINHANCAS: readonly TipoVizinhanca[] = ['vonNeumann', 'moore'];
const CONTORNOS: readonly TipoContorno[] = ['periodico', 'fixo'];
const VENTOS: readonly Vento[] = ['nenhum', 'norte', 'sul', 'leste', 'oeste'];

export function conectarControles(manipuladores: ManipuladoresControles): Controles {
  const botaoExecutar = elemento<HTMLButtonElement>('btn-executar');
  const botaoPasso = elemento<HTMLButtonElement>('btn-passo');
  const botaoReiniciar = elemento<HTMLButtonElement>('btn-reiniciar');
  const botaoSortear = elemento<HTMLButtonElement>('btn-sortear');
  const botaoAcidente = elemento<HTMLButtonElement>('btn-acidente');
  const botaoSarcofago = elemento<HTMLButtonElement>('btn-sarcofago');

  const controleVelocidade = campo<HTMLInputElement>('ctrl-velocidade');
  const controleRegra = campo<HTMLSelectElement>('ctrl-regra');
  const controleMapa = campo<HTMLSelectElement>('ctrl-mapa');
  const controleSemente = campo<HTMLInputElement>('ctrl-semente');
  const controleVizinhanca = campo<HTMLSelectElement>('ctrl-vizinhanca');
  const controleRaio = campo<HTMLSelectElement>('ctrl-raio');
  const controleContorno = campo<HTMLSelectElement>('ctrl-contorno');
  const controleVento = campo<HTMLSelectElement>('ctrl-vento');

  const valorVelocidade = elemento('val-velocidade');
  const statGeracao = elemento('stat-geracao');
  const statContaminado = elemento('stat-contaminado');
  const statVegetacao = elemento('stat-vegetacao');
  const statConcreto = elemento('stat-concreto');
  const statFase = elemento('stat-fase');

  botaoExecutar.addEventListener('click', manipuladores.aoAlternarExecucao);
  botaoPasso.addEventListener('click', manipuladores.aoPassoUnico);
  botaoReiniciar.addEventListener('click', manipuladores.aoReiniciar);
  botaoSortear.addEventListener('click', manipuladores.aoSortearSemente);
  botaoAcidente.addEventListener('click', manipuladores.aoDispararAcidente);
  botaoSarcofago.addEventListener('click', manipuladores.aoConstruirSarcofago);

  // `input` (e não `change`) para o resultado acompanhar o arrastar do controle.
  controleVelocidade.addEventListener('input', () => {
    const velocidade = Number(controleVelocidade.value);
    definirTexto(valorVelocidade, `${velocidade} ger/s`);
    manipuladores.aoMudarVelocidade(velocidade);
  });

  controleRegra.addEventListener('change', () => {
    manipuladores.aoMudarRegra(escolhaValida(controleRegra.value, REGRAS, 'regra'));
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

  controleVento.addEventListener('change', () => {
    manipuladores.aoMudarVento(escolhaValida(controleVento.value, VENTOS, 'vento'));
  });

  // Estado inicial exibido, para o painel já abrir coerente com os valores do HTML.
  definirTexto(valorVelocidade, `${Number(controleVelocidade.value)} ger/s`);

  return {
    atualizarEstatisticas(estatisticas): void {
      definirTexto(statGeracao, String(estatisticas.geracao));
      definirTexto(statContaminado, `${formatarNumero(estatisticas.percentualContaminado)} %`);
      definirTexto(statVegetacao, `${formatarNumero(estatisticas.percentualVegetacao)} %`);
      definirTexto(statConcreto, `${formatarNumero(estatisticas.percentualConcreto)} %`);
    },

    definirRodando(rodando): void {
      definirTexto(botaoExecutar, rodando ? '⏸ Pausar' : '▶ Executar');
      // Avançar uma geração com a simulação rodando não faria sentido: o botão
      // sai de cena enquanto ela está em movimento.
      botaoPasso.disabled = rodando;
      botaoExecutar.setAttribute('aria-pressed', String(rodando));
    },

    /**
     * Espelha a fase nos controles.
     *
     * Cada botão só fica disponível na fase em que a ação dele faz sentido, o
     * que torna impossível pular etapas: não há como construir o sarcófago de um
     * reator que ainda não vazou. O caminho de volta é o "Reiniciar", que
     * recarrega o mapa na fase normal.
     */
    definirFase(fase, cenarioAtivo): void {
      definirTexto(statFase, NOME_FASE[fase]);
      statFase.dataset['fase'] = fase;

      botaoAcidente.disabled = !cenarioAtivo || fase !== 'normal';
      botaoSarcofago.disabled = !cenarioAtivo || fase !== 'acidente';
      botaoAcidente.classList.toggle('destaque', cenarioAtivo && fase === 'normal');
      botaoSarcofago.classList.toggle('destaque', cenarioAtivo && fase === 'acidente');

      // O cenário só existe na regra do acidente; no Jogo da Vida não há usina
      // nenhuma para vazar nem vento que carregue nada.
      controleVento.disabled = !cenarioAtivo;
    },

    definirSemente(texto): void {
      controleSemente.value = texto;
    },

    lerSemente(): string {
      return controleSemente.value;
    },

    lerRegra(): IdRegra {
      return escolhaValida(controleRegra.value, REGRAS, 'regra');
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
