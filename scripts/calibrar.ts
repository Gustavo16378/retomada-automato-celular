/**
 * Calibração do cenário do acidente nuclear, sem interface.
 *
 * Roda a simulação em modo texto e imprime os indicadores a cada N gerações. É
 * com ele que os valores de `PARAMETROS_PADRAO` foram ajustados até bater os
 * alvos do cenário:
 *
 *   - durante o vazamento, a contaminação precisa avançar sobre boa parte da
 *     cidade e da floresta vizinha;
 *   - fechado o sarcófago, a recuperação precisa levar de 150 a 250 gerações.
 *
 * Rodar com `npm run calibrar`. Aceita ajustes pela linha de comando, no formato
 * `chave=valor`, para comparar cenários sem editar o código:
 *
 *   npm run calibrar -- geracoes=800 acidente=50 sarcofago=120 vento=norte
 *   npm run calibrar -- limiarSubida=0.2 probDecaimento=0.03
 *
 * Este arquivo é a prova prática de que a engine não depende do navegador: a
 * mesma simulação que roda no canvas roda aqui, no Node, sem nenhuma adaptação.
 */
import {
  aplicarMapa,
  criarParametrosCenario,
  criarRegraCenario,
  Estado,
  sementeDeTexto,
  Simulacao,
  type Estatisticas,
  type ParametrosCenario,
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

const LARGURA = numero('largura', 200);
const ALTURA = numero('altura', 125);
const GERACOES = numero('geracoes', 500);
const GERACAO_DO_ACIDENTE = numero('acidente', 100);
const GERACAO_DO_SARCOFAGO = numero('sarcofago', 160);
const INTERVALO = numero('intervalo', 20);
const SEMENTE = argumentos.get('semente') ?? 'retomada';

// Qualquer parâmetro do cenário pode ser sobrescrito pela linha de comando.
const parametros: ParametrosCenario = criarParametrosCenario();
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
  regra: criarRegraCenario(parametros),
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
  return [
    inteiro(estatisticas.geracao),
    porcentagem(estatisticas.percentualContaminado),
    porcentagem(estatisticas.percentualVegetacao),
    porcentagem(estatisticas.percentualConcreto),
    porcentagem((grave / estatisticas.total) * 100),
    marcador,
  ].join(' | ');
}

console.log(`\nAcidente nuclear — ${LARGURA}x${ALTURA}, semente "${SEMENTE}", contorno fixo`);
console.log(
  `Acidente na geração ${GERACAO_DO_ACIDENTE}, sarcófago na ${GERACAO_DO_SARCOFAGO},` +
    ` total de ${GERACOES} gerações, vento: ${parametros.vento}\n`,
);
console.log('  ger |  contam |   veget | concreto |   grave |');
console.log('------+---------+---------+----------+---------+----------------------');
console.log(linha(simulacao.estatisticas(), 'início'));

let pico = 0;
let geracaoDoPico = 0;

for (let g = 1; g <= GERACOES; g++) {
  if (g === GERACAO_DO_ACIDENTE) parametros.fase = 'acidente';
  if (g === GERACAO_DO_SARCOFAGO) parametros.fase = 'sarcofago';

  const estatisticas = simulacao.passo();

  if (estatisticas.percentualContaminado > pico) {
    pico = estatisticas.percentualContaminado;
    geracaoDoPico = g;
  }

  if (g % INTERVALO === 0 || g === GERACAO_DO_ACIDENTE || g === GERACAO_DO_SARCOFAGO) {
    const marcador =
      g === GERACAO_DO_ACIDENTE
        ? '<-- acidente'
        : g === GERACAO_DO_SARCOFAGO
          ? '<-- sarcófago'
          : '';
    console.log(linha(estatisticas, marcador));
  }
}

/* -------------------------------------------------------------------------- */
/* Conferência dos alvos                                                       */
/* -------------------------------------------------------------------------- */

const historico = simulacao.historico;
const em = (geracao: number): Estatisticas =>
  historico[Math.min(geracao, historico.length - 1)]!;

const noSarcofago = em(GERACAO_DO_SARCOFAGO);
const alvoRecuperacao = noSarcofago.percentualContaminado * 0.1;
const geracaoRecuperada = historico.findIndex(
  (e) => e.geracao > GERACAO_DO_SARCOFAGO && e.percentualContaminado <= alvoRecuperacao,
);

console.log('\nAlvos do cenário');
console.log(
  `  vegetação antes do acidente : ${em(GERACAO_DO_ACIDENTE).percentualVegetacao.toFixed(1)} %`,
);
console.log(`  contaminação no sarcófago   : ${noSarcofago.percentualContaminado.toFixed(1)} %`);
console.log(`  pico de contaminação        : ${pico.toFixed(1)} % (geração ${geracaoDoPico})`);
console.log(
  geracaoRecuperada < 0
    ? `  90 % da contaminação removida: NÃO alcançado em ${GERACOES} gerações`
    : `  90 % da contaminação removida: geração ${geracaoRecuperada}` +
        ` (${geracaoRecuperada - GERACAO_DO_SARCOFAGO} gerações após o sarcófago)`,
);
console.log(
  `  vegetação: ${noSarcofago.percentualVegetacao.toFixed(1)} % no sarcófago` +
    ` -> ${em(GERACOES).percentualVegetacao.toFixed(1)} % no fim`,
);
console.log(
  `  concreto : ${em(GERACAO_DO_ACIDENTE).percentualConcreto.toFixed(1)} % no acidente` +
    ` -> ${em(GERACOES).percentualConcreto.toFixed(1)} % no fim\n`,
);
