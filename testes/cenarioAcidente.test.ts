import { describe, expect, it } from 'vitest';
import {
  aplicarMapa,
  criarParametrosCenario,
  criarRegraCenario,
  Estado,
  RAIO_DA_USINA,
  Simulacao,
  suavizar,
  Uso,
  type CamadaDeUso,
  type ParametrosCenario,
  type Raio,
  type TipoVizinhanca,
} from '../src/engine';

/**
 * Testes da regra do cenário do acidente nuclear.
 *
 * A estratégia é sempre a mesma: montar uma grade minúscula com um entorno
 * controlado, dar UM passo e conferir o estado da célula central. Como todos os
 * limiares são parâmetros, cada teste ajusta só o que interessa a ele e deixa o
 * resto no padrão — assim o teste continua válido quando a calibração mudar os
 * valores de fábrica.
 *
 * As probabilidades são fixadas em 0 ou 1 nos testes que não querem depender do
 * sorteio: `sorteio(0)` nunca ocorre e `sorteio(1)` sempre ocorre.
 *
 * Quase todos os testes de avanço da contaminação declaram `fase: 'acidente'`,
 * porque a contaminação só avança enquanto a usina está vazando.
 */

const TAMANHO = 5;
const CENTRO = 2;

interface Cenario {
  sim: Simulacao;
  parametros: ParametrosCenario;
}

/** Monta uma grade quadrada com a regra do cenário e contorno fixo. */
function cenario(
  ajustes: Partial<ParametrosCenario>,
  montar: (sim: Simulacao) => void,
  vizinhanca: TipoVizinhanca = 'moore',
  raio: Raio = 1,
  tamanho = TAMANHO,
): Cenario {
  const parametros = criarParametrosCenario(ajustes);
  const sim = new Simulacao({
    largura: tamanho,
    altura: tamanho,
    semente: 7,
    regra: criarRegraCenario(parametros),
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

describe('regra 1 — usina', () => {
  it('permanece usina em qualquer situação', () => {
    for (const fase of ['normal', 'acidente', 'sarcofago'] as const) {
      const { sim } = cenario({ fase }, (s) => {
        s.definirCelula(CENTRO, CENTRO, Estado.USINA);
        cercarCentro(s, Estado.ARVORE);
      });
      expect(passoNoCentro(sim)).toBe(Estado.USINA);
    }
  });

  /**
   * Grade grande o bastante para o alcance da usina caber inteiro dentro dela,
   * com um bloco de reator de 5x5 no meio.
   */
  function gradeComUsina(fase: ParametrosCenario['fase']): Simulacao {
    const lado = 25;
    const meio = 12;
    const parametros = criarParametrosCenario({ fase });
    const sim = new Simulacao({
      largura: lado,
      altura: lado,
      semente: 3,
      regra: criarRegraCenario(parametros),
      contorno: 'fixo',
    });
    for (let y = meio - 2; y <= meio + 2; y++) {
      for (let x = meio - 2; x <= meio + 2; x++) sim.definirCelula(x, y, Estado.USINA);
    }
    return sim;
  }

  it('durante o vazamento, contamina o solo em volta', () => {
    const sim = gradeComUsina('acidente');
    sim.passo();
    // Célula colada na borda do reator.
    expect(sim.obterCelula(12, 9)).toBe(Estado.CONTAMINADO_LEVE);
  });

  it('alcança muito além da vizinhança imediata', () => {
    const sim = gradeComUsina('acidente');
    sim.passo();

    // A três células da borda do bloco: longe demais para a vizinhança de raio 1,
    // mas dentro do alcance declarado pela regra.
    expect(sim.obterCelula(12, 7)).toBe(Estado.CONTAMINADO_LEVE);
    expect(RAIO_DA_USINA).toBeGreaterThan(1);
  });

  it('não alcança além do raio declarado', () => {
    const sim = gradeComUsina('acidente');
    sim.passo();
    // Distância 5 da borda do bloco, com RAIO_DA_USINA = 4.
    expect(sim.obterCelula(12, 5)).toBe(Estado.SOLO);
  });

  it('na operação normal, não emite nada', () => {
    const sim = gradeComUsina('normal');
    for (let g = 0; g < 10; g++) sim.passo();
    expect(sim.estatisticas().percentualContaminado).toBe(0);
  });

  it('com o sarcófago construído, volta a não emitir', () => {
    const sim = gradeComUsina('sarcofago');
    for (let g = 0; g < 10; g++) sim.passo();
    expect(sim.estatisticas().percentualContaminado).toBe(0);
  });
});

describe('regra 2 — dinâmica da contaminação', () => {
  it('solo cercado de contaminação grave sobe de nível', () => {
    const { sim } = cenario({ fase: 'acidente' }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      cercarCentro(s, Estado.CONTAMINADO_GRAVE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_LEVE);
  });

  it('sobe um nível por geração, até o máximo', () => {
    const { sim } = cenario({ fase: 'acidente' }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      cercarCentro(s, Estado.CONTAMINADO_GRAVE);
    });

    /*
     * O entorno é repintado antes de cada geração. Sem isso o teste mediria
     * outra coisa: as células da borda também evoluem e, como metade dos
     * vizinhos DELAS está fora da grade (contorno fixo, que conta como solo
     * limpo), elas decaem e a pressão sobre o centro cai antes de ele chegar ao
     * máximo. Repintando, o que sobra é exatamente a propriedade que interessa —
     * um nível por geração, e nunca mais que o máximo.
     */
    const passoComEntornoFixo = (): Estado => {
      cercarCentro(sim, Estado.CONTAMINADO_GRAVE);
      return passoNoCentro(sim);
    };

    expect(passoComEntornoFixo()).toBe(Estado.CONTAMINADO_LEVE);
    expect(passoComEntornoFixo()).toBe(Estado.CONTAMINADO_MODERADO);
    expect(passoComEntornoFixo()).toBe(Estado.CONTAMINADO_GRAVE);
    expect(passoComEntornoFixo()).toBe(Estado.CONTAMINADO_GRAVE);
  });

  it('sem fonte, a contaminação cercada de solo limpo desce de nível', () => {
    const { sim } = cenario({ fase: 'sarcofago' }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.CONTAMINADO_GRAVE);
      cercarCentro(s, Estado.SOLO);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_MODERADO);
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_LEVE);
    expect(passoNoCentro(sim)).toBe(Estado.SOLO);
    expect(passoNoCentro(sim)).toBe(Estado.SOLO);
  });

  it('com o sarcófago construído, a contaminação não avança para o solo limpo', () => {
    // Mesmo entorno do primeiro teste, que faria o solo subir de nível.
    const { sim } = cenario({ fase: 'sarcofago' }, (s) => {
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
        { fase: 'acidente', limiarSubida: 2.9 },
        (s) => {
          s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
          cercarCentro(s, Estado.CONTAMINADO_GRAVE);
        },
        vizinhanca,
      );
      expect(passoNoCentro(sobe.sim)).toBe(Estado.CONTAMINADO_LEVE);

      const naoSobe = cenario(
        { fase: 'acidente', limiarSubida: 3.1, limiarDescida: 0 },
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

    const semVento = cenario({ fase: 'acidente', limiarSubida: 0.5, vento: 'nenhum' }, montar);
    expect(passoNoCentro(semVento.sim)).toBe(Estado.SOLO);

    const ventoNorte = cenario({ fase: 'acidente', limiarSubida: 0.5, vento: 'norte' }, montar);
    expect(passoNoCentro(ventoNorte.sim)).toBe(Estado.CONTAMINADO_LEVE);

    const ventoSul = cenario({ fase: 'acidente', limiarSubida: 0.5, vento: 'sul' }, montar);
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

    const semAbsorcao = cenario(
      { fase: 'acidente', limiarSubida: 0.5, absorcao: 0 },
      montar,
    );
    expect(passoNoCentro(semAbsorcao.sim)).toBe(Estado.CONTAMINADO_LEVE);

    // 4 árvores x 0,1 = 0,4 de desconto -> pressão 0,35, abaixo do limiar.
    const comAbsorcao = cenario(
      { fase: 'acidente', limiarSubida: 0.5, absorcao: 0.1 },
      montar,
    );
    expect(passoNoCentro(comAbsorcao.sim)).toBe(Estado.SOLO);
  });
});

describe('regra 3 — solo limpo é colonizado pela vegetação', () => {
  it('solo limpo ao lado de vegetação vira grama', () => {
    const { sim } = cenario({ fase: 'sarcofago', probBrotar: 1 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      s.definirCelula(CENTRO, CENTRO - 1, Estado.GRAMA);
    });
    expect(passoNoCentro(sim)).toBe(Estado.GRAMA);
  });

  it('não brota se houver qualquer contaminação na vizinhança', () => {
    const { sim } = cenario({ fase: 'sarcofago', probBrotar: 1 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
      s.definirCelula(CENTRO, CENTRO - 1, Estado.GRAMA);
      s.definirCelula(CENTRO, CENTRO + 1, Estado.CONTAMINADO_LEVE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.SOLO);
  });

  it('não brota sem nenhuma vegetação por perto', () => {
    const { sim } = cenario({ fase: 'sarcofago', probBrotar: 1 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.SOLO);
    });
    expect(passoNoCentro(sim)).toBe(Estado.SOLO);
  });
});

describe('regra 4 — vegetação', () => {
  it('vegetação sob pressão alta vira contaminação leve', () => {
    for (const planta of [Estado.GRAMA, Estado.ARBUSTO, Estado.ARVORE]) {
      const { sim } = cenario({ fase: 'acidente' }, (s) => {
        s.definirCelula(CENTRO, CENTRO, planta);
        cercarCentro(s, Estado.CONTAMINADO_GRAVE);
      });
      expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_LEVE);
    }
  });

  it('a vegetação morre mesmo sem fonte ativa, pela contaminação que já está no solo', () => {
    const { sim } = cenario({ fase: 'sarcofago' }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.ARVORE);
      cercarCentro(s, Estado.CONTAMINADO_GRAVE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONTAMINADO_LEVE);
  });

  it('sem pressão, a vegetação amadurece um estágio por vez', () => {
    const { sim } = cenario({ fase: 'normal', probCrescer1: 1, probCrescer2: 1 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.GRAMA);
    });
    expect(passoNoCentro(sim)).toBe(Estado.ARBUSTO);
    expect(passoNoCentro(sim)).toBe(Estado.ARVORE);
    expect(passoNoCentro(sim)).toBe(Estado.ARVORE);
  });

  it('a vegetação resiste enquanto a pressão estiver abaixo do limiar de morte', () => {
    const { sim } = cenario(
      { fase: 'acidente', limiarMorte: 3.5, probCrescer1: 0 },
      (s) => {
        s.definirCelula(CENTRO, CENTRO, Estado.GRAMA);
        cercarCentro(s, Estado.CONTAMINADO_GRAVE);
      },
    );
    expect(passoNoCentro(sim)).toBe(Estado.GRAMA);
  });
});

describe('regra 5 — concreto', () => {
  it('não recebe contaminação, nem cercado de contaminação grave', () => {
    const { sim } = cenario({ fase: 'acidente' }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.CONCRETO);
      cercarCentro(s, Estado.CONTAMINADO_GRAVE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONCRETO);
  });

  it('NÃO racha enquanto a cidade está habitada', () => {
    // Mesmo entorno do teste seguinte, que faz o concreto rachar. A diferença é
    // só a fase: com gente morando ali, o mato é arrancado.
    const { sim } = cenario({ fase: 'normal', probRachar: 1, vizinhosParaRachar: 2 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.CONCRETO);
      s.definirCelula(CENTRO - 1, CENTRO, Estado.ARBUSTO);
      s.definirCelula(CENTRO + 1, CENTRO, Estado.ARVORE);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONCRETO);
  });

  it('racha e vira grama depois da evacuação, com K vizinhos arbusto/árvore', () => {
    for (const fase of ['acidente', 'sarcofago'] as const) {
      const { sim } = cenario({ fase, probRachar: 1, vizinhosParaRachar: 2 }, (s) => {
        s.definirCelula(CENTRO, CENTRO, Estado.CONCRETO);
        s.definirCelula(CENTRO - 1, CENTRO, Estado.ARBUSTO);
        s.definirCelula(CENTRO + 1, CENTRO, Estado.ARVORE);
      });
      expect(passoNoCentro(sim)).toBe(Estado.GRAMA);
    }
  });

  it('não racha com menos de K vizinhos lenhosos', () => {
    const { sim } = cenario({ fase: 'sarcofago', probRachar: 1, vizinhosParaRachar: 2 }, (s) => {
      s.definirCelula(CENTRO, CENTRO, Estado.CONCRETO);
      s.definirCelula(CENTRO - 1, CENTRO, Estado.ARBUSTO);
    });
    expect(passoNoCentro(sim)).toBe(Estado.CONCRETO);
  });

  it('a grama rasteira não racha o concreto', () => {
    const { sim } = cenario({ fase: 'sarcofago', probRachar: 1, vizinhosParaRachar: 2 }, (s) => {
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

describe('depois do sarcófago', () => {
  it('sem fonte, a contaminação total nunca aumenta', () => {
    /*
     * A grade tem contaminação, solo e concreto, mas NENHUMA vegetação — e isso
     * é proposital. A regra 4 transforma vegetação sob pressão em contaminação
     * leve, o que faria o total subir por um motivo legítimo, sem nenhuma
     * relação com o avanço da mancha. Tirando a vegetação, a propriedade fica
     * limpa: sem emissão, a contaminação só pode diminuir.
     */
    const parametros = criarParametrosCenario({ fase: 'sarcofago' });
    const sim = new Simulacao({
      largura: 40,
      altura: 30,
      semente: 2024,
      regra: criarRegraCenario(parametros),
      contorno: 'fixo',
    });

    for (let y = 5; y < 25; y++) {
      for (let x = 5; x < 35; x++) sim.definirCelula(x, y, Estado.CONTAMINADO_GRAVE);
    }
    for (let x = 10; x < 20; x++) sim.definirCelula(x, 12, Estado.CONCRETO);

    let anterior = contaminacaoTotal(sim);
    expect(anterior).toBeGreaterThan(0);

    for (let g = 0; g < 400; g++) {
      sim.passo();
      const atual = contaminacaoTotal(sim);
      expect(atual, `a contaminação aumentou na geração ${sim.geracao}`).toBeLessThanOrEqual(
        anterior,
      );
      anterior = atual;
    }

    expect(anterior).toBe(0);
  });

  it('a cidade e a floresta se recuperam depois do acidente', () => {
    /*
     * O ciclo completo, em escala reduzida para a suíte ficar rápida: operação
     * normal, vazamento, sarcófago e recuperação. É o mesmo roteiro que o script
     * de calibração mede na grade cheia (`npm run calibrar`).
     */
    const parametros = criarParametrosCenario();
    const sim = new Simulacao({
      largura: 120,
      altura: 80,
      semente: 2024,
      regra: criarRegraCenario(parametros),
      contorno: 'fixo',
    });
    aplicarMapa(sim, 'cidade');

    // Fase 1: operação normal — nada de contaminação, nada de rachadura.
    const inicial = sim.estatisticas();
    for (let g = 0; g < 30; g++) sim.passo();
    expect(sim.estatisticas().percentualContaminado).toBe(0);
    expect(sim.estatisticas().percentualConcreto).toBe(inicial.percentualConcreto);

    // Fase 2: vazamento.
    parametros.fase = 'acidente';
    for (let g = 0; g < 60; g++) sim.passo();
    const noSarcofago = sim.estatisticas();
    expect(noSarcofago.percentualContaminado).toBeGreaterThan(5);
    expect(noSarcofago.percentualVegetacao).toBeLessThan(inicial.percentualVegetacao);

    // Fase 3: sarcófago — a contaminação decai e a mata volta.
    parametros.fase = 'sarcofago';
    for (let g = 0; g < 400; g++) sim.passo();

    const fim = sim.estatisticas();
    expect(fim.percentualContaminado).toBeLessThan(1);
    expect(fim.percentualVegetacao).toBeGreaterThan(noSarcofago.percentualVegetacao);
    // O concreto racha: parte da cidade foi tomada pela vegetação.
    expect(fim.percentualConcreto).toBeLessThan(noSarcofago.percentualConcreto);
  });
});

/* -------------------------------------------------------------------------- */
/* Geração procedural do mapa                                                 */
/* -------------------------------------------------------------------------- */

describe('suavização (o autômato que gera o terreno)', () => {
  it('apaga células isoladas no meio do vazio', () => {
    const largura = 7;
    const altura = 7;
    const mascara = new Uint8Array(largura * altura);
    mascara[3 * largura + 3] = 1; // um único ponto solto

    // `foraVale = 0` para a moldura não interferir neste teste.
    const suave = suavizar(mascara, largura, altura, 1, 0);
    expect(suave[3 * largura + 3]).toBe(0);
  });

  it('preenche buracos isolados dentro de uma massa', () => {
    const largura = 7;
    const altura = 7;
    const mascara = new Uint8Array(largura * altura).fill(1);
    mascara[3 * largura + 3] = 0; // um furo de uma célula

    const suave = suavizar(mascara, largura, altura, 1, 0);
    expect(suave[3 * largura + 3]).toBe(1);
  });

  it('é determinística: a mesma entrada dá sempre a mesma saída', () => {
    const largura = 20;
    const altura = 20;
    const original = new Uint8Array(largura * altura);
    for (let i = 0; i < original.length; i++) original[i] = i % 3 === 0 ? 1 : 0;

    const a = suavizar(Uint8Array.from(original), largura, altura, 4);
    const b = suavizar(Uint8Array.from(original), largura, altura, 4);
    expect(a).toEqual(b);
  });
});

describe('mapa Cidade e usina', () => {
  interface MapaGerado {
    sim: Simulacao;
    usos: CamadaDeUso;
  }

  function cidade(semente: number): MapaGerado {
    const sim = new Simulacao({
      largura: 120,
      altura: 80,
      semente,
      regra: criarRegraCenario(criarParametrosCenario()),
    });
    const usos = aplicarMapa(sim, 'cidade', semente);
    return { sim, usos };
  }

  it('gera floresta, concreto e exatamente uma usina', () => {
    const { sim } = cidade(1);
    const contagem = sim.estatisticas().contagem;

    expect(contagem[Estado.CONCRETO]!).toBeGreaterThan(0);
    expect(
      contagem[Estado.GRAMA]! + contagem[Estado.ARBUSTO]! + contagem[Estado.ARVORE]!,
    ).toBeGreaterThan(0);
    // O bloco do reator tem lado 5.
    expect(contagem[Estado.USINA]!).toBe(25);
  });

  it('a floresta cobre a maior parte do mapa', () => {
    const { sim } = cidade(1);
    const estatisticas = sim.estatisticas();
    expect(estatisticas.percentualVegetacao).toBeGreaterThan(40);
    // A cidade ocupa uma fatia menor, como pede o cenário.
    expect(estatisticas.percentualConcreto).toBeLessThan(35);
  });

  it('a mesma semente gera exatamente a mesma cidade', () => {
    expect(Uint8Array.from(cidade(99).sim.grade)).toEqual(Uint8Array.from(cidade(99).sim.grade));
    expect(cidade(99).usos).toEqual(cidade(99).usos);
  });

  it('sementes diferentes geram cidades diferentes', () => {
    expect(Uint8Array.from(cidade(1).sim.grade)).not.toEqual(Uint8Array.from(cidade(2).sim.grade));
  });

  it('a camada de uso concorda com os estados que ela descreve', () => {
    const { sim, usos } = cidade(7);
    for (let i = 0; i < usos.length; i++) {
      const uso = usos[i]! as Uso;
      const estado = sim.grade[i]! as Estado;
      if (uso === Uso.USINA) expect(estado).toBe(Estado.USINA);
      // A rua é asfalto sobre terra: para as regras ela é SOLO, e é isso que
      // deixa a contaminação entrar na cidade pela malha viária.
      if (uso === Uso.RUA) expect(estado).toBe(Estado.SOLO);
      if (uso === Uso.PREDIO) expect(estado).toBe(Estado.CONCRETO);
      if (uso === Uso.CASA_A || uso === Uso.CASA_B || uso === Uso.CASA_C) {
        expect(estado).toBe(Estado.CONCRETO);
      }
    }
  });

  it('a malha viária é permeável, para a contaminação poder entrar na cidade', () => {
    const { sim, usos } = cidade(7);
    let ruas = 0;
    for (let i = 0; i < usos.length; i++) {
      if (usos[i] === Uso.RUA) ruas++;
    }
    expect(ruas).toBeGreaterThan(100);
    // Nenhuma rua pode ser concreto, senão a cidade vira uma ilha imune.
    for (let i = 0; i < usos.length; i++) {
      if (usos[i] === Uso.RUA) expect(sim.grade[i]).not.toBe(Estado.CONCRETO);
    }
  });

  it('usa as três variantes de telhado', () => {
    const { usos } = cidade(7);
    for (const variante of [Uso.CASA_A, Uso.CASA_B, Uso.CASA_C]) {
      expect(usos.includes(variante)).toBe(true);
    }
  });

  it('a usina fica na periferia da cidade, e não no centro', () => {
    const { sim, usos } = cidade(1);

    let somaX = 0;
    let somaY = 0;
    let urbanas = 0;
    let usinaX = 0;
    let usinaY = 0;
    let celulasDaUsina = 0;

    for (let y = 0; y < sim.altura; y++) {
      for (let x = 0; x < sim.largura; x++) {
        const uso = usos[y * sim.largura + x]! as Uso;
        if (uso === Uso.NATUREZA) continue;
        somaX += x;
        somaY += y;
        urbanas++;
        if (uso === Uso.USINA) {
          usinaX += x;
          usinaY += y;
          celulasDaUsina++;
        }
      }
    }

    const centroX = somaX / urbanas;
    const centroY = somaY / urbanas;
    const distanciaDaUsina = Math.hypot(usinaX / celulasDaUsina - centroX, usinaY / celulasDaUsina - centroY);

    // Distância média das células urbanas ao centro, como referência.
    let somaDistancias = 0;
    for (let y = 0; y < sim.altura; y++) {
      for (let x = 0; x < sim.largura; x++) {
        if (usos[y * sim.largura + x] === Uso.NATUREZA) continue;
        somaDistancias += Math.hypot(x - centroX, y - centroY);
      }
    }

    expect(distanciaDaUsina).toBeGreaterThan(somaDistancias / urbanas);
  });
});
