import {
  aplicarMapa,
  criarParametrosCenario,
  criarRegraCenario,
  sementeDeTexto,
  Simulacao,
  Uso,
  type CamadaDeUso,
} from '../engine';
import { Renderizador } from '../render';
import { baixarArquivo } from './exportar';

/**
 * Modo de captura da imagem de compartilhamento.
 *
 * A imagem que o LinkedIn e o WhatsApp mostram ao compartilhar o link precisa ter
 * exatamente 1200x630 e ser um quadro representativo da simulação. Em vez de
 * montá-la à mão em um editor — e ter que refazer tudo sempre que a paleta ou o
 * mapa mudarem —, ela é GERADA pelo próprio simulador, com a semente padrão e um
 * número fixo de gerações. Duas execuções produzem exatamente o mesmo arquivo.
 *
 * O modo é ligado por um parâmetro na URL (`?og=1`) e substitui a página por uma
 * tela de captura. Sem o parâmetro, nada disto é sequer executado: o uso normal
 * da página não muda em nada.
 */

/** Parâmetro que liga o modo de captura. */
export const PARAMETRO_DE_CAPTURA = 'og';

/** Dimensões exigidas pelo Open Graph e pelo Twitter Card. */
export const LARGURA_OG = 1200;
export const ALTURA_OG = 630;

/**
 * Ampliação de cada célula na imagem final.
 *
 * Seis é escolhido, e não arredondado: com ele, 1200x630 corresponde a EXATAMENTE
 * 200x105 células. Uma escala fracionária faria algumas fileiras de células
 * saírem um pixel mais largas que as outras, o que aparece na imagem ampliada.
 */
const ESCALA = 6;

/**
 * Gerações de vazamento antes da captura.
 *
 * O ponto foi escolhido olhando o resultado: é onde a contaminação já tomou a
 * cidade e uma faixa da mata em volta — a imagem mostra a catástrofe em curso —
 * mas ainda sobra floresta viva nas laterais, sem a qual o quadro viraria uma
 * mancha amarela sem história.
 */
const GERACOES_DE_VAZAMENTO = 45;

export interface OpcoesCaptura {
  /** Dimensões da grade, as mesmas da aplicação. */
  largura: number;
  altura: number;
  /** Semente padrão, para a imagem ser sempre a mesma. */
  semente: string;
}

/** Verdadeiro quando a URL pede o modo de captura. */
export function capturaSolicitada(): boolean {
  return new URLSearchParams(window.location.search).has(PARAMETRO_DE_CAPTURA);
}

/** Centro de massa das células que satisfazem o predicado, em coordenadas da grade. */
function centroDe(
  usos: CamadaDeUso,
  largura: number,
  predicado: (uso: Uso) => boolean,
): { x: number; y: number } | null {
  let somaX = 0;
  let somaY = 0;
  let total = 0;

  for (let i = 0; i < usos.length; i++) {
    if (!predicado(usos[i]! as Uso)) continue;
    somaX += i % largura;
    somaY += Math.floor(i / largura);
    total++;
  }

  return total === 0 ? null : { x: somaX / total, y: somaY / total };
}

/**
 * Escolhe a faixa vertical do recorte.
 *
 * O enquadramento é centrado no ponto médio entre o REATOR e o centro da cidade.
 * Só o reator deixaria metade da cidade de fora (ele fica na periferia dela); só
 * a cidade deixaria o reator na borda do quadro. O ponto médio garante os dois
 * dentro da imagem, que é o que a cena precisa contar.
 */
function faixaVertical(
  usos: CamadaDeUso,
  largura: number,
  altura: number,
  alturaDoRecorte: number,
): number {
  const usina = centroDe(usos, largura, (uso) => uso === Uso.USINA);
  const cidade = centroDe(usos, largura, (uso) => uso !== Uso.NATUREZA);

  const alvo =
    usina !== null && cidade !== null ? (usina.y + cidade.y) / 2 : (cidade ?? usina)?.y ?? altura / 2;

  const topo = Math.round(alvo - alturaDoRecorte / 2);
  // Não adianta enquadrar fora da grade: o recorte é preso aos limites dela.
  return Math.max(0, Math.min(altura - alturaDoRecorte, topo));
}

/**
 * Monta a imagem de compartilhamento e a entrega em um canvas de 1200x630.
 *
 * A simulação usada aqui é criada só para isto e não tem relação nenhuma com a
 * da página: o modo de captura não interfere em nada que esteja rodando.
 */
export function gerarImagemDeCompartilhamento(opcoes: OpcoesCaptura): HTMLCanvasElement {
  const { largura, altura, semente } = opcoes;

  const parametros = criarParametrosCenario();
  const simulacao = new Simulacao({
    largura,
    altura,
    semente: sementeDeTexto(semente),
    regra: criarRegraCenario(parametros),
    vizinhanca: 'moore',
    raio: 1,
    contorno: 'fixo',
  });

  const usos = aplicarMapa(simulacao, 'cidade');

  parametros.fase = 'acidente';
  for (let geracao = 0; geracao < GERACOES_DE_VAZAMENTO; geracao++) simulacao.passo();

  // O renderizador precisa de um canvas, mas este nunca entra na página: serve
  // apenas para ele montar o canvas auxiliar de uma célula por pixel.
  const canvasDeTrabalho = document.createElement('canvas');
  const renderizador = new Renderizador(canvasDeTrabalho, largura, altura);
  renderizador.desenhar(simulacao.grade, usos);

  const larguraDoRecorte = Math.min(largura, Math.round(LARGURA_OG / ESCALA));
  const alturaDoRecorte = Math.min(altura, Math.round(ALTURA_OG / ESCALA));
  const topo = faixaVertical(usos, largura, altura, alturaDoRecorte);
  const esquerda = Math.max(0, Math.round((largura - larguraDoRecorte) / 2));

  const destino = document.createElement('canvas');
  destino.width = LARGURA_OG;
  destino.height = ALTURA_OG;
  renderizador.recortarPara(destino, esquerda, topo, larguraDoRecorte, alturaDoRecorte);

  return destino;
}

/** Converte o canvas em PNG e dispara o download. */
function salvar(canvas: HTMLCanvasElement): void {
  canvas.toBlob((blob) => {
    if (blob !== null) baixarArquivo('og-image.png', blob);
  }, 'image/png');
}

/**
 * Executa o modo de captura: substitui a página por uma tela com a prévia da
 * imagem e baixa o arquivo.
 *
 * O botão existe porque alguns navegadores bloqueiam downloads que começam sem
 * um clique do usuário. A tentativa automática cobre o caso comum; o botão
 * garante o resto — e a prévia deixa conferir o enquadramento antes de salvar.
 */
export function executarCaptura(opcoes: OpcoesCaptura): void {
  document.body.replaceChildren();
  document.body.classList.add('modo-captura');

  const aviso = document.createElement('p');
  aviso.className = 'captura-aviso';
  aviso.textContent = `Gerando a imagem de compartilhamento (${GERACOES_DE_VAZAMENTO} gerações de vazamento)…`;
  document.body.append(aviso);

  // Um quadro de espera antes do trabalho pesado, para o aviso aparecer na tela
  // em vez de ficar preso atrás do laço de gerações.
  requestAnimationFrame(() => {
    const imagem = gerarImagemDeCompartilhamento(opcoes);
    imagem.className = 'captura-previa';

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'primario';
    botao.textContent = '⤓ Baixar og-image.png';
    botao.addEventListener('click', () => salvar(imagem));

    const instrucao = document.createElement('p');
    instrucao.className = 'captura-aviso';
    instrucao.textContent = `${LARGURA_OG}x${ALTURA_OG} — salve o arquivo em public/og-image.png`;

    aviso.replaceWith(imagem);
    document.body.append(instrucao, botao);

    salvar(imagem);
  });
}
