import { Estado } from './estados';
import type { Estatisticas } from './simulacao';

/**
 * Exportação do histórico em CSV.
 *
 * Por que isto mora na engine, e não na interface? Porque montar o TEXTO do CSV é
 * transformação de dados, não desenho de tela: não envolve o navegador em momento
 * nenhum. Ficando aqui, ganha testes automatizados junto com o resto da engine —
 * e quem fala com o navegador (criar o arquivo, disparar o download) continua na
 * camada de interface, em `ui/exportar.ts`.
 */

/**
 * Separador de colunas.
 *
 * Ponto e vírgula, e não vírgula, porque os números saem no formato brasileiro,
 * com vírgula decimal. É o que o Excel em português abre corretamente com um
 * duplo clique, sem passar pelo assistente de importação. Para quem for usar o
 * arquivo em Python ou R, o separador está documentado no cabeçalho do README.
 */
const SEPARADOR = ';';

/** Cabeçalhos das colunas, na ordem em que são escritas. */
export const COLUNAS_CSV: readonly string[] = [
  'geracao',
  'solo',
  'contaminado_leve',
  'contaminado_moderado',
  'contaminado_grave',
  'usina',
  'concreto',
  'grama',
  'arbusto',
  'arvore',
  'total',
  'percentual_contaminado',
  'percentual_vegetacao',
  'percentual_concreto',
];

/** Número com vírgula decimal e uma casa, como manda o formato brasileiro. */
function decimal(valor: number): string {
  return valor.toFixed(1).replace('.', ',');
}

/**
 * Monta o CSV do histórico: uma linha por geração, uma coluna por estado, mais
 * os percentuais derivados.
 *
 * As contagens BRUTAS vão junto com os percentuais de propósito. O percentual é o
 * que se lê na tela, mas é a contagem que permite recalcular qualquer outro
 * indicador depois, na planilha, sem ter que rodar a simulação de novo.
 */
export function montarCsv(historico: readonly Estatisticas[]): string {
  const linhas: string[] = [COLUNAS_CSV.join(SEPARADOR)];

  for (const e of historico) {
    const contagem = e.contagem;
    linhas.push(
      [
        String(e.geracao),
        String(contagem[Estado.SOLO]),
        String(contagem[Estado.CONTAMINADO_LEVE]),
        String(contagem[Estado.CONTAMINADO_MODERADO]),
        String(contagem[Estado.CONTAMINADO_GRAVE]),
        String(contagem[Estado.USINA]),
        String(contagem[Estado.CONCRETO]),
        String(contagem[Estado.GRAMA]),
        String(contagem[Estado.ARBUSTO]),
        String(contagem[Estado.ARVORE]),
        String(e.total),
        decimal(e.percentualContaminado),
        decimal(e.percentualVegetacao),
        decimal(e.percentualConcreto),
      ].join(SEPARADOR),
    );
  }

  // Quebra de linha ao final: alguns programas ignoram a última linha sem ela.
  return `${linhas.join('\n')}\n`;
}
