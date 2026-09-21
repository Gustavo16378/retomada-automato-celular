/**
 * Calibração do cenário da cidade, sem interface.
 *
 * Roda a simulação em modo texto e imprime os indicadores a cada N gerações. É
 * com ele que os valores de `PARAMETROS_CIDADE_PADRAO` foram ajustados até bater
 * os alvos do enunciado:
 *
 *   - a contaminação precisa se espalhar VISIVELMENTE nas primeiras ~30 gerações;
 *   - depois de abandonar a cidade, a recuperação precisa acontecer em ~100 a
 *     200 gerações.
 *
 * Rodar com `npm run calibrar`. Aceita ajustes pela linha de comando, no formato
 * `chave=valor`, para comparar cenários sem editar o código:
 *
 *   npm run calibrar -- geracoes=600 abandono=150 vento=norte limiarSubida=0.3
 *
 * Este arquivo é a prova prática de que a engine não depende do navegador: a
 * mesma simulação que roda no canvas roda aqui, no Node, sem nenhuma adaptação.
 */
import {
  aplicarMapa,
  criarParametrosCidade,
  criarRegraCidade,
  Estado,
  sementeDeTexto,
  Simulacao,
  type Estatisticas,
  type ParametrosCidade,
  type Vento,
} from '../src/engine/index';

/* -------------------------------------------------------------------------- */
/* Argumentos                                                                  */
/* -------------------------------------------------------------------------- */

const argumentos = new Map<string, string>();
for (const bruto of process.argv.slice(2)) {
  const separador = bruto.indexOf('=');
  if (separador > 0) argumentos.set(bruto.slice(0, separador), bruto.slice(separador + 1));
}

const numero = (chave: string, padrao: number): number => {
  const valor = argumentos.get(chave);
  return valor === undefined ? padrao : Number(valor);
};

const LARGURA = numero('largura', 160);
const ALTURA = numero('altura', 100);
const GERACOES = numero('geracoes', 400);
const GERACAO_DO_ABANDONO = numero('abandono', 100);
const INTERVALO = numero('intervalo', 10);
const SEMENTE = argumentos.get('semente') ?? 'retomada';

// Qualquer parâmetro do cenário pode ser sobrescrito pela linha de comando.
const parametros: ParametrosCidade = criarParametrosCidade();
for (const [chave, valor] of argumentos) {
  if (chave === 'vento') {
    parametros.vento = valor as Vento;
  } else if (chave in parametros) {
    const destino = parametros as unknown as Record<string, number>;
    if (typeof destino[chave] === 'number') destino[chave] = Number(valor);
  }
}

/* -------------------------------------------------------------------------- */
/* Simulação                                                                   */
/* -------------------------------------------------------------------------- */

const simulacao = new Simulacao({
  largura: LARGURA,
  altura: ALTURA,
  semente: sementeDeTexto(SEMENTE),
  regra: criarRegraCidade(parametros),
  vizinhanca: 'moore',
  raio: 1,
  contorno: 'fixo',
});

aplicarMapa(simulacao, 'cidade');

const porcentagem = (valor: number): string => valor.toFixed(1).padStart(6);
const inteiro = (valor: number): string => String(valor).padStart(5);

function linha(estatisticas: Estatisticas, marcador: string): string {
  const contagem = estatisticas.contagem;
  const grave = contagem[Estado.CONTAMINADO_GRAVE]!;
  const fabricas = contagem[Estado.FABRICA]!;
  return [
    inteiro(estatisticas.geracao),
    porcentagem(estatisticas.percentualContaminado),
    porcentagem(estatisticas.percentualVegetacao),
    porcentagem(estatisticas.percentualConcreto),
    porcentagem((grave / estatisticas.total) * 100),
    inteiro(fabricas),
    marcador,
  ].join(' | ');
}

console.log(`\nCenário cidade — ${LARGURA}x${ALTURA}, semente "${SEMENTE}", contorno fixo`);
console.log(
  `Abandono na geração ${GERACAO_DO_ABANDONO}, total de ${GERACOES} gerações, vento: ${parametros.vento}\n`,
);
console.log('  ger |  contam |   veget | concreto |   grave | fábr. |');
console.log('------+---------+---------+----------+---------+-------+---------');
console.log(linha(simulacao.estatisticas(), 'início'));

let pico = 0;
let geracaoDoPico = 0;

for (let g = 1; g <= GERACOES; g++) {
  if (g === GERACAO_DO_ABANDONO) parametros.cidadeAbandonada = true;

  const estatisticas = simulacao.passo();

  if (estatisticas.percentualContaminado > pico) {
    pico = estatisticas.percentualContaminado;
    geracaoDoPico = g;
  }

  if (g % INTERVALO === 0) {
    const marcador = g === GERACAO_DO_ABANDONO ? '<-- cidade abandonada' : '';
    console.log(linha(estatisticas, marcador));
  }
}

/* -------------------------------------------------------------------------- */
/* Conferência dos alvos                                                       */
/* -------------------------------------------------------------------------- */

const historico = simulacao.historico;
const em = (geracao: number): Estatisticas =>
  historico[Math.min(geracao, historico.length - 1)]!;

const contaminacaoNoAbandono = em(GERACAO_DO_ABANDONO).percentualContaminado;
const alvoRecuperacao = contaminacaoNoAbandono * 0.1;
const geracaoRecuperada = historico.findIndex(
  (e) => e.geracao > GERACAO_DO_ABANDONO && e.percentualContaminado <= alvoRecuperacao,
);

console.log('\nAlvos do enunciado');
console.log(`  contaminação na geração  30: ${em(30).percentualContaminado.toFixed(1)} %`);
console.log(`  contaminação no abandono   : ${contaminacaoNoAbandono.toFixed(1)} %`);
console.log(`  pico de contaminação       : ${pico.toFixed(1)} % (geração ${geracaoDoPico})`);
console.log(
  geracaoRecuperada < 0
    ? `  90 % da contaminação removida: NÃO alcançado em ${GERACOES} gerações`
    : `  90 % da contaminação removida: geração ${geracaoRecuperada}` +
        ` (${geracaoRecuperada - GERACAO_DO_ABANDONO} gerações após o abandono)`,
);
console.log(
  `  vegetação: ${em(GERACAO_DO_ABANDONO).percentualVegetacao.toFixed(1)} % no abandono` +
    ` -> ${em(GERACOES).percentualVegetacao.toFixed(1)} % no fim`,
);
console.log(
  `  concreto : ${em(GERACAO_DO_ABANDONO).percentualConcreto.toFixed(1)} % no abandono` +
    ` -> ${em(GERACOES).percentualConcreto.toFixed(1)} % no fim\n`,
);
