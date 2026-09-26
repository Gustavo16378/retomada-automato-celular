import './estilo.css';

import {
  aplicarMapa,
  criarCamadaDeUso,
  criarParametrosCenario,
  criarRegraCenario,
  criarRegraJogoDaVida,
  Estado,
  montarCsv,
  sementeDeTexto,
  Simulacao,
  type CamadaDeUso,
  type Fase,
  type IdMapa,
  type IdRegra,
  type Regra,
} from './engine';
import { Renderizador } from './render';
import {
  baixarArquivo,
  baixarTexto,
  capturaSolicitada,
  conectarControles,
  conectarParametros,
  conectarPincel,
  conectarSeletorDeEstado,
  criarGrafico,
  criarLaco,
  elemento,
  executarCaptura,
  nomeDoExperimento,
  type MarcoGrafico,
} from './ui';

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
/** Ampliação da imagem exportada: 200x125 vira 800x500. */
const ESCALA_DO_PNG = 4;

/*
 * Com `?og=1` a página vira uma tela de captura da imagem de compartilhamento, e
 * a aplicação normal nem chega a ser montada. Sem o parâmetro — que é o caso de
 * qualquer visita real — nada disso é executado.
 */
if (capturaSolicitada()) {
  executarCaptura({ largura: LARGURA, altura: ALTURA, semente: SEMENTE_PADRAO });
} else {
  iniciarAplicacao();
}

function iniciarAplicacao(): void {
  /*
   * Os parâmetros do cenário vivem aqui e são COMPARTILHADOS com a regra: ela os
   * captura no fechamento. Mexer em um controle do painel altera este objeto, e
   * o efeito vale já na geração seguinte — sem reconstruir a regra nem reiniciar
   * a simulação. É o que faz os botões de fase e os controles de parâmetro
   * agirem no meio da execução.
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

  /**
   * Em que geração cada mudança de fase aconteceu.
   *
   * Serve ao gráfico: sem essas marcas, as curvas mostram o QUE aconteceu mas
   * não QUANDO alguém interveio, que é metade da leitura.
   */
  let marcos: MarcoGrafico[] = [];

  const renderizador = new Renderizador(elemento<HTMLCanvasElement>('tela'), LARGURA, ALTURA);

  const grafico = criarGrafico({
    canvas: elemento<HTMLCanvasElement>('grafico'),
    legenda: elemento('legenda-grafico'),
  });

  const laco = criarLaco({
    aoPassar: () => simulacao.passo(),
    aoDesenhar: () => atualizarTela(),
    velocidade: VELOCIDADE_PADRAO,
  });

  const pincel = conectarSeletorDeEstado(elemento('seletor-estado'), Estado.ARVORE);

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
      // `Math.random` aqui é intencional e não compromete a reprodutibilidade:
      // ele serve só para sugerir uma semente nova. Uma vez escolhida, a semente
      // é exibida no campo e pode ser anotada para repetir o experimento.
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

    aoDispararAcidente: () => mudarFase('acidente', '☢ acidente'),

    aoConstruirSarcofago: () => mudarFase('sarcofago', '🧱 sarcófago'),

    aoExportarCsv: () => {
      baixarTexto(
        nomeDoExperimento('historico', controles.lerSemente(), simulacao.geracao, 'csv'),
        montarCsv(simulacao.historico),
        'text/csv',
      );
    },

    aoExportarPng: () => {
      void renderizador.paraPng(ESCALA_DO_PNG).then((imagem) => {
        baixarArquivo(
          nomeDoExperimento('mapa', controles.lerSemente(), simulacao.geracao, 'png'),
          imagem,
        );
      });
    },
  });

  conectarParametros({
    container: elemento('painel-parametros'),
    parametros,
    aoMudar: () => atualizarTela(),
  });

  conectarPincel({
    canvas: elemento<HTMLCanvasElement>('tela'),
    localizar: (x, y) => renderizador.celulaEm(x, y),
    pintar: (x, y, apagar) => {
      simulacao.definirCelula(x, y, apagar ? Estado.SOLO : pincel.selecionado());
      // Redesenhar a cada célula pintada mantém o traço colado no ponteiro; como
      // só acontece durante o arrasto, o custo é irrelevante.
      atualizarTela();
    },
  });

  /** Muda a fase do cenário e anota a geração em que isso aconteceu. */
  function mudarFase(fase: Fase, rotulo: string): void {
    parametros.fase = fase;
    marcos = [...marcos, { geracao: simulacao.geracao, rotulo }];
    atualizarTela();
  }

  /** Redesenha a grade e atualiza os números do painel. */
  function atualizarTela(): void {
    renderizador.desenhar(simulacao.grade, usos);
    controles.atualizarEstatisticas(simulacao.estatisticas());
    controles.definirRodando(laco.rodando);
    controles.definirFase(parametros.fase, simulacao.regra.id === 'acidente');

    grafico.desenhar(simulacao.historico, marcos);
    elemento('marcos-grafico').textContent =
      marcos.length === 0
        ? 'As linhas tracejadas marcam as mudanças de fase.'
        : marcos.map((m) => `${m.rotulo} na geração ${m.geracao}`).join(' · ');
  }

  /** Recarrega o mapa inicial com a semente que estiver no painel. */
  function recarregarMapa(mapa: IdMapa = controles.lerMapa()): void {
    // Recarregar um mapa é recomeçar o experimento do zero: a usina volta a
    // operar normalmente, a cidade a ser habitada e o gráfico a ficar em branco.
    parametros.fase = 'normal';
    marcos = [];
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
}
