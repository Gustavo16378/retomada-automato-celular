import { PARAMETROS_PADRAO, type ParametrosCenario } from '../engine';

/**
 * Painel dos parâmetros do cenário.
 *
 * Os controles não são escritos no HTML: são gerados a partir da LISTA abaixo.
 * A razão é prática — são catorze parâmetros, e escrever catorze blocos de HTML
 * quase idênticos convida a erros de copiar e colar (um `id` repetido, um rótulo
 * que não corresponde ao campo) que só aparecem quando alguém arrasta o controle
 * errado. Com a lista, acrescentar um parâmetro é acrescentar uma linha, e o
 * TypeScript confere se a chave existe mesmo em `ParametrosCenario`.
 */

/** Só os parâmetros numéricos; fase e vento têm controles próprios. */
type ChaveNumerica = Exclude<keyof ParametrosCenario, 'fase' | 'vento'>;

interface CampoParametro {
  readonly chave: ChaveNumerica;
  readonly rotulo: string;
  readonly min: number;
  readonly max: number;
  readonly passo: number;
  /** Casas decimais na exibição do valor. */
  readonly casas: number;
  /** Explicação curta, mostrada ao passar o ponteiro sobre o rótulo. */
  readonly dica: string;
}

interface GrupoDeParametros {
  readonly titulo: string;
  readonly campos: readonly CampoParametro[];
}

/**
 * Os limites de cada controle não são genéricos: cada um cobre a faixa em que o
 * parâmetro ainda produz um cenário reconhecível, um pouco além dos dois lados
 * do valor calibrado. É o que transforma o painel em instrumento de
 * experimentação em vez de um campo numérico solto.
 */
export const GRUPOS_DE_PARAMETROS: readonly GrupoDeParametros[] = [
  {
    titulo: 'Emissão e transporte',
    campos: [
      {
        chave: 'emissaoUsina',
        rotulo: 'Emissão da usina',
        min: 0,
        max: 9,
        passo: 0.5,
        casas: 1,
        dica: 'Intensidade da fonte durante o vazamento, na escala 0 a 3 da pressão.',
      },
      {
        chave: 'absorcao',
        rotulo: 'Absorção por arbusto/árvore',
        min: 0,
        max: 0.1,
        passo: 0.005,
        casas: 3,
        dica: 'Quanto cada vizinho lenhoso desconta da pressão.',
      },
      {
        chave: 'pesoVentoForte',
        rotulo: 'Peso a favor do vento',
        min: 1,
        max: 4,
        passo: 0.25,
        casas: 2,
        dica: 'Peso do vizinho que está do lado de onde o vento vem.',
      },
      {
        chave: 'pesoVentoFraco',
        rotulo: 'Peso contra o vento',
        min: 0,
        max: 1,
        passo: 0.05,
        casas: 2,
        dica: 'Peso do vizinho que está do lado oposto ao vento.',
      },
    ],
  },
  {
    titulo: 'Contaminação',
    campos: [
      {
        chave: 'limiarSubida',
        rotulo: 'Limiar de subida',
        min: 0,
        max: 1.5,
        passo: 0.01,
        casas: 2,
        dica: 'Quanto a pressão precisa superar o próprio nível da célula para ela subir.',
      },
      {
        chave: 'limiarDescida',
        rotulo: 'Limiar de descida',
        min: 0,
        max: 1.5,
        passo: 0.01,
        casas: 2,
        dica: 'Quanto a pressão precisa ficar abaixo do próprio nível para a célula descer. Maior = mais difícil decair.',
      },
      {
        chave: 'probDecaimento',
        rotulo: 'Decaimento radioativo',
        min: 0,
        max: 0.1,
        passo: 0.001,
        casas: 3,
        dica: 'Chance de perder um nível por geração. É o que limpa o miolo da mancha.',
      },
    ],
  },
  {
    titulo: 'Vegetação',
    campos: [
      {
        chave: 'limiarMorte',
        rotulo: 'Morte durante o vazamento',
        min: 0,
        max: 2,
        passo: 0.01,
        casas: 2,
        dica: 'Pressão que mata a planta enquanto há precipitação radioativa caindo.',
      },
      {
        chave: 'limiarMorteResidual',
        rotulo: 'Morte após o sarcófago',
        min: 0,
        max: 3,
        passo: 0.05,
        casas: 2,
        dica: 'Pressão que mata a planta quando só resta resíduo no solo. Baixar demais faz a onda de morte não parar mais.',
      },
      {
        chave: 'probBrotar',
        rotulo: 'Brotar (por vizinho verde)',
        min: 0,
        max: 0.3,
        passo: 0.005,
        casas: 3,
        dica: 'Chance de o solo limpo virar grama, multiplicada pelo número de vizinhos com vegetação.',
      },
      {
        chave: 'probCrescer1',
        rotulo: 'Grama → arbusto',
        min: 0,
        max: 0.05,
        passo: 0.001,
        casas: 3,
        dica: 'Chance por geração de a grama amadurecer.',
      },
      {
        chave: 'probCrescer2',
        rotulo: 'Arbusto → árvore',
        min: 0,
        max: 0.05,
        passo: 0.001,
        casas: 3,
        dica: 'Chance por geração de o arbusto virar árvore.',
      },
    ],
  },
  {
    titulo: 'Concreto',
    campos: [
      {
        chave: 'vizinhosParaRachar',
        rotulo: 'Vizinhos para rachar (K)',
        min: 1,
        max: 8,
        passo: 1,
        casas: 0,
        dica: 'Mínimo de vizinhos arbusto/árvore para o concreto poder rachar.',
      },
      {
        chave: 'probRachar',
        rotulo: 'Chance de rachar',
        min: 0,
        max: 0.1,
        passo: 0.001,
        casas: 3,
        dica: 'Velocidade com que a mata desfaz as construções, depois da evacuação.',
      },
    ],
  },
];

export interface ControlesDeParametros {
  /** Reescreve os controles a partir dos valores atuais do objeto. */
  sincronizar: () => void;
}

export interface OpcoesParametros {
  /** Elemento que vai receber os controles gerados. */
  container: HTMLElement;
  /** O objeto compartilhado com a regra; os controles escrevem direto nele. */
  parametros: ParametrosCenario;
  /** Chamado depois de cada alteração, para a tela refletir o novo valor. */
  aoMudar: () => void;
}

/** Número no formato brasileiro, com a quantidade de casas do campo. */
function formatar(valor: number, casas: number): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/**
 * Gera os controles e os liga ao objeto de parâmetros.
 *
 * Escrever direto no objeto compartilhado é o que faz o ajuste valer na geração
 * seguinte, sem reconstruir a regra nem reiniciar a simulação — dá para arrastar
 * um controle com a simulação rodando e ver o efeito acontecendo.
 */
export function conectarParametros(opcoes: OpcoesParametros): ControlesDeParametros {
  const { container, parametros, aoMudar } = opcoes;
  const sincronizadores: Array<() => void> = [];

  for (const grupo of GRUPOS_DE_PARAMETROS) {
    const titulo = document.createElement('h3');
    titulo.className = 'subgrupo';
    titulo.textContent = grupo.titulo;
    container.append(titulo);

    for (const campo of grupo.campos) {
      const id = `param-${campo.chave}`;

      const rotulo = document.createElement('label');
      rotulo.className = 'campo';
      rotulo.htmlFor = id;
      rotulo.title = campo.dica;

      const linha = document.createElement('span');
      linha.className = 'rotulo';

      const nome = document.createElement('span');
      nome.textContent = campo.rotulo;

      const valor = document.createElement('output');
      valor.htmlFor = id;

      const controle = document.createElement('input');
      controle.type = 'range';
      controle.id = id;
      controle.min = String(campo.min);
      controle.max = String(campo.max);
      controle.step = String(campo.passo);

      const sincronizar = (): void => {
        const atual = parametros[campo.chave];
        controle.value = String(atual);
        valor.textContent = formatar(atual, campo.casas);
      };

      controle.addEventListener('input', () => {
        parametros[campo.chave] = Number(controle.value);
        valor.textContent = formatar(parametros[campo.chave], campo.casas);
        aoMudar();
      });

      sincronizar();
      sincronizadores.push(sincronizar);

      linha.append(nome, valor);
      rotulo.append(linha, controle);
      container.append(rotulo);
    }
  }

  const restaurar = document.createElement('button');
  restaurar.type = 'button';
  restaurar.textContent = '↺ Restaurar valores calibrados';
  restaurar.addEventListener('click', () => {
    // A fase e o vento não voltam ao padrão: são estado do experimento em curso,
    // não calibração. Restaurar os números no meio de um vazamento não deve
    // consertar o reator.
    for (const grupo of GRUPOS_DE_PARAMETROS) {
      for (const campo of grupo.campos) {
        parametros[campo.chave] = PARAMETROS_PADRAO[campo.chave];
      }
    }
    for (const sincronizar of sincronizadores) sincronizar();
    aoMudar();
  });
  container.append(restaurar);

  return {
    sincronizar(): void {
      for (const sincronizar of sincronizadores) sincronizar();
    },
  };
}
