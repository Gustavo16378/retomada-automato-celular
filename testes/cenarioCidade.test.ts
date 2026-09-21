import { describe, it } from 'vitest';

/**
 * Testes do cenário cidade/contaminação.
 *
 * A regra do cenário é implementada na etapa 3 do cronograma; estes casos já
 * ficam declarados como pendentes (`it.todo`) para que a suíte mostre, desde
 * agora, qual é a cobertura planejada. O Vitest os lista como "todo" em vez de
 * fingir que passaram.
 */
describe('regra do cenário cidade (etapa 3)', () => {
  it.todo('solo cercado de contaminação grave sobe de nível');
  it.todo('com a cidade abandonada e sem fontes, a contaminação total nunca aumenta');
  it.todo('a fábrica permanece fábrica em qualquer situação');
  it.todo('o concreto não recebe contaminação');
  it.todo('vegetação sob pressão alta vira contaminação leve');
  it.todo('a pressão média é equivalente em Von Neumann e Moore para o mesmo entorno');
  it.todo('o vento dobra o peso do vizinho de onde ele vem e reduz o do lado oposto');
});
