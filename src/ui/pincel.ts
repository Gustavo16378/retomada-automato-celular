import type { PosicaoCelula } from '../render';

export interface OpcoesPincel {
  canvas: HTMLCanvasElement;
  /** Converte a posição do ponteiro em célula (fornecida pelo renderizador). */
  localizar: (clienteX: number, clienteY: number) => PosicaoCelula | null;
  /** Pinta uma célula. `apagar` é verdadeiro quando o gesto é de apagar. */
  pintar: (x: number, y: number, apagar: boolean) => void;
}

/**
 * Desenho direto na grade com o ponteiro.
 *
 * Nesta etapa o pincel tem apenas dois gestos — botão esquerdo pinta, botão
 * direito apaga — o que já basta para montar um planador à mão e acompanhá-lo
 * passo a passo. A seleção de qual estado pintar entra na etapa 4, junto com o
 * restante do painel.
 *
 * Usamos eventos de ponteiro (`pointer*`) em vez de eventos de mouse porque eles
 * cobrem mouse, caneta e toque com o mesmo código — a página precisa funcionar
 * no celular.
 */
export function conectarPincel({ canvas, localizar, pintar }: OpcoesPincel): void {
  let desenhando = false;
  let apagando = false;
  let ultima: PosicaoCelula | null = null;

  const pintarEm = (clienteX: number, clienteY: number): void => {
    const celula = localizar(clienteX, clienteY);
    if (celula === null) return;

    // Entre dois eventos consecutivos o ponteiro pode ter percorrido vários
    // pixels. Sem interpolar, um arrasto rápido deixaria buracos no traço.
    if (ultima !== null) {
      const passos = Math.max(Math.abs(celula.x - ultima.x), Math.abs(celula.y - ultima.y));
      for (let i = 1; i < passos; i++) {
        const proporcao = i / passos;
        pintar(
          Math.round(ultima.x + (celula.x - ultima.x) * proporcao),
          Math.round(ultima.y + (celula.y - ultima.y) * proporcao),
          apagando,
        );
      }
    }

    pintar(celula.x, celula.y, apagando);
    ultima = celula;
  };

  canvas.addEventListener('pointerdown', (evento: PointerEvent) => {
    desenhando = true;
    apagando = evento.button === 2;
    ultima = null;
    // A captura garante que o traço continue mesmo se o ponteiro sair do canvas
    // no meio do arrasto.
    canvas.setPointerCapture(evento.pointerId);
    pintarEm(evento.clientX, evento.clientY);
  });

  canvas.addEventListener('pointermove', (evento: PointerEvent) => {
    if (!desenhando) return;
    pintarEm(evento.clientX, evento.clientY);
  });

  const encerrar = (evento: PointerEvent): void => {
    if (!desenhando) return;
    desenhando = false;
    ultima = null;
    if (canvas.hasPointerCapture(evento.pointerId)) {
      canvas.releasePointerCapture(evento.pointerId);
    }
  };

  canvas.addEventListener('pointerup', encerrar);
  canvas.addEventListener('pointercancel', encerrar);

  // Sem isso, o botão direito abriria o menu de contexto em vez de apagar.
  canvas.addEventListener('contextmenu', (evento) => evento.preventDefault());
}
