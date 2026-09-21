import './estilo.css';

import {
  aplicarMapa,
  criarParametrosCenario,
  criarRegraCenario,
  criarRegraJogoDaVida,
  criarCamadaDeUso,
  Estado,
  sementeDeTexto,
  Simulacao,
  VIVA,
  type CamadaDeUso,
  type IdMapa,
  type IdRegra,
  type Regra,
} from './engine';
import { Renderizador } from './render';
import { conectarControles, conectarPincel, criarLaco, elemento } from './ui';

/**
 * Ponto de encontro das três camadas.
 *
 * Repare que engine, render e ui não se importam entre si em nenhum momento: é
 * este arquivo que as liga. Ele é, de propósito, o único lugar do projeto onde
 * existe estado global — tudo o mais recebe o que precisa por parâmetro.
 */

/* Grade padrão: 200x125 = 25 mil células. O tamanho foi escolhido pelo DETALHE
 * que ele permite: casas de 2x2 e ruas de 2 células só fazem sentido visual com
 * a grade grande, e a floresta gerada por suavização precisa de espaço para as
 * manchas aparecerem.
 *
 * O tamanho também importa para o CENÁRIO: a recuperação depende de sobrar mata
 * viva em algum canto quando o sarcófago é fechado, porque a vegetação só brota
 * ao lado de vegetação já existente. */
const LARGURA = 200;
const ALTURA = 125;
const SEMENTE_PADRAO = 'retomada';
const VELOCIDADE_PADRAO = 10;

/*
 * Os parâmetros do cenário vivem aqui e são COMPARTILHADOS com a regra: ela os
 * captura no fechamento. Mexer em um controle do painel altera este objeto, e o
 * efeito vale já na geração seguinte — sem reconstruir a regra nem reiniciar a
 * simulação. É o que faz os botões de fase agirem no meio da execução.
 */
const parametros = criarParametrosCenario();

/** As duas regras são criadas uma vez só; o seletor apenas troca qual está em uso. */
const regras: Readonly<Record<IdRegra, Regra>> = {
  acidente: criarRegraCenario(parametros),
  'jogo-da-vida': criarRegraJogoDaVida(),
};

const simulacao = new Simulacao({
  largura: LARGURA,
  altura: ALTURA,
  semente: sementeDeTexto(SEMENTE_PADRAO),
  regra: regras.acidente,
  vizinhanca: 'moore',
  raio: 1,
  // Contorno fixo é o padrão do cenário: fora da grade é solo limpo, então o
  // entorno do mapa funciona como um sumidouro que dilui a contaminação nas
  // bordas. Com contorno periódico a mancha daria a volta e voltaria por trás.
  contorno: 'fixo',
});

/**
 * Camada estática de uso do solo, que o mapa produz e só o renderizador lê.
 *
 * Ela fica aqui, e não dentro da simulação, justamente para que nenhuma regra
 * consiga alcançá-la — ver `uso.ts`.
 */
let usos: CamadaDeUso = criarCamadaDeUso(simulacao.totalCelulas);

const renderizador = new Renderizador(elemento<HTMLCanvasElement>('tela'), LARGURA, ALTURA);

const laco = criarLaco({
  aoPassar: () => simulacao.passo(),
  aoDesenhar: () => atualizarTela(),
  velocidade: VELOCIDADE_PADRAO,
});

const controles = conectarControles({
  aoAlternarExecucao: () => {
    laco.alternar();
    controles.definirRodando(laco.rodando);
  },

  aoPassoUnico: () => {
    simulacao.passo();
    atualizarTela();
  },

  aoReiniciar: () => recarregarMapa(),

  aoMudarVelocidade: (velocidade) => laco.definirVelocidade(velocidade),

  aoMudarRegra: (id) => {
    simulacao.definirRegra(regras[id]);
    atualizarTela();
  },

  aoMudarMapa: (mapa) => recarregarMapa(mapa),

  aoMudarSemente: () => recarregarMapa(),

  aoSortearSemente: () => {
    // `Math.random` aqui é intencional e não compromete a reprodutibilidade: ele
    // serve só para sugerir uma semente nova. Uma vez escolhida, a semente é
    // exibida no campo e pode ser anotada para repetir o experimento.
    const nova = Math.floor(Math.random() * 100000);
    controles.definirSemente(String(nova));
    recarregarMapa();
  },

  aoMudarVizinhanca: (tipo) => {
    simulacao.definirVizinhanca(tipo, controles.lerRaio());
    atualizarTela();
  },

  aoMudarRaio: (raio) => {
    simulacao.definirVizinhanca(controles.lerVizinhanca(), raio);
    atualizarTela();
  },

  aoMudarContorno: (tipo) => {
    simulacao.definirContorno(tipo);
    atualizarTela();
  },

  aoMudarVento: (vento) => {
    parametros.vento = vento;
  },

  aoDispararAcidente: () => {
    parametros.fase = 'acidente';
    atualizarTela();
  },

  aoConstruirSarcofago: () => {
    parametros.fase = 'sarcofago';
    atualizarTela();
  },
});

conectarPincel({
  canvas: elemento<HTMLCanvasElement>('tela'),
  localizar: (x, y) => renderizador.celulaEm(x, y),
  pintar: (x, y, apagar) => {
    // O pincel com seleção de estado chega na etapa 4; por ora ele pinta
    // vegetação e apaga para solo limpo, o que já serve às duas regras.
    simulacao.definirCelula(x, y, apagar ? Estado.SOLO : VIVA);
    // Redesenhar a cada célula pintada mantém o traço colado no ponteiro; como
    // só acontece durante o arrasto, o custo é irrelevante.
    atualizarTela();
  },
});

/**
 * Redesenha a grade e atualiza os números do painel.
 *
 * É declarada como função (e não como constante) para poder ser usada acima,
 * dentro dos manipuladores, sem depender da ordem de declaração.
 */
function atualizarTela(): void {
  renderizador.desenhar(simulacao.grade, usos);
  controles.atualizarEstatisticas(simulacao.estatisticas());
  controles.definirRodando(laco.rodando);
  controles.definirFase(parametros.fase, simulacao.regra.id === 'acidente');
}

/** Recarrega o mapa inicial com a semente que estiver no painel. */
function recarregarMapa(mapa: IdMapa = controles.lerMapa()): void {
  // Recarregar um mapa é recomeçar o experimento do zero: a usina volta a operar
  // normalmente e a cidade, a ser habitada.
  parametros.fase = 'normal';
  usos = aplicarMapa(simulacao, mapa, sementeDeTexto(controles.lerSemente()));
  atualizarTela();
}

// O canvas ajusta a resolução interna ao seu tamanho na tela; quando a janela
// muda de largura (ou o celular gira), é preciso refazer a conta e redesenhar.
new ResizeObserver(() => {
  renderizador.ajustar();
  atualizarTela();
}).observe(elemento('tela'));

controles.definirSemente(SEMENTE_PADRAO);
recarregarMapa();
