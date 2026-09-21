import { criarResolvedor, type TipoContorno } from './contorno';
import { Estado, TOTAL_ESTADOS } from './estados';
import { criarRng, type Rng } from './rng';
import type { ContextoCelula, Regra } from './regras';
import { criarDeslocamentos, Vizinhanca, type Raio, type TipoVizinhanca } from './vizinhanca';

/** Parâmetros de criação da simulação. */
export interface ConfiguracaoSimulacao {
  largura: number;
  altura: number;
  /** Semente do gerador pseudoaleatório; define a reprodutibilidade. */
  semente: number;
  regra: Regra;
  vizinhanca?: TipoVizinhanca;
  raio?: Raio;
  contorno?: TipoContorno;
}

/**
 * Fotografia numérica de uma geração.
 *
 * Guardar as contagens brutas (e não só os percentuais) permite recalcular
 * qualquer indicador depois, inclusive na exportação em CSV para o relatório.
 */
export interface Estatisticas {
  readonly geracao: number;
  /** Quantidade de células em cada estado, indexado por `Estado`. */
  readonly contagem: readonly number[];
  readonly total: number;
  readonly percentualContaminado: number;
  readonly percentualVegetacao: number;
  readonly percentualConcreto: number;
}

/**
 * Versão mutável de `ContextoCelula`.
 *
 * O contexto é `readonly` para quem escreve regras — ninguém deve alterá-lo de
 * dentro de uma regra. Mas a simulação precisa reaproveitar o MESMO objeto para
 * todas as células (de novo: evitar alocar um objeto por célula por geração), e
 * para isso precisa escrever nos campos. Este tipo mapeado remove o `readonly`
 * apenas aqui dentro, sem enfraquecer o contrato público.
 */
type ContextoMutavel = { -readonly [K in keyof ContextoCelula]: ContextoCelula[K] };

/**
 * O autômato celular propriamente dito: grade, regra e avanço de gerações.
 *
 * Esta classe não sabe nada sobre canvas, cores ou eventos — ela só transforma
 * uma grade de bytes em outra. É o que permite testá-la inteira no Node, sem
 * navegador (ver `testes/`).
 */
export class Simulacao {
  readonly largura: number;
  readonly altura: number;
  readonly totalCelulas: number;

  /**
   * DOUBLE BUFFERING: dois vetores do mesmo tamanho.
   *
   * A regra lê de `atual` e a simulação escreve em `proxima`; no fim da geração
   * os dois trocam de papel. Isso garante a atualização SÍNCRONA exigida por um
   * autômato celular: uma célula já recalculada não pode influenciar as
   * vizinhas que ainda serão recalculadas nesta mesma geração. Além disso,
   * trocar referências é O(1) — não há cópia de memória entre gerações.
   */
  private atual: Uint8Array;
  private proxima: Uint8Array;

  private regraAtual: Regra;
  private tipoVizinhanca: TipoVizinhanca;
  private raioVizinhanca: Raio;
  private tipoContorno: TipoContorno;
  private vizinhanca: Vizinhanca;
  /**
   * Segunda vizinhança, de raio maior, para regras com fontes de longo alcance.
   *
   * Quando a regra não declara `raioAmplo`, ela é montada com o mesmo raio da
   * normal: custa pouco e evita espalhar `null` pelo contrato das regras.
   */
  private vizinhancaAmpla: Vizinhanca;

  private geracaoAtual = 0;
  private sementeAtual: number;
  private geradorAtual: Rng;

  /** Contexto único, reposicionado célula a célula dentro de `passo()`. */
  private readonly contexto: ContextoMutavel;

  private readonly registros: Estatisticas[] = [];
  private ultimasEstatisticas: Estatisticas | null = null;
  /** Marca que a grade mudou e as estatísticas precisam ser recalculadas. */
  private estatisticasDesatualizadas = true;

  constructor(config: ConfiguracaoSimulacao) {
    this.largura = config.largura;
    this.altura = config.altura;
    this.totalCelulas = config.largura * config.altura;

    // Uint8Array: 1 byte por célula (temos 9 estados, cabe de sobra). Uma grade
    // de 160x100 ocupa 16 KB, então as duas cabem no cache do processador — o
    // que é justamente o que mantém a simulação fluida.
    this.atual = new Uint8Array(this.totalCelulas);
    this.proxima = new Uint8Array(this.totalCelulas);

    this.regraAtual = config.regra;
    this.tipoVizinhanca = config.vizinhanca ?? 'moore';
    this.raioVizinhanca = config.raio ?? 1;
    this.tipoContorno = config.contorno ?? 'periodico';

    this.sementeAtual = config.semente;
    this.geradorAtual = criarRng(config.semente);
    this.vizinhanca = this.montarVizinhanca(this.raioVizinhanca);
    this.vizinhancaAmpla = this.montarVizinhanca(this.raioAmploDaRegra());

    this.contexto = {
      estado: Estado.SOLO,
      x: 0,
      y: 0,
      vizinhanca: this.vizinhanca,
      vizinhancaAmpla: this.vizinhancaAmpla,
      rng: this.geradorAtual,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Leitura                                                                 */
  /* ---------------------------------------------------------------------- */

  get geracao(): number {
    return this.geracaoAtual;
  }

  get semente(): number {
    return this.sementeAtual;
  }

  get rng(): Rng {
    return this.geradorAtual;
  }

  get regra(): Regra {
    return this.regraAtual;
  }

  /**
   * Grade da geração corrente, em leitura.
   *
   * Devolve o vetor interno, sem cópia, porque o renderizador o percorre inteiro
   * a cada quadro. Escrever nele diretamente funcionaria, mas deixaria as
   * estatísticas defasadas — use `definirCelula`.
   */
  get grade(): Uint8Array {
    return this.atual;
  }

  /** Série histórica, uma entrada por geração, para o gráfico e o CSV. */
  get historico(): readonly Estatisticas[] {
    return this.registros;
  }

  obterCelula(x: number, y: number): Estado {
    return this.atual[y * this.largura + x]! as Estado;
  }

  /** Verdadeiro se (x, y) está dentro da grade. */
  contem(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.largura && y < this.altura;
  }

  /* ---------------------------------------------------------------------- */
  /* Escrita                                                                 */
  /* ---------------------------------------------------------------------- */

  /** Pinta uma célula. Coordenadas fora da grade são ignoradas em silêncio. */
  definirCelula(x: number, y: number, estado: Estado): void {
    if (!this.contem(x, y)) return;
    this.atual[y * this.largura + x] = estado;
    this.estatisticasDesatualizadas = true;
  }

  /** Preenche a grade inteira com um estado. */
  preencher(estado: Estado): void {
    this.atual.fill(estado);
    this.estatisticasDesatualizadas = true;
  }

  /**
   * Volta para a geração 0: limpa a grade, o histórico e RECRIA o gerador a
   * partir da semente. Recriar é essencial — sem isso, reiniciar continuaria de
   * onde a sequência pseudoaleatória havia parado e a execução não seria
   * reproduzível.
   */
  reiniciar(semente: number = this.sementeAtual): void {
    this.sementeAtual = semente;
    this.geradorAtual = criarRng(semente);
    this.contexto.rng = this.geradorAtual;

    this.atual.fill(Estado.SOLO);
    this.proxima.fill(Estado.SOLO);
    this.geracaoAtual = 0;
    this.registros.length = 0;
    this.ultimasEstatisticas = null;
    this.estatisticasDesatualizadas = true;
  }

  /* ---------------------------------------------------------------------- */
  /* Configuração trocável em tempo de execução                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Troca a regra em uso.
   *
   * Reconstrói a vizinhança ampliada porque o raio dela é declarado PELA REGRA:
   * cada uma diz de quanto alcance precisa, e a simulação providencia.
   */
  definirRegra(regra: Regra): void {
    this.regraAtual = regra;
    this.trocarVizinhanca();
  }

  definirVizinhanca(tipo: TipoVizinhanca, raio: Raio): void {
    this.tipoVizinhanca = tipo;
    this.raioVizinhanca = raio;
    this.trocarVizinhanca();
  }

  definirContorno(tipo: TipoContorno): void {
    this.tipoContorno = tipo;
    this.trocarVizinhanca();
  }

  /* ---------------------------------------------------------------------- */
  /* Avanço de geração                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Calcula uma geração inteira e devolve as estatísticas resultantes.
   *
   * A varredura é sempre linha a linha, da esquerda para a direita. A ordem
   * importa para as regras probabilísticas: é ela que define a ordem de consumo
   * dos números do gerador e, portanto, a reprodutibilidade.
   */
  passo(): Estatisticas {
    const { largura, altura, atual, proxima, contexto, vizinhanca, vizinhancaAmpla } = this;
    vizinhanca.usarFonte(atual);
    vizinhancaAmpla.usarFonte(atual);

    let i = 0;
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++, i++) {
        contexto.estado = atual[i]! as Estado;
        contexto.x = x;
        contexto.y = y;
        vizinhanca.posicionar(x, y);
        vizinhancaAmpla.posicionar(x, y);
        proxima[i] = this.regraAtual.aplicar(contexto);
      }
    }

    // A troca de papéis: o que era rascunho vira a geração corrente.
    this.atual = proxima;
    this.proxima = atual;
    this.geracaoAtual++;
    this.estatisticasDesatualizadas = true;

    return this.estatisticas();
  }

  /* ---------------------------------------------------------------------- */
  /* Estatísticas                                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * Estatísticas da geração corrente, recalculadas apenas quando a grade mudou.
   *
   * O cache existe porque a interface pede esses números a cada quadro (até 60
   * vezes por segundo), enquanto a grade só muda a cada geração.
   */
  estatisticas(): Estatisticas {
    if (this.ultimasEstatisticas !== null && !this.estatisticasDesatualizadas) {
      return this.ultimasEstatisticas;
    }

    const estatisticas = this.calcularEstatisticas();
    this.ultimasEstatisticas = estatisticas;
    this.estatisticasDesatualizadas = false;
    this.anotarNoHistorico(estatisticas);
    return estatisticas;
  }

  private calcularEstatisticas(): Estatisticas {
    const contagem = new Array<number>(TOTAL_ESTADOS).fill(0);
    for (let i = 0; i < this.atual.length; i++) {
      contagem[this.atual[i]!]!++;
    }

    const total = this.totalCelulas;
    const contaminadas =
      contagem[Estado.CONTAMINADO_LEVE]! +
      contagem[Estado.CONTAMINADO_MODERADO]! +
      contagem[Estado.CONTAMINADO_GRAVE]!;
    const vegetacao =
      contagem[Estado.GRAMA]! + contagem[Estado.ARBUSTO]! + contagem[Estado.ARVORE]!;

    return {
      geracao: this.geracaoAtual,
      contagem,
      total,
      percentualContaminado: (contaminadas / total) * 100,
      percentualVegetacao: (vegetacao / total) * 100,
      percentualConcreto: (contagem[Estado.CONCRETO]! / total) * 100,
    };
  }

  /**
   * Acrescenta ao histórico — ou substitui a última entrada, se ela for da mesma
   * geração. A substituição cobre o caso de o usuário desenhar com o pincel com
   * a simulação pausada: o histórico continua com exatamente uma linha por
   * geração, que é o formato esperado pelo CSV.
   */
  private anotarNoHistorico(estatisticas: Estatisticas): void {
    const ultima = this.registros[this.registros.length - 1];
    if (ultima !== undefined && ultima.geracao === estatisticas.geracao) {
      this.registros[this.registros.length - 1] = estatisticas;
    } else {
      this.registros.push(estatisticas);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Auxiliares privados                                                     */
  /* ---------------------------------------------------------------------- */

  /** Raio pedido pela regra em uso, ou o raio normal se ela não pedir nada. */
  private raioAmploDaRegra(): number {
    return this.regraAtual.raioAmplo ?? this.raioVizinhanca;
  }

  private montarVizinhanca(raio: number): Vizinhanca {
    return new Vizinhanca(
      criarDeslocamentos(this.tipoVizinhanca, raio),
      criarResolvedor(this.tipoContorno, this.largura, this.altura),
      this.atual,
      // Fora da grade = solo limpo. No Jogo da Vida isso equivale a célula
      // morta, já que VIVA é a grama; então o mesmo contorno serve às duas regras.
      Estado.SOLO,
    );
  }

  /** Recria os dois leitores de vizinhança e os reinjeta no contexto reutilizado. */
  private trocarVizinhanca(): void {
    this.vizinhanca = this.montarVizinhanca(this.raioVizinhanca);
    this.vizinhancaAmpla = this.montarVizinhanca(this.raioAmploDaRegra());
    this.contexto.vizinhanca = this.vizinhanca;
    this.contexto.vizinhancaAmpla = this.vizinhancaAmpla;
  }
}
