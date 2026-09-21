import { Estado } from './estados';
import { MORTA, VIVA } from './regras';
import type { Simulacao } from './simulacao';
import { criarCamadaDeUso, Uso, VARIANTES_DE_CASA, type CamadaDeUso } from './uso';

/**
 * Mapas iniciais (condições iniciais do autômato).
 *
 * Todos reiniciam a simulação antes de desenhar, para que a geração volte a
 * zero, o histórico seja descartado e o gerador pseudoaleatório recomece do
 * início da sequência. Sem isso, carregar o mesmo mapa duas vezes com a mesma
 * semente poderia dar resultados diferentes.
 */
export type IdMapa = 'cidade' | 'vazio' | 'glider' | 'aleatorio';

export const NOME_MAPA: Readonly<Record<IdMapa, string>> = {
  cidade: 'Cidade e usina',
  vazio: 'Vazio',
  glider: 'Planador (glider)',
  aleatorio: 'Sopa aleatória',
};

/**
 * Planador do Jogo da Vida, na orientação que se desloca para sudeste
 * (+1 coluna, +1 linha a cada 4 gerações).
 *
 * Escrito como desenho em texto porque é assim que ele aparece na literatura —
 * quem lê o código compara direto com a figura do relatório. `X` é célula viva.
 */
export const PADRAO_PLANADOR: readonly string[] = [
  '.X.',
  '..X',
  'XXX',
];

/** Densidade padrão da sopa aleatória: proporção de células vivas no início. */
export const DENSIDADE_PADRAO = 0.3;

/** Limpa a grade inteira (por padrão, com solo limpo). */
export function limpar(sim: Simulacao, estado: Estado = Estado.SOLO): void {
  sim.preencher(estado);
}

/**
 * Desenha um padrão em texto na grade, com o canto superior esquerdo em (x0, y0).
 *
 * `.` deixa a célula como está, em vez de apagá-la: assim dá para carimbar vários
 * padrões sobrepostos sem que um apague o outro.
 */
export function desenharPadrao(
  sim: Simulacao,
  padrao: readonly string[],
  x0: number,
  y0: number,
  estadoVivo: Estado = VIVA,
): void {
  for (let linha = 0; linha < padrao.length; linha++) {
    const texto = padrao[linha]!;
    for (let coluna = 0; coluna < texto.length; coluna++) {
      if (texto[coluna] === 'X') {
        sim.definirCelula(x0 + coluna, y0 + linha, estadoVivo);
      }
    }
  }
}

/** Preenche a grade com células vivas sorteadas — a "sopa" clássica do Jogo da Vida. */
export function sopaAleatoria(sim: Simulacao, densidade: number = DENSIDADE_PADRAO): void {
  for (let y = 0; y < sim.altura; y++) {
    for (let x = 0; x < sim.largura; x++) {
      // O sorteio é feito para TODA célula (e não só para as que virarão vivas)
      // de propósito: assim a quantidade de números consumidos do gerador
      // depende apenas do tamanho da grade, e a sequência fica previsível.
      sim.definirCelula(x, y, sim.rng.sorteio(densidade) ? VIVA : MORTA);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Suavização: um autômato celular para gerar o terreno do autômato           */
/* -------------------------------------------------------------------------- */

/**
 * Regra de maioria sobre ruído — o gerador procedural clássico de cavernas.
 *
 * Aqui há uma simetria que vale registrar no relatório: **usamos um autômato
 * celular para gerar o terreno do nosso autômato celular**. A regra é a mais
 * simples possível: cada célula passa a valer o que a MAIORIA da sua vizinhança
 * de Moore (mais ela mesma) já vale. Repetida poucas vezes sobre ruído puro, ela
 * apaga os pixels soltos e faz emergirem manchas de contorno orgânico — que é
 * exatamente o que distingue uma floresta de um chuvisco de televisão.
 *
 * O número de iterações controla o resultado: 1 ou 2 ainda deixam textura
 * granulada; 4 ou 5 dão formas limpas e arredondadas; acima disso as manchas
 * começam a desaparecer, engolidas pela maioria.
 *
 * @param mascara vetor de 0/1, modificado fora daqui (recebe uma cópia nova).
 * @param foraVale valor atribuído ao que está fora da grade. Com 1, as bordas do
 *   mapa tendem a fechar — é o que mantém a floresta encostada na moldura, o que
 *   importa porque a vegetação só brota ao lado de vegetação.
 */
export function suavizar(
  mascara: Uint8Array,
  largura: number,
  altura: number,
  iteracoes: number,
  foraVale: 0 | 1 = 1,
): Uint8Array {
  // Os dois precisam do mesmo tipo declarado para poderem trocar de papel logo
  // abaixo; sem a anotação, o TypeScript infere tipos de buffer incompatíveis.
  let atual: Uint8Array = mascara;
  let proxima: Uint8Array = new Uint8Array(mascara.length);

  for (let passo = 0; passo < iteracoes; passo++) {
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        let vizinhos = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const vx = x + dx;
            const vy = y + dy;
            const dentro = vx >= 0 && vy >= 0 && vx < largura && vy < altura;
            vizinhos += dentro ? atual[vy * largura + vx]! : foraVale;
          }
        }
        // O laço acima inclui a própria célula, então são 9 votos: a maioria é 5.
        proxima[y * largura + x] = vizinhos >= 5 ? 1 : 0;
      }
    }
    // Mesmo double buffering da simulação: a maioria precisa ser calculada sobre
    // a configuração ANTERIOR, e não sobre uma meio atualizada.
    const troca = atual;
    atual = proxima;
    proxima = troca;
  }

  return atual;
}

/** Conta vizinhos de Moore que valem 1 (sem incluir a própria célula). */
function contarVizinhos(
  mascara: Uint8Array,
  largura: number,
  altura: number,
  x: number,
  y: number,
): number {
  let total = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const vx = x + dx;
      const vy = y + dy;
      if (vx < 0 || vy < 0 || vx >= largura || vy >= altura) {
        total++; // fora da grade conta como mata, coerente com `suavizar`
      } else {
        total += mascara[vy * largura + vx]!;
      }
    }
  }
  return total;
}

/* -------------------------------------------------------------------------- */
/* Mapa "Cidade e usina", gerado proceduralmente                              */
/* -------------------------------------------------------------------------- */

/** Ajustes do gerador. Os padrões foram escolhidos para a grade 200x125. */
export interface OpcoesCidade {
  /** Proporção inicial de mata no ruído, antes da suavização. */
  densidadeFloresta: number;
  /** Iterações da regra de maioria na floresta. */
  suavizacoesFloresta: number;
  /** Iterações da regra de maioria na silhueta da cidade. */
  suavizacoesCidade: number;
  /** Fração da largura do mapa que o raio da cidade ocupa. */
  raioDaCidade: number;
  larguraQuarteirao: number;
  alturaQuarteirao: number;
  /** Largura das ruas, que são concreto entre os quarteirões. */
  larguraRua: number;
  /** Chance de um quarteirão central virar um prédio grande. */
  probPredio: number;
  /** Lado do bloco da usina, em células. */
  ladoDaUsina: number;
}

export const OPCOES_CIDADE_PADRAO: Readonly<OpcoesCidade> = Object.freeze({
  densidadeFloresta: 0.56,
  suavizacoesFloresta: 4,
  suavizacoesCidade: 3,
  raioDaCidade: 0.3,
  larguraQuarteirao: 9,
  alturaQuarteirao: 7,
  larguraRua: 2,
  probPredio: 0.55,
  ladoDaUsina: 5,
});

/** Retângulo em coordenadas da grade. */
interface Retangulo {
  readonly x: number;
  readonly y: number;
  readonly largura: number;
  readonly altura: number;
}

/** Ruído binário do tamanho da grade, com a densidade pedida. */
function ruidoBinario(sim: Simulacao, densidade: number): Uint8Array {
  const ruido = new Uint8Array(sim.totalCelulas);
  for (let i = 0; i < ruido.length; i++) {
    ruido[i] = sim.rng.sorteio(densidade) ? 1 : 0;
  }
  return ruido;
}

/**
 * Desenha a floresta que cobre o mapa, com clareiras de solo exposto.
 *
 * São TRÊS máscaras independentes, cada uma suavizada pelo mesmo autômato de
 * maioria, e sobrepostas como camadas:
 *
 *   1. `mata` decide onde há vegetação e onde ficam as clareiras;
 *   2. `lenhoso` decide onde a mata passa de grama a arbusto;
 *   3. `arvores` decide onde o arbusto vira árvore.
 *
 * Por que três máscaras em vez de sortear o tipo célula a célula? Porque o
 * sorteio direto produziria os três verdes MISTURADOS, pixel a pixel — o mesmo
 * chuvisco que a suavização existe para evitar. Com camadas suavizadas, cada
 * tipo forma manchas contínuas, e as manchas mais maduras aparecem aninhadas
 * dentro das menos maduras, como num bosque de verdade.
 *
 * Por cima disso, a densidade local tem a última palavra na ORLA: onde a mata é
 * rala, só nasce grama. É o que dá a cada mancha uma franja clara antes do solo.
 */
function gerarFloresta(sim: Simulacao, opcoes: OpcoesCidade): void {
  const { largura, altura } = sim;

  const mata = suavizar(
    ruidoBinario(sim, opcoes.densidadeFloresta),
    largura,
    altura,
    opcoes.suavizacoesFloresta,
  );
  const lenhoso = suavizar(ruidoBinario(sim, 0.52), largura, altura, 4, 0);
  const arvores = suavizar(ruidoBinario(sim, 0.46), largura, altura, 5, 0);

  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      if (mata[i] === 0) continue; // clareira: fica solo exposto

      const vizinhos = contarVizinhos(mata, largura, altura, x, y);
      let estado: Estado;
      if (vizinhos <= 4) {
        estado = Estado.GRAMA; // orla da mancha
      } else if (lenhoso[i] === 0) {
        estado = Estado.GRAMA;
      } else if (arvores[i] === 0 || vizinhos <= 6) {
        estado = Estado.ARBUSTO;
      } else {
        estado = Estado.ARVORE;
      }
      sim.definirCelula(x, y, estado);
    }
  }
}

/**
 * Silhueta irregular da cidade.
 *
 * Um retângulo perfeito denunciaria o gerador. A solução reaproveita a mesma
 * suavização da floresta, só que sobre um ruído ENVIESADO PELA DISTÂNCIA de um
 * centro: perto do centro quase todo mundo é cidade, longe quase ninguém, e a
 * maioria transforma essa nuvem de probabilidade em uma mancha fechada de
 * contorno irregular.
 */
function gerarSilhuetaDaCidade(sim: Simulacao, opcoes: OpcoesCidade): Uint8Array {
  const { largura, altura } = sim;
  // O centro é sorteado dentro do terço central para a cidade nunca nascer
  // colada na moldura do mapa.
  const centroX = largura * (0.35 + sim.rng.proximo() * 0.3);
  const centroY = altura * (0.35 + sim.rng.proximo() * 0.3);
  const raio = largura * opcoes.raioDaCidade;

  const ruido = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const distancia = Math.hypot(x - centroX, y - centroY) / raio;
      // Probabilidade alta no miolo, caindo até zero na borda do raio.
      const chance = 1 - distancia * distancia;
      ruido[y * largura + x] = sim.rng.sorteio(chance) ? 1 : 0;
    }
  }

  // `foraVale = 0`: fora do mapa NÃO é cidade, senão a mancha grudaria na borda.
  return suavizar(ruido, largura, altura, opcoes.suavizacoesCidade, 0);
}

/** Verdadeiro se todo o retângulo está dentro da silhueta da cidade. */
function retanguloNaCidade(
  silhueta: Uint8Array,
  largura: number,
  r: Retangulo,
): boolean {
  for (let y = r.y; y < r.y + r.altura; y++) {
    for (let x = r.x; x < r.x + r.largura; x++) {
      if (silhueta[y * largura + x] === 0) return false;
    }
  }
  return true;
}

function preencher(
  sim: Simulacao,
  usos: CamadaDeUso,
  r: Retangulo,
  estado: Estado,
  uso: Uso,
): void {
  for (let y = r.y; y < r.y + r.altura; y++) {
    for (let x = r.x; x < r.x + r.largura; x++) {
      sim.definirCelula(x, y, estado);
      usos[y * sim.largura + x] = uso;
    }
  }
}

/**
 * Preenche um quarteirão com casinhas e quintais.
 *
 * As casas têm de 2x2 a 3x3 e ficam separadas por pelo menos uma célula de
 * quintal, que é grama. O quintal importa para a simulação, e não só para a
 * aparência: é vegetação viva dentro da cidade, então é dali que a mata vai
 * começar a rachar o concreto depois da evacuação.
 */
function preencherQuarteiraoResidencial(
  sim: Simulacao,
  usos: CamadaDeUso,
  quarteirao: Retangulo,
): void {
  // O quarteirão inteiro vira quintal, e as casas são carimbadas por cima.
  preencher(sim, usos, quarteirao, Estado.GRAMA, Uso.NATUREZA);

  for (let y = quarteirao.y; y < quarteirao.y + quarteirao.altura - 1; ) {
    let alturaDaCasa = 2;
    for (let x = quarteirao.x; x < quarteirao.x + quarteirao.largura - 1; ) {
      const lado = 2 + sim.rng.inteiro(2); // 2 ou 3
      alturaDaCasa = Math.max(alturaDaCasa, lado);
      const cabe =
        x + lado <= quarteirao.x + quarteirao.largura &&
        y + lado <= quarteirao.y + quarteirao.altura;

      if (cabe && sim.rng.sorteio(0.8)) {
        const telhado = VARIANTES_DE_CASA[sim.rng.inteiro(VARIANTES_DE_CASA.length)]!;
        preencher(sim, usos, { x, y, largura: lado, altura: lado }, Estado.CONCRETO, telhado);
      }
      x += lado + 1; // +1 de quintal entre as casas
    }
    y += alturaDaCasa + 1;
  }
}

/**
 * Desenha uma cidade vista de cima e devolve a camada de uso do solo.
 *
 * A ordem importa: floresta primeiro, cidade por cima. É a ordem da história que
 * o mapa conta — a mata já estava lá, e a cidade foi construída sobre ela.
 *
 * A usina vai no quarteirão mais PERIFÉRICO da silhueta, como manda a prática
 * (e como convém à simulação): assim o vazamento pega a cidade de um lado e a
 * floresta do outro, em vez de nascer no meio de tudo.
 */
export function gerarCidade(sim: Simulacao, ajustes: Partial<OpcoesCidade> = {}): CamadaDeUso {
  const opcoes: OpcoesCidade = { ...OPCOES_CIDADE_PADRAO, ...ajustes };
  const usos = criarCamadaDeUso(sim.totalCelulas);

  gerarFloresta(sim, opcoes);
  const silhueta = gerarSilhuetaDaCidade(sim, opcoes);

  /*
   * 1. Toda a silhueta vira rua; os quarteirões são carimbados por cima. É mais
   *    simples do que desenhar as ruas uma a uma, e o que sobra entre os
   *    quarteirões já é exatamente a malha viária.
   *
   *    A rua é asfalto sobre TERRA, e por isso o estado dela é `SOLO` e não
   *    `CONCRETO`. A diferença é decisiva para a simulação: o concreto é
   *    impermeável (regra 5), então uma cidade toda de concreto seria uma ilha
   *    imune no meio da contaminação, com os quintais lacrados por todos os
   *    lados. Com a malha viária permeável, a contaminação entra na cidade pelas
   *    ruas — que é exatamente por onde ela entraria. O cinza do asfalto vem da
   *    camada de uso, não do estado.
   */
  for (let y = 0; y < sim.altura; y++) {
    for (let x = 0; x < sim.largura; x++) {
      if (silhueta[y * sim.largura + x] === 0) continue;
      sim.definirCelula(x, y, Estado.SOLO);
      usos[y * sim.largura + x] = Uso.RUA;
    }
  }

  // 2. Quarteirões: só os que cabem inteiros dentro da silhueta, para que a
  //    borda irregular da cidade fique com ruas em vez de meio-quarteirões.
  const passoX = opcoes.larguraQuarteirao + opcoes.larguraRua;
  const passoY = opcoes.alturaQuarteirao + opcoes.larguraRua;
  const quarteiroes: Retangulo[] = [];

  for (let y = 1; y + opcoes.alturaQuarteirao < sim.altura; y += passoY) {
    for (let x = 1; x + opcoes.larguraQuarteirao < sim.largura; x += passoX) {
      const quarteirao: Retangulo = {
        x,
        y,
        largura: opcoes.larguraQuarteirao,
        altura: opcoes.alturaQuarteirao,
      };
      if (retanguloNaCidade(silhueta, sim.largura, quarteirao)) quarteiroes.push(quarteirao);
    }
  }

  if (quarteiroes.length === 0) return usos;

  // 3. Centro de massa dos quarteirões: os de dentro viram prédios, os de fora,
  //    casas. É o gradiente de qualquer cidade — torres no meio, casario em volta.
  let somaX = 0;
  let somaY = 0;
  for (const q of quarteiroes) {
    somaX += q.x + q.largura / 2;
    somaY += q.y + q.altura / 2;
  }
  const centroX = somaX / quarteiroes.length;
  const centroY = somaY / quarteiroes.length;

  const distanciaAoCentro = (q: Retangulo): number =>
    Math.hypot(q.x + q.largura / 2 - centroX, q.y + q.altura / 2 - centroY);

  const distancias = quarteiroes.map(distanciaAoCentro);
  const maiorDistancia = Math.max(...distancias);

  // 4. A usina ocupa o quarteirão mais distante do centro.
  const indiceDaUsina = distancias.indexOf(maiorDistancia);
  const quarteiraoDaUsina = quarteiroes[indiceDaUsina]!;

  for (let i = 0; i < quarteiroes.length; i++) {
    if (i === indiceDaUsina) continue;
    const quarteirao = quarteiroes[i]!;
    const proximidade = 1 - distancias[i]! / (maiorDistancia || 1);

    if (proximidade > 0.45 && sim.rng.sorteio(opcoes.probPredio)) {
      preencher(sim, usos, quarteirao, Estado.CONCRETO, Uso.PREDIO);
    } else {
      preencherQuarteiraoResidencial(sim, usos, quarteirao);
    }
  }

  // 5. A usina, centralizada no quarteirão escolhido.
  const lado = opcoes.ladoDaUsina;
  preencher(
    sim,
    usos,
    {
      x: quarteiraoDaUsina.x + Math.floor((quarteiraoDaUsina.largura - lado) / 2),
      y: quarteiraoDaUsina.y + Math.floor((quarteiraoDaUsina.altura - lado) / 2),
      largura: lado,
      altura: lado,
    },
    Estado.USINA,
    Uso.USINA,
  );

  return usos;
}

/**
 * Carrega um mapa inicial e devolve a camada de uso do solo correspondente.
 *
 * É o único ponto que a interface precisa conhecer. A camada devolvida serve
 * apenas ao renderizador — ver `uso.ts` para o porquê de ela não entrar na
 * simulação.
 *
 * @param semente se informada, troca a semente antes de desenhar.
 */
export function aplicarMapa(sim: Simulacao, id: IdMapa, semente?: number): CamadaDeUso {
  sim.reiniciar(semente);

  switch (id) {
    case 'cidade':
      return gerarCidade(sim);

    case 'glider':
      // Posicionado perto do canto superior esquerdo para que a viagem em
      // diagonal atravesse a maior parte da grade antes de dar a volta.
      desenharPadrao(sim, PADRAO_PLANADOR, 2, 2);
      break;

    case 'aleatorio':
      sopaAleatoria(sim);
      break;

    case 'vazio':
      // `reiniciar` já deixou tudo como solo limpo.
      break;
  }

  return criarCamadaDeUso(sim.totalCelulas);
}
