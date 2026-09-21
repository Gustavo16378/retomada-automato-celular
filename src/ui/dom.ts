/**
 * Auxiliares mínimos de acesso ao DOM.
 *
 * O objetivo é concentrar em um lugar só as conversões de tipo que o
 * `getElementById` exige. Como ele devolve `HTMLElement | null`, sem um
 * auxiliar assim cada uso viraria uma checagem de nulo repetida — ou, pior, um
 * `as` espalhado pelo código, que silenciaria erros de digitação nos ids.
 */

/**
 * Busca um elemento obrigatório pelo id e falha alto se ele não existir.
 *
 * Falhar na inicialização é melhor do que descobrir mais tarde, por um botão que
 * simplesmente não responde, que o id do HTML e o do TypeScript se desencontraram.
 */
export function elemento<T extends HTMLElement = HTMLElement>(id: string): T {
  const encontrado = document.getElementById(id);
  if (encontrado === null) {
    throw new Error(`Elemento "#${id}" não encontrado no HTML.`);
  }
  return encontrado as T;
}

/** Atalho para elementos de formulário (input, select). */
export function campo<T extends HTMLElement = HTMLInputElement>(id: string): T {
  return elemento<T>(id);
}

/** Escreve texto em um elemento, sem passar por `innerHTML`. */
export function definirTexto(alvo: HTMLElement, texto: string): void {
  alvo.textContent = texto;
}

/** Formata um número com casas decimais fixas, no padrão brasileiro (vírgula). */
export function formatarNumero(valor: number, casas = 1): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}
