/** Parâmetros do laço de animação. */
export interface OpcoesLaco {
  /** Avança uma geração. */
  aoPassar: () => void;
  /** Redesenha a tela. Chamado no máximo uma vez por quadro. */
  aoDesenhar: () => void;
  /** Gerações por segundo desejadas. */
  velocidade: number;
}

export interface Laco {
  readonly rodando: boolean;
  iniciar(): void;
  parar(): void;
  alternar(): void;
  definirVelocidade(geracoesPorSegundo: number): void;
}

/**
 * Teto de gerações calculadas em um mesmo quadro.
 *
 * Protege contra a "espiral da morte": se a aba ficar em segundo plano por 30
 * segundos, o navegador pausa a animação e, na volta, o tempo acumulado pediria
 * centenas de gerações de uma vez — travando a página. Preferimos perder
 * gerações a travar.
 */
const MAXIMO_PASSOS_POR_QUADRO = 8;

/**
 * Laço de animação com acumulador de tempo.
 *
 * Por que não `setInterval`? Porque ele não se alinha com o ciclo de desenho do
 * navegador: o resultado é animação trêmula e gerações calculadas em quadros que
 * nunca chegam a ser exibidos. Com `requestAnimationFrame` desenhamos uma vez
 * por quadro, e o acumulador decide quantas gerações cabem nesse intervalo —
 * assim a velocidade em gerações por segundo é respeitada tanto em uma tela de
 * 60 Hz quanto em uma de 144 Hz.
 */
export function criarLaco(opcoes: OpcoesLaco): Laco {
  let rodando = false;
  let identificadorQuadro = 0;
  let instanteAnterior = 0;
  let acumulado = 0;
  let intervalo = 1000 / opcoes.velocidade;

  const quadro = (instante: number): void => {
    if (!rodando) return;

    // No primeiro quadro não há intervalo anterior para medir.
    const decorrido = instanteAnterior === 0 ? 0 : instante - instanteAnterior;
    instanteAnterior = instante;
    acumulado += decorrido;

    let passos = 0;
    while (acumulado >= intervalo && passos < MAXIMO_PASSOS_POR_QUADRO) {
      opcoes.aoPassar();
      acumulado -= intervalo;
      passos++;
    }

    // Se o teto foi atingido, descartamos o tempo restante em vez de deixá-lo
    // acumular para o próximo quadro.
    if (passos === MAXIMO_PASSOS_POR_QUADRO) acumulado = 0;

    // Desenhar só quando algo mudou poupa trabalho em velocidades baixas
    // (a 1 geração por segundo, 59 dos 60 quadros não teriam nada de novo).
    if (passos > 0) opcoes.aoDesenhar();

    identificadorQuadro = requestAnimationFrame(quadro);
  };

  return {
    get rodando() {
      return rodando;
    },

    iniciar(): void {
      if (rodando) return;
      rodando = true;
      instanteAnterior = 0;
      acumulado = 0;
      identificadorQuadro = requestAnimationFrame(quadro);
    },

    parar(): void {
      if (!rodando) return;
      rodando = false;
      cancelAnimationFrame(identificadorQuadro);
    },

    alternar(): void {
      if (rodando) this.parar();
      else this.iniciar();
    },

    definirVelocidade(geracoesPorSegundo: number): void {
      intervalo = 1000 / Math.max(1, geracoesPorSegundo);
      // Zerar o acumulado evita uma rajada de gerações logo após aumentar muito
      // a velocidade.
      acumulado = 0;
    },
  };
}
