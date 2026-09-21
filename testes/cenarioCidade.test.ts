import { describe, expect, it } from 'vitest';
import {
  aplicarMapa,
  criarParametrosCidade,
  criarRegraCidade,
  Estado,
  Simulacao,
  type ParametrosCidade,
  type Raio,
  type TipoVizinhanca,
} from '../src/engine';

/**
 * Testes da regra do cenário cidade.
 *
 * A estratégia é sempre a mesma: montar uma grade minúscula com um entorno
 * controlado, dar UM passo e conferir o estado da célula central. Como todos os
 * limiares são parâmetros, cada teste ajusta só o que interessa a ele e deixa o
 * resto no padrão — assim o teste continua válido quando a calibração mudar os
 * valores de fábrica.
 *
 * As probabilidades são fixadas em 0 ou 1 nos testes que não querem depender do
 * sorteio: `sorteio(0)` nunca ocorre e `sorteio(1)` sempre ocorre.
 */

const TAMANHO = 5;
const CENTRO = 2;

interface Cenario {
  sim: Simulacao;
  parametros: ParametrosCidade;
}

/** Monta uma grade 5x5 com a regra do cenário e contorno fixo. */
function cenario(
  ajustes: Partial<ParametrosCidade>,
  montar: (sim: Simulacao) => void,
  vizinhanca: TipoVizinhanca = 'moore',
  raio: Raio = 1,
): Cenario {
  const parametros = criarParametrosCidade(ajustes);
  const sim = new Simulacao({
    largura: TAMANHO,
    altura: TAMANHO,
    semente: 7,
    regra: criarRegraCidade(parametros),
    vizinhanca,
    raio,
    contorno: 'fixo',
  });
  montar(sim);
  return { sim, parametros };
}

/** Preenche os 8 vizinhos imediatos do centro com um estado. */
function cercarCentro(sim: Simulacao, estado: Estado): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      sim.definirCelula(CENTRO + dx, CENTRO + dy, estado);
    }
  }
}

/** Estado da célula central depois de uma geração. */
function passoNoCentro(sim: Simulacao): Estado {
  sim.passo();
  return sim.obterCelula(CENTRO, CENTRO);
}

/* -------------------------------------------------------------------------- */

describe('regra 1 — fábrica', () => {
  it('permanece fábrica em qualquer situação', () => {
    const { sim } = cenario({}, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.FABRICA);
      cercarCentro(s, Estado.ARVORE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.FABRICA);
  });

  it('a fábrica ativa contamina o solo vizinho', () => {
    const { sim } = cenario({}, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      s.definirCelula(CENTRO, CENTRO - 1, Estado.FABRICA);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_LEVE);
  });

  it('a fábrica abandonada não emite: o solo vizinho continua limpo', () => {
    const { sim } = cenario({ cidadeAbandonada: true }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      s.definirCelula(CENTRO, CENTRO - 1, Estado.FABRICA);
    });
    expect(passoNoCentro(sim)).toBe(Estado.SOLO);
  });
});

describe('regra 2 — dinâmica da contaminação', () => {
  it('solo cercado de contaminação grave sobe de nível', () => {
    const { sim } = cenario({}, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      cercarCentro(s, Estado.CONTAMINADO_GRAVE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_LEVE);
  });

  it('sobe um nível por geração, até o máximo', () => {
    const { sim } = cenario({}, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      cercarCentro(s, Estado.CONTAMINADO_GRAVE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_LEVE);
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_MODERADO);
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_GRAVE);
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_GRAVE);
  });

  it('sem fontes, a contaminação cercada de solo limpo desce de nível', () => {
    // A cidade precisa estar abandonada para este teste dizer o que pretende:
    // com ela ativa, a própria célula central contaminaria os vizinhos na
    // primeira geração, e na segunda eles a empurrariam de volta para cima.
    const { sim } = cenario({ cidadeAbandonada: true }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.CONTAMINADO_GRAVE);
      cercarCentro(s, Estado.SOLO);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_MODERADO);
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_LEVE);
    expect(passoNoCentro(sim)).toBe(Estado.SOLO);
    expect(passoNoCentro(sim)).toBe(Estado.SOLO);
  });

  it('com a cidade abandonada, a contaminação não avança para o solo limpo', () => {
    // Mesmo entorno do primeiro teste, que faria o solo subir de nível.
    const { sim } = cenario({ cidadeAbandonada: true }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      cercarCentro(s, Estado.CONTAMINADO_GRAVE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.SOLO);
  });
});

describe('pressão — média ponderada', () => {
  it('um entorno uniforme dá a mesma pressão em Von Neumann e em Moore', () => {
    // O ponto da MÉDIA (em vez da soma): com 4 ou com 8 vizinhos no nível 3, a
    // pressão é 3 nos dois casos. Com soma seriam 12 e 24, e o mesmo limiar
    // daria resultados diferentes.
    for (const vizinhanca of ['vonNeumann', 'moore'] as const) {
      const sobe = cenario(
        { limiarSubida: 2.9 },
        (s) => {
          s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
          cercarCentro(s, Estado.CONTAMINADO_GRAVE);
        },
        vizinhanca,
      );
      expect(passoNoCentro(sobe.sim)).toBe(Estado.CONTAMINADO_LEVE);

      const naoSobe = cenario(
        { limiarSubida: 3.1 },
        (s) => {
          s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
          cercarCentro(s, Estado.CONTAMINADO_GRAVE);
        },
        vizinhanca,
      );
      expect(passoNoCentro(naoSobe.sim)).toBe(Estado.SOLO);
    }
  });

  it('o vento dobra o peso do vizinho de onde ele vem e reduz o do lado oposto', () => {
    // Um único vizinho grave, ao NORTE do centro. Sem vento a pressão é
    // 3/8 = 0,375; com vento norte sobe para 0,63; com vento sul cai para 0,16.
    const montar = (s: Simulacao): void => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      s.definirCelula(CENTRO, CENTRO - 1, Estado.CONTAMINADO_GRAVE);
    };

    const semVento = cenario({ limiarSubida: 0.5, vento: 'nenhum' }, montar);
    expect(passoNoCentro(semVento.sim)).toBe(Estado.SOLO);

    const ventoNorte = cenario({ limiarSubida: 0.5, vento: 'norte' }, montar);
    expect(passoNoCentro(ventoNorte.sim)).toBe(Estado.CONTAMINADO_LEVE);

    const ventoSul = cenario({ limiarSubida: 0.5, vento: 'sul' }, montar);
    expect(passoNoCentro(ventoSul.sim)).toBe(Estado.SOLO);
  });

  it('a vegetação lenhosa absorve parte da pressão', () => {
    // Dois vizinhos graves (pressão 6/8 = 0,75) e quatro árvores em volta.
    const montar = (s: Simulacao): void => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      s.definirCelula(CENTRO - 1, CENTRO, Estado.CONTAMINADO_GRAVE);
      s.definirCelula(CENTRO + 1, CENTRO, Estado.CONTAMINADO_GRAVE);
      s.definirCelula(CENTRO - 1, CENTRO - 1, Estado.ARVORE);
      s.definirCelula(CENTRO + 1, CENTRO - 1, Estado.ARVORE);
      s.definirCelula(CENTRO - 1, CENTRO + 1, Estado.ARVORE);
      s.definirCelula(CENTRO + 1, CENTRO + 1, Estado.ARVORE);
    };

    const semAbsorcao = cenario({ limiarSubida: 0.5, absorcao: 0 }, montar);
    expect(passoNoCentro(semAbsorcao.sim)).toBe(Estado.CONTAMINADO_LEVE);

    // 4 árvores x 0,1 = 0,4 de desconto -> pressão 0,35, abaixo do limiar.
    const comAbsorcao = cenario({ limiarSubida: 0.5, absorcao: 0.1 }, montar);
    expect(passoNoCentro(comAbsorcao.sim)).toBe(Estado.SOLO);
  });
});

describe('regra 3 — solo limpo é colonizado pela vegetação', () => {
  it('solo limpo ao lado de vegetação vira grama', () => {
    const { sim } = cenario({ probBrotar: 1 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      s.definirCelula(CENTRO, CENTRO - 1, Estado.GRAMA);
    });
    expect(passoNoCentro(sim)).toBe(Estado.GRAMA);
  });

  it('não brota se houver qualquer contaminação na vizinhança', () => {
    const { sim } = cenario({ probBrotar: 1, limiarSubida: 9 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      s.definirCelula(CENTRO, CENTRO - 1, Estado.GRAMA);
      s.definirCelula(CENTRO, CENTRO + 1, Estado.CONTAMINADO_LEVE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.SOLO);
  });

  it('não brota sem nenhuma vegetação por perto', () => {
    const { sim } = cenario({ probBrotar: 1 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
    });
    expect(passoNoCentro(sim)).toBe(Estado.SOLO);
  });
});

describe('regra 4 — vegetação', () => {
  it('vegetação sob pressão alta vira contaminação leve', () => {
    for (const planta of [Estado.GRAMA, Estado.ARBUSTO, Estado.ARVORE]) {
      const { sim } = cenario({}, (s) => {
        s.definirCelula(CENTRO, CENTRO, planta);
        cercarCentro(s, Estado.CONTAMINADO_GRAVE);
      });
      expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_LEVE);
    }
  });

  it('sem pressão, a vegetação amadurece um estágio por vez', () => {
    const { sim } = cenario({ probCrescer1: 1, probCrescer2: 1 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.GRAMA);
    });
    expect(passoNoCentro(sim)).toBe(Estado.ARBUSTO);
    expect(passoNoCentro(sim)).toBe(Estado.ARVORE);
    expect(passoNoCentro(sim)).toBe(Estado.ARVORE);
  });

  it('a vegetação resiste enquanto a pressão estiver abaixo do limiar de morte', () => {
    const { sim } = cenario({ limiarMorte: 3.5, probCrescer1: 0 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.GRAMA);
      cercarCentro(s, Estado.CONTAMINADO_GRAVE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.GRAMA);
  });
});

describe('regra 5 — concreto', () => {
  it('não recebe contaminação, nem cercado de contaminação grave', () => {
    const { sim } = cenario({}, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.CONCRETO);
      cercarCentro(s, Estado.CONTAMINADO_GRAVE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONCRETO);
  });

  it('racha e vira grama com K vizinhos arbusto/árvore', () => {
    const { sim } = cenario({ probRachar: 1, vizinhosParaRachar: 2 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.CONCRETO);
      s.definirCelula(CENTRO - 1, CENTRO, Estado.ARBUSTO);
      s.definirCelula(CENTRO + 1, CENTRO, Estado.ARVORE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.GRAMA);
  });

  it('não racha com menos de K vizinhos lenhosos', () => {
    const { sim } = cenario({ probRachar: 1, vizinhosParaRachar: 2 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.CONCRETO);
      s.definirCelula(CENTRO - 1, CENTRO, Estado.ARBUSTO);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONCRETO);
  });

  it('a grama rasteira não racha o concreto', () => {
    const { sim } = cenario({ probRachar: 1, vizinhosParaRachar: 2 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.CONCRETO);
      cercarCentro(s, Estado.GRAMA);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONCRETO);
  });
});

/* -------------------------------------------------------------------------- */
/* Propriedades do cenário completo                                           */
/* -------------------------------------------------------------------------- */

/** Soma dos níveis de contaminação da grade inteira (0..3 por célula). */
function contaminacaoTotal(sim: Simulacao): number {
  const contagem = sim.estatisticas().contagem;
  return (
    contagem[Estado.CONTAMINADO_LEVE]! +
    2 * contagem[Estado.CONTAMINADO_MODERADO]! +
    3 * contagem[Estado.CONTAMINADO_GRAVE]!
  );
}

describe('cidade abandonada', () => {
  it('com a cidade abandonada e sem fontes, a contaminação total nunca aumenta', () => {
    /*
     * A grade tem contaminação, solo e concreto, mas NENHUMA vegetação — e isso
     * é proposital. A regra 4 transforma vegetação sob pressão em contaminação
     * leve, o que faria o total subir por um motivo legítimo, sem nenhuma
     * relação com o avanço da mancha. Tirando a vegetação, a propriedade fica
     * limpa: sem emissão, a contaminação só pode diminuir.
     */
    const parametros = criarParametrosCidade({ cidadeAbandonada: true });
    const sim = new Simulacao({
      largura: 40,
      altura: 30,
      semente: 2024,
      regra: criarRegraCidade(parametros),
      contorno: 'fixo',
    });

    for (let y = 5; y < 25; y++) {
      for (let x = 5; x < 35; x++) {
        sim.definirCelula(x, y, Estado.CONTAMINADO_GRAVE);
      }
    }
    for (let x = 10; x < 20; x++) sim.definirCelula(x, 12, Estado.CONCRETO);

    let anterior = contaminacaoTotal(sim);
    expect(anterior).toBeGreaterThan(0);

    for (let g = 0; g < 300; g++) {
      sim.passo();
      const atual = contaminacaoTotal(sim);
      expect(atual, `a contaminação aumentou na geração ${sim.geracao}`).toBeLessThanOrEqual(
        anterior,
      );
      anterior = atual;
    }

    expect(anterior).toBe(0);
  });

  it('uma cidade contaminada se recupera depois de abandonada', () => {
    /*
     * Este teste usa a grade REAL (160x100), e não uma reduzida, porque a
     * recuperação depende de uma condição de escala: a regra 3 só faz brotar
     * grama ao lado de vegetação já existente, então é preciso que a faixa verde
     * da borda sobreviva à fase industrial. Em uma grade pequena a mancha
     * alcança a borda antes da geração 100, mata tudo, e a partir daí nada mais
     * volta a crescer — a recuperação fica matematicamente impossível.
     *
     * É o mesmo cenário que o script de calibração mede (`npm run calibrar`).
     */
    const parametros = criarParametrosCidade();
    const sim = new Simulacao({
      largura: 160,
      altura: 100,
      semente: 2024,
      regra: criarRegraCidade(parametros),
      contorno: 'fixo',
    });
    aplicarMapa(sim, 'cidade');

    // Fase 1: cidade ativa, a contaminação se espalha.
    for (let g = 0; g < 100; g++) sim.passo();
    const noAbandono = sim.estatisticas();
    expect(noAbandono.percentualContaminado).toBeGreaterThan(20);
    expect(noAbandono.percentualVegetacao).toBeGreaterThan(0);

    // Fase 2: cidade abandonada — a contaminação decai e a mata volta.
    parametros.cidadeAbandonada = true;
    for (let g = 0; g < 300; g++) sim.passo();

    const fim = sim.estatisticas();
    expect(fim.percentualContaminado).toBeLessThan(1);
    expect(fim.percentualVegetacao).toBeGreaterThan(noAbandono.percentualVegetacao);
    // O concreto racha: parte dele foi tomada pela vegetação.
    expect(fim.percentualConcreto).toBeLessThan(noAbandono.percentualConcreto);
  });

  it('reativar a cidade volta a espalhar contaminação', () => {
    const parametros = criarParametrosCidade({ cidadeAbandonada: true });
    const sim = new Simulacao({
      largura: 40,
      altura: 30,
      semente: 5,
      regra: criarRegraCidade(parametros),
      contorno: 'fixo',
    });
    for (let y = 12; y < 18; y++) {
      for (let x = 15; x < 25; x++) sim.definirCelula(x, y, Estado.FABRICA);
    }

    for (let g = 0; g < 20; g++) sim.passo();
    expect(sim.estatisticas().percentualContaminado).toBe(0);

    parametros.cidadeAbandonada = false;
    for (let g = 0; g < 20; g++) sim.passo();
    expect(sim.estatisticas().percentualContaminado).toBeGreaterThan(0);
  });
});

describe('mapa Cidade', () => {
  function cidade(semente: number): Simulacao {
    const sim = new Simulacao({
      largura: 80,
      altura: 50,
      semente,
      regra: criarRegraCidade(criarParametrosCidade()),
    });
    aplicarMapa(sim, 'cidade', semente);
    return sim;
  }

  it('gera concreto, fábricas e vegetação nas bordas', () => {
    const contagem = cidade(1).estatisticas().contagem;
    expect(contagem[Estado.CONCRETO]!).toBeGreaterThan(0);
    expect(contagem[Estado.FABRICA]!).toBeGreaterThan(0);
    expect(contagem[Estado.GRAMA]! + contagem[Estado.ARBUSTO]! + contagem[Estado.ARVORE]!)
      .toBeGreaterThan(0);
    // Ruas: sempre sobra solo exposto entre os quarteirões.
    expect(contagem[Estado.SOLO]!).toBeGreaterThan(0);
  });

  it('a mesma semente gera exatamente a mesma cidade', () => {
    expect(Uint8Array.from(cidade(99).grade)).toEqual(Uint8Array.from(cidade(99).grade));
  });

  it('sementes diferentes geram cidades diferentes', () => {
    expect(Uint8Array.from(cidade(1).grade)).not.toEqual(Uint8Array.from(cidade(2).grade));
  });

  it('as fábricas ficam na região central, longe da vegetação da borda', () => {
    const sim = cidade(1);
    for (let y = 0; y < sim.altura; y++) {
      for (let x = 0; x < sim.largura; x++) {
        if (sim.obterCelula(x, y) !== Estado.FABRICA) continue;
        expect(Math.abs(x - sim.largura / 2)).toBeLessThan(sim.largura / 3);
        expect(Math.abs(y - sim.altura / 2)).toBeLessThan(sim.altura / 3);
      }
    }
  });
});
