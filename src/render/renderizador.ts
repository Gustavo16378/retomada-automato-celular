import type { CamadaDeUso } from '../engine';
import {
  APARENCIA_POR_ESTADO_E_USO,
  COR_FUNDO,
  NIVEIS_DE_TOM,
  PALETA_VARIADA,
  tomDaCelula,
} from './paleta';

/** Posição de uma célula na grade. */
export interface PosicaoCelula {
  readonly x: number;
  readonly y: number;
}

/**
 * Desenha a grade no canvas.
 *
 * ESTRATÉGIA: um `fillRect` por célula seriam 25 mil chamadas ao contexto 2D por
 * quadro — o suficiente para derrubar a taxa de quadros. Em vez disso:
 *
 *   1. escrevemos os pixels de uma vez em um `ImageData` do tamanho EXATO da
 *      grade (200x125 = 25 mil pixels, um por célula);
 *   2. jogamos esse `ImageData` em um canvas auxiliar, fora da tela;
 *   3. ampliamos esse canvas para o canvas visível com um único `drawImage`,
 *      com a suavização desligada para os pixels ficarem quadrados e nítidos.
 *
 * O passo 3 é acelerado pelo próprio navegador, então o custo por quadro deixa
 * de depender do tamanho da tela e passa a depender só do tamanho da grade.
 */
export class Renderizador {
  readonly largura: number;
  readonly altura: number;

  private readonly canvas: HTMLCanvasElement;
  private readonly contexto: CanvasRenderingContext2D;
  private readonly canvasAuxiliar: HTMLCanvasElement;
  private readonly contextoAuxiliar: CanvasRenderingContext2D;
  private readonly imagem: ImageData;
  /**
   * Índice pré-calculado da paleta para o tom de cada célula.
   *
   * Guardar `tom * 3` em vez do tom poupa uma multiplicação por pixel por
   * quadro. É calculado uma vez, na construção, porque o tom depende apenas das
   * coordenadas — é justamente o que faz a variação ficar estável entre quadros.
   */
  private readonly tons: Uint8Array;

  /** Geometria do último ajuste: quantos pixels do canvas cada célula ocupa. */
  private escala = 1;
  private deslocamentoX = 0;
  private deslocamentoY = 0;

  constructor(canvas: HTMLCanvasElement, largura: number, altura: number) {
    this.canvas = canvas;
    this.largura = largura;
    this.altura = altura;

    const contexto = canvas.getContext('2d');
    if (contexto === null) throw new Error('Não foi possível obter o contexto 2D do canvas.');
    this.contexto = contexto;

    this.canvasAuxiliar = document.createElement('canvas');
    this.canvasAuxiliar.width = largura;
    this.canvasAuxiliar.height = altura;
    const auxiliar = this.canvasAuxiliar.getContext('2d');
    if (auxiliar === null) throw new Error('Não foi possível obter o contexto 2D auxiliar.');
    this.contextoAuxiliar = auxiliar;

    this.imagem = auxiliar.createImageData(largura, altura);

    // O canal alfa nunca muda (tudo é opaco), então é preenchido uma única vez
    // aqui. A cada quadro o laço só precisa escrever R, G e B.
    const dados = this.imagem.data;
    for (let i = 3; i < dados.length; i += 4) dados[i] = 255;

    this.tons = new Uint8Array(largura * altura);
    for (let y = 0, i = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++, i++) this.tons[i] = tomDaCelula(x, y) * 3;
    }

    // A proporção da grade é fixada no elemento para que o CSS possa reservar o
    // espaço certo antes mesmo do primeiro desenho, evitando um salto no layout.
    canvas.style.aspectRatio = `${largura} / ${altura}`;

    this.ajustar();
  }

  /**
   * Sincroniza a resolução interna do canvas com o tamanho que ele ocupa na
   * página, multiplicado pela densidade de pixels do dispositivo.
   *
   * Sem isso, em telas de alta densidade (celulares, notebooks com escala do
   * sistema acima de 100%) o canvas seria esticado e apareceria borrado.
   * Deve ser chamado sempre que o elemento mudar de tamanho.
   */
  ajustar(): void {
    const caixa = this.canvas.getBoundingClientRect();
    if (caixa.width === 0 || caixa.height === 0) return;

    const densidade = window.devicePixelRatio || 1;
    const largura = Math.max(1, Math.round(caixa.width * densidade));
    const altura = Math.max(1, Math.round(caixa.height * densidade));

    // Atribuir a `width`/`height` limpa o canvas, então só fazemos isso quando o
    // tamanho realmente mudou.
    if (this.canvas.width !== largura || this.canvas.height !== altura) {
      this.canvas.width = largura;
      this.canvas.height = altura;
    }

    // A escala é a mesma nos dois eixos para as células ficarem quadradas; sobra
    // é centralizada (o CSS já mantém a proporção, então a sobra é mínima).
    this.escala = Math.min(largura / this.largura, altura / this.altura);
    this.deslocamentoX = Math.floor((largura - this.largura * this.escala) / 2);
    this.deslocamentoY = Math.floor((altura - this.altura * this.escala) / 2);
  }

  /**
   * Desenha a grade recebida.
   *
   * @param usos camada estática de uso do solo, que distingue rua, casa e prédio
   *   dentro do mesmo estado `CONCRETO`. Ver `uso.ts`.
   */
  desenhar(grade: Uint8Array, usos: CamadaDeUso): void {
    const dados = this.imagem.data;
    const { tons } = this;

    /*
     * O laço mais quente do projeto: roda uma vez por célula, a cada quadro.
     *
     * Ele não tem nenhum `if`, nenhuma conta de cor e nenhuma chamada de função
     * — só três indexações. Tanto a escolha da aparência (estado + uso) quanto a
     * variação de tom já estão resolvidas em tabelas montadas na inicialização.
     */
    for (let celula = 0, pixel = 0; celula < grade.length; celula++, pixel += 4) {
      const aparencia = APARENCIA_POR_ESTADO_E_USO[usos[celula]! * 16 + grade[celula]!]!;
      const cor = aparencia * NIVEIS_DE_TOM * 3 + tons[celula]!;
      dados[pixel] = PALETA_VARIADA[cor]!;
      dados[pixel + 1] = PALETA_VARIADA[cor + 1]!;
      dados[pixel + 2] = PALETA_VARIADA[cor + 2]!;
    }

    this.contextoAuxiliar.putImageData(this.imagem, 0, 0);

    const { contexto } = this;
    contexto.fillStyle = COR_FUNDO;
    contexto.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // Suavização desligada: queremos pixels quadrados e bordas duras, e não a
    // interpolação borrada que o navegador faria por padrão ao ampliar.
    contexto.imageSmoothingEnabled = false;
    contexto.drawImage(
      this.canvasAuxiliar,
      this.deslocamentoX,
      this.deslocamentoY,
      this.largura * this.escala,
      this.altura * this.escala,
    );
  }

  /**
   * Converte uma coordenada de ponteiro (mouse ou toque) na célula correspondente.
   *
   * É o caminho inverso do desenho, e por isso mora aqui: o renderizador é o
   * único que conhece a escala e o deslocamento aplicados. Devolve `null` se o
   * ponto cair na moldura, fora da grade.
   */
  celulaEm(clienteX: number, clienteY: number): PosicaoCelula | null {
    const caixa = this.canvas.getBoundingClientRect();
    const densidade = window.devicePixelRatio || 1;

    const px = (clienteX - caixa.left) * densidade - this.deslocamentoX;
    const py = (clienteY - caixa.top) * densidade - this.deslocamentoY;

    const x = Math.floor(px / this.escala);
    const y = Math.floor(py / this.escala);

    if (x < 0 || y < 0 || x >= this.largura || y >= this.altura) return null;
    return { x, y };
  }
}
