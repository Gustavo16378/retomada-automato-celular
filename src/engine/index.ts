/**
 * Porta de entrada da engine.
 *
 * Todo o resto do projeto (renderizador, interface, testes) importa daqui e
 * nunca de um arquivo interno. Assim a fronteira entre "simulação" e "aplicação"
 * fica explícita: se um dia a engine for extraída para um pacote próprio, esta é
 * exatamente a superfície pública dela.
 *
 * Regra de ouro deste diretório: nenhum arquivo pode tocar em nada do navegador.
 * Isso é verificado automaticamente em `testes/arquitetura.test.ts`.
 */
export * from './estados';
export * from './rng';
export * from './contorno';
export * from './vizinhanca';
export * from './regras';
export * from './uso';
export * from './simulacao';
export * from './mapas';
export * from './csv';
