import './estilo.css';

import {
  aplicarMapa,
  criarRegraJogoDaVida,
  MORTA,
  sementeDeTexto,
  Simulacao,
  VIVA,
  type IdMapa,
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

/* Grade padrão: 160x100 = 16 mil células. Grande o bastante para os padrões do
 * cenário aparecerem e pequena o bastante para caber confortavelmente em 60
 * quadros por segundo, mesmo em um notebook modesto. */
const LARGURA = 160;
const ALTURA = 100;
const SEMENTE_PADRAO = 'retomada';
const VELOCIDADE_PADRAO = 10;

const simulacao = new Simulacao({
  largura: LARGURA,
  altura: ALTURA,
  semente: sementeDeTexto(SEMENTE_PADRAO),
  // Etapa 2: só o Jogo da Vida está disponível. A regra do cenário da cidade
  // entra na etapa 3 e será selecionável no mesmo painel.
  regra: criarRegraJogoDaVida(),
  vizinhanca: 'moore',
  raio: 1,
  contorno: 'periodico',
});

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
});

conectarPincel({
  canvas: elemento<HTMLCanvasElement>('tela'),
  localizar: (x, y) => renderizador.celulaEm(x, y),
  pintar: (x, y, apagar) => {
    simulacao.definirCelula(x, y, apagar ? MORTA : VIVA);
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
  const estatisticas = simulacao.estatisticas();
  renderizador.desenhar(simulacao.grade);
  // No Jogo da Vida, "viva" é a grama — daí a contagem sair do mesmo vetor de
  // estatísticas que o cenário da cidade usará para a vegetação.
  controles.atualizarEstatisticas(estatisticas, estatisticas.contagem[VIVA] ?? 0);
  controles.definirRodando(laco.rodando);
}

/** Recarrega o mapa inicial com a semente que estiver no painel. */
function recarregarMapa(mapa: IdMapa = controles.lerMapa()): void {
  aplicarMapa(simulacao, mapa, sementeDeTexto(controles.lerSemente()));
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
