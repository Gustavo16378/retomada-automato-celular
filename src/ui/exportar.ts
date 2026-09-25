/**
 * Download de arquivos gerados na própria página.
 *
 * Tudo aqui é conversa com o navegador: quem PRODUZ o conteúdo é a engine
 * (`montarCsv`) ou o renderizador (`paraPng`). Esta separação é o que permite
 * testar o CSV sem navegador nenhum.
 */

/**
 * Dispara o download de um blob.
 *
 * O caminho é sempre o mesmo: transformar o blob em uma URL temporária, criar um
 * link invisível apontando para ela, clicar nele por código e desfazer tudo.
 * Parece indireto, mas é a única forma de salvar um arquivo sem servidor.
 */
function baixar(nomeDoArquivo: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeDoArquivo;

  /*
   * O link precisa estar NA PÁGINA para o clique valer em todos os navegadores,
   * e some logo depois.
   */
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();

  /*
   * A URL temporária tem que ser liberada, senão o blob fica preso na memória
   * até a página fechar e cada exportação deixa uma cópia para trás. Mas NÃO
   * pode ser liberada na mesma volta do laço de eventos: o download ainda não
   * começou a ler o blob, e revogar antes disso cancela o arquivo em silêncio —
   * o botão parece funcionar e nada é salvo. O `setTimeout` adia a liberação
   * para depois de o navegador ter assumido o download.
   */
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Baixa um texto como arquivo. */
export function baixarTexto(nomeDoArquivo: string, conteudo: string, tipo: string): void {
  // O BOM (﻿) faz o Excel reconhecer o arquivo como UTF-8; sem ele, os
  // acentos dos cabeçalhos aparecem corrompidos na planilha.
  baixar(nomeDoArquivo, new Blob([`﻿${conteudo}`], { type: `${tipo};charset=utf-8` }));
}

/** Baixa um blob binário, como a imagem exportada do canvas. */
export function baixarArquivo(nomeDoArquivo: string, blob: Blob): void {
  baixar(nomeDoArquivo, blob);
}

/**
 * Monta um nome de arquivo que identifica o experimento.
 *
 * Leva a semente e a geração porque um arquivo de resultado só serve ao relatório
 * se der para reproduzir de onde ele veio: com esses dois valores, qualquer
 * execução pode ser refeita exatamente igual.
 */
export function nomeDoExperimento(
  prefixo: string,
  semente: string,
  geracao: number,
  extensao: string,
): string {
  const sementeLimpa = semente.trim().replace(/[^\w-]+/g, '-') || 'sem-semente';
  return `retomada-${prefixo}-${sementeLimpa}-g${geracao}.${extensao}`;
}
