import type { Estatisticas } from '../engine';

/**
 * Gráfico de linhas das três séries do cenário, ao vivo.
 *
 * DECISÕES DE VISUALIZAÇÃO
 *
 * *Forma.* Os dados são três grandezas comparáveis ao longo do tempo, então a
 * forma é linha — e as três dividem UM único eixo, de 0 a 100 %. Nunca dois
 * eixos: com escalas diferentes, qualquer cruzamento entre as curvas vira
 * coincidência de desenho, não fato.
 *
 * *Cor.* As cores NÃO são as do mapa, e isso é deliberado. As do mapa foram
 * escolhidas para células de poucos pixels sobre fundo escuro; em traços de 2 px
 * elas falham em dois pontos verificáveis: o cinza do concreto tem croma baixo
 * demais e lê como linha de grade, e os dois verdes ficam a uma distância
 * perceptual pequena demais um do outro. A paleta abaixo mantém a associação
 * (a contaminação continua amarelo-esverdeada, a vegetação verde, o concreto
 * frio como construção) e passa nos seis testes de contraste, croma e separação
 * para daltonismo contra o fundo escuro do painel.
 *
 * *Identidade nunca só pela cor.* A legenda está sempre presente e traz o valor
 * de cada série em número, que é também o que muda quando o ponteiro percorre o
 * gráfico. Quem não distingue as cores continua conseguindo ler tudo.
 */

/** Uma série do gráfico. */
export interface SerieGrafico {
  readonly rotulo: string;
  readonly cor: string;
  readonly valor: (estatisticas: Estatisticas) => number;
}

/** Uma marcação vertical — os instantes em que o cenário mudou de fase. */
export interface MarcoGrafico {
  readonly geracao: number;
  readonly rotulo: string;
}

export const SERIES_DO_CENARIO: readonly SerieGrafico[] = [
  { rotulo: 'Contaminado', cor: '#86a02b', valor: (e) => e.percentualContaminado },
  { rotulo: 'Vegetação', cor: '#0d7d5d', valor: (e) => e.percentualVegetacao },
  { rotulo: 'Concreto', cor: '#7a8fd4', valor: (e) => e.percentualConcreto },
];

/* Espelham os tokens do tema escuro em `estilo.css`; o canvas não lê CSS. */
const COR_GRADE = '#2b2823';
const COR_EIXO = '#6b645a';
const COR_MARCO = '#5c544a';

const MARGEM_ESQUERDA = 26;
const MARGEM_TOPO = 6;
const MARGEM_BAIXO = 14;
const MARGEM_DIREITA = 4;

export interface Grafico {
  /** Redesenha com o histórico e as marcações atuais. */
  desenhar: (historico: readonly Estatisticas[], marcos: readonly MarcoGrafico[]) => void;
}

export interface OpcoesGrafico {
  canvas: HTMLCanvasElement;
  /** Elemento que recebe a legenda com os valores. */
  legenda: HTMLElement;
  series?: readonly SerieGrafico[];
}

export function criarGrafico(opcoes: OpcoesGrafico): Grafico {
  const { canvas, legenda } = opcoes;
  const series = opcoes.series ?? SERIES_DO_CENARIO;

  const contextoOuNulo = canvas.getContext('2d');
  if (contextoOuNulo === null) {
    throw new Error('Não foi possível obter o contexto 2D do gráfico.');
  }
  // O tipo explícito é necessário: o TypeScript não leva o estreitamento do
  // `null` para dentro das funções declaradas abaixo.
  const contexto: CanvasRenderingContext2D = contextoOuNulo;

  let historicoAtual: readonly Estatisticas[] = [];
  let marcosAtuais: readonly MarcoGrafico[] = [];
  /** Geração sob o ponteiro, ou `null` quando ele não está sobre o gráfico. */
  let geracaoDestacada: number | null = null;

  /* ---------------------------------------------------------------------- */
  /* Legenda                                                                 */
  /* ---------------------------------------------------------------------- */

  const valoresDaLegenda = series.map((serie) => {
    const item = document.createElement('div');
    item.className = 'serie';

    const amostra = document.createElement('span');
    amostra.className = 'amostra-serie';
    amostra.style.setProperty('--cor-serie', serie.cor);

    const nome = document.createElement('span');
    nome.className = 'nome-serie';
    nome.textContent = serie.rotulo;

    const valor = document.createElement('span');
    valor.className = 'valor-serie';
    valor.textContent = '—';

    item.append(amostra, nome, valor);
    legenda.append(item);
    return valor;
  });

  const cabecalhoDaLegenda = document.createElement('div');
  cabecalhoDaLegenda.className = 'geracao-legenda';
  legenda.prepend(cabecalhoDaLegenda);

  function atualizarLegenda(): void {
    const amostra =
      geracaoDestacada === null
        ? historicoAtual.at(-1)
        : historicoAtual[Math.min(geracaoDestacada, historicoAtual.length - 1)];

    cabecalhoDaLegenda.textContent =
      amostra === undefined ? 'sem dados' : `geração ${amostra.geracao}`;

    series.forEach((serie, i) => {
      valoresDaLegenda[i]!.textContent =
        amostra === undefined ? '—' : `${serie.valor(amostra).toFixed(1).replace('.', ',')} %`;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Desenho                                                                 */
  /* ---------------------------------------------------------------------- */

  function desenhar(
    historico: readonly Estatisticas[],
    marcos: readonly MarcoGrafico[],
  ): void {
    historicoAtual = historico;
    marcosAtuais = marcos;

    const caixa = canvas.getBoundingClientRect();
    if (caixa.width === 0 || caixa.height === 0) return;

    const densidade = window.devicePixelRatio || 1;
    const largura = Math.round(caixa.width * densidade);
    const altura = Math.round(caixa.height * densidade);
    if (canvas.width !== largura || canvas.height !== altura) {
      canvas.width = largura;
      canvas.height = altura;
    }

    // Desenhar em unidades de CSS e deixar a escala por conta do contexto mantém
    // as espessuras coerentes em qualquer densidade de tela.
    contexto.setTransform(densidade, 0, 0, densidade, 0, 0);
    contexto.clearRect(0, 0, caixa.width, caixa.height);

    const areaX = MARGEM_ESQUERDA;
    const areaY = MARGEM_TOPO;
    const areaLargura = caixa.width - MARGEM_ESQUERDA - MARGEM_DIREITA;
    const areaAltura = caixa.height - MARGEM_TOPO - MARGEM_BAIXO;
    if (areaLargura <= 0 || areaAltura <= 0) return;

    const ultima = historico.at(-1);
    const geracaoFinal = Math.max(1, ultima?.geracao ?? 1);

    const paraX = (geracao: number): number => areaX + (geracao / geracaoFinal) * areaLargura;
    const paraY = (percentual: number): number => areaY + (1 - percentual / 100) * areaAltura;

    // Grade recessiva: presente para dar escala, nunca competindo com os dados.
    contexto.lineWidth = 1;
    contexto.strokeStyle = COR_GRADE;
    contexto.fillStyle = COR_EIXO;
    contexto.font = '9px system-ui, sans-serif';
    contexto.textAlign = 'right';
    contexto.textBaseline = 'middle';

    for (const percentual of [0, 25, 50, 75, 100]) {
      const y = Math.round(paraY(percentual)) + 0.5;
      contexto.beginPath();
      contexto.moveTo(areaX, y);
      contexto.lineTo(areaX + areaLargura, y);
      contexto.stroke();
      // Só os extremos e o meio recebem rótulo: o resto seria ruído.
      if (percentual % 50 === 0) {
        contexto.fillText(String(percentual), areaX - 4, y);
      }
    }

    // Marcações de fase.
    contexto.strokeStyle = COR_MARCO;
    contexto.setLineDash([3, 3]);
    for (const marco of marcos) {
      if (marco.geracao > geracaoFinal) continue;
      const x = Math.round(paraX(marco.geracao)) + 0.5;
      contexto.beginPath();
      contexto.moveTo(x, areaY);
      contexto.lineTo(x, areaY + areaAltura);
      contexto.stroke();
    }
    contexto.setLineDash([]);

    if (historico.length < 2) {
      atualizarLegenda();
      return;
    }

    /*
     * Reamostragem: com centenas de gerações e poucas centenas de pixels, mais de
     * um ponto cai no mesmo pixel. Desenhar todos custaria caro sem mudar nada do
     * que se vê, então o passo acompanha a largura disponível.
     */
    const passo = Math.max(1, Math.floor(historico.length / (areaLargura * 2)));

    contexto.lineWidth = 2;
    contexto.lineJoin = 'round';
    contexto.lineCap = 'round';

    for (const serie of series) {
      contexto.strokeStyle = serie.cor;
      contexto.beginPath();
      for (let i = 0; i < historico.length; i += passo) {
        const ponto = historico[i]!;
        const x = paraX(ponto.geracao);
        const y = paraY(serie.valor(ponto));
        if (i === 0) contexto.moveTo(x, y);
        else contexto.lineTo(x, y);
      }
      // O último ponto entra sempre, mesmo que a reamostragem o pularia: é o
      // valor atual, o que mais interessa em um gráfico ao vivo.
      const fim = historico.at(-1)!;
      contexto.lineTo(paraX(fim.geracao), paraY(serie.valor(fim)));
      contexto.stroke();
    }

    // Cursor de leitura.
    if (geracaoDestacada !== null) {
      const x = Math.round(paraX(geracaoDestacada)) + 0.5;
      contexto.strokeStyle = COR_EIXO;
      contexto.lineWidth = 1;
      contexto.beginPath();
      contexto.moveTo(x, areaY);
      contexto.lineTo(x, areaY + areaAltura);
      contexto.stroke();

      const ponto = historico[Math.min(geracaoDestacada, historico.length - 1)];
      if (ponto !== undefined) {
        for (const serie of series) {
          contexto.fillStyle = serie.cor;
          contexto.beginPath();
          contexto.arc(x, paraY(serie.valor(ponto)), 3, 0, Math.PI * 2);
          contexto.fill();
        }
      }
    }

    atualizarLegenda();
  }

  /* ---------------------------------------------------------------------- */
  /* Leitura com o ponteiro                                                  */
  /* ---------------------------------------------------------------------- */

  canvas.addEventListener('pointermove', (evento: PointerEvent) => {
    const caixa = canvas.getBoundingClientRect();
    const areaLargura = caixa.width - MARGEM_ESQUERDA - MARGEM_DIREITA;
    if (areaLargura <= 0 || historicoAtual.length === 0) return;

    const proporcao = (evento.clientX - caixa.left - MARGEM_ESQUERDA) / areaLargura;
    const geracaoFinal = historicoAtual.at(-1)?.geracao ?? 0;
    geracaoDestacada = Math.max(0, Math.min(geracaoFinal, Math.round(proporcao * geracaoFinal)));
    desenhar(historicoAtual, marcosAtuais);
  });

  canvas.addEventListener('pointerleave', () => {
    geracaoDestacada = null;
    desenhar(historicoAtual, marcosAtuais);
  });

  atualizarLegenda();

  return { desenhar };
}
