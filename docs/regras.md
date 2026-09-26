# Regras e parâmetros — material para o relatório

Documento de referência do autômato celular **Retomada**. As tabelas estão em formato
direto para colar no relatório; o texto entre elas explica o que cada uma decide.

---

## 1. Definição formal

O autômato é definido pela quádrupla `(G, S, V, f)`:

| Elemento | Neste trabalho |
| --- | --- |
| **G** — grade | 200 x 125 células (25 000 células), armazenada em `Uint8Array` |
| **S** — conjunto de estados | 9 estados, de 0 a 8 (tabela 2) |
| **V** — vizinhança | Von Neumann ou Moore, raio 1 ou 2, selecionável |
| **f** — função de transição | regra do cenário do acidente (tabela 4) ou Jogo da Vida |

A atualização é **síncrona**: todas as células mudam ao mesmo tempo, a partir da mesma
configuração anterior. Na implementação isso é garantido por *double buffering* — a
regra lê de uma grade e a simulação escreve em outra, e as duas trocam de papel ao fim
da geração.

**Condição de contorno:** fixa (fora da grade é solo limpo) ou periódica (a grade se
fecha em um toro). O cenário do acidente usa a fixa, de modo que o entorno funcione
como sumidouro e dilua a contaminação nas bordas.

---

## 2. Estados

| Valor | Estado | Papel no modelo |
| --- | --- | --- |
| 0 | Solo limpo | terreno neutro; pode ser contaminado ou colonizado |
| 1 | Contaminação leve | primeiro nível da escala |
| 2 | Contaminação moderada | segundo nível |
| 3 | Contaminação grave | terceiro e último nível |
| 4 | Usina nuclear | fonte durante o vazamento; nunca muda de estado |
| 5 | Concreto | construções; impermeável à contaminação |
| 6 | Grama | vegetação rasteira |
| 7 | Arbusto | vegetação lenhosa (absorve contaminação, racha concreto) |
| 8 | Árvore | vegetação lenhosa madura |

A ordem dos valores **não é arbitrária**: 0..3 formam a escala de contaminação e 6..8 a
escala de vegetação. Assim "subir um nível" é uma soma (`estado + 1`) em vez de uma
tabela de transição, e os predicados viram comparações de intervalo.

---

## 3. As três fases do cenário

Quase todo o comportamento deriva da fase em que o cenário está:

| Fase | Usina emite | Contaminação avança | Limiar que mata a vegetação | Concreto racha | Vegetação coloniza |
| --- | --- | --- | --- | --- | --- |
| Operação normal | não | — | — | não | não |
| Vazamento | sim | sim | `limiarMorte` (precipitação) | sim | não |
| Sarcófago | não | não, só decai | `limiarMorteResidual` (resíduo) | sim | sim |

---

## 4. Pressão

A **pressão** sobre uma célula é o que dispara quase todas as transições:

```
pressão = Σ(peso_vizinho × nível_vizinho) / Σ(peso_vizinho)
        + emissãoUsina × (células de usina no raio ampliado ÷ total do raio ampliado)
        − absorção × nº de vizinhos arbusto/árvore
```

O nível de um vizinho é: solo = 0, contaminação = 1 a 3, e **0 para concreto, vegetação
e usina**. A usina não entra na média da vizinhança imediata: toda a emissão dela vem do
segundo termo, calculado sobre um raio maior (4 células), que é o que cria o halo em
volta do reator no instante do acidente.

Dividir pela **soma dos pesos**, e não pela quantidade de vizinhos, é o que mantém os
mesmos limiares válidos em Von Neumann, em Moore e com qualquer vento: o resultado
continua sendo uma média na escala 0..3.

### Pesos do vento

| Vento | Peso 2x | Peso 0,5x | Demais |
| --- | --- | --- | --- |
| nenhum | — | — | 1 |
| norte | vizinhos acima (`dy < 0`) | abaixo | 1 |
| sul | abaixo | acima | 1 |
| leste | à direita | à esquerda | 1 |
| oeste | à esquerda | à direita | 1 |

O vento é nomeado pela direção de **onde sopra**, como na meteorologia: vento norte
empurra a contaminação para o sul.

---

## 5. Tabela de transições

| Estado atual | Condição | Próximo estado |
| --- | --- | --- |
| **Usina** (4) | sempre | Usina |
| **Solo / contaminado** (0–3) | vazamento em curso **e** pressão ≥ nível + `limiarSubida` **e** nível < 3 | nível + 1 |
| | pressão ≤ nível − `limiarDescida` | nível − 1 (mínimo 0) |
| | nos demais casos | nível − 1 com probabilidade `probDecaimento` |
| **Solo** (0) | reator contido, continuou em 0, nenhum vizinho contaminado, e sorteio com p = `probBrotar` × nº de vizinhos com vegetação | Grama |
| **Vegetação** (6–8) | pressão ≥ limiar letal da fase | Contaminação leve |
| Grama (6) | senão, com probabilidade `probCrescer1` | Arbusto |
| Arbusto (7) | senão, com probabilidade `probCrescer2` | Árvore |
| Árvore (8) | senão | Árvore |
| **Concreto** (5) | cidade evacuada **e** ≥ `vizinhosParaRachar` vizinhos arbusto/árvore **e** sorteio com `probRachar` | Grama |
| | nos demais casos | Concreto |

Cada estado cai em exatamente um bloco — usina, concreto, vegetação, ou a faixa
solo/contaminação. Não há sobreposição, então não existe ordem de prioridade escondida
entre as regras.

---

## 6. Parâmetros

| Parâmetro | Padrão | Faixa no painel | O que controla |
| --- | --- | --- | --- |
| `emissaoUsina` | 3 | 0 – 9 | intensidade da fonte durante o vazamento |
| `absorcao` | 0,01 | 0 – 0,1 | desconto na pressão por vizinho arbusto/árvore |
| `pesoVentoForte` | 2 | 1 – 4 | peso do vizinho a favor do vento |
| `pesoVentoFraco` | 0,5 | 0 – 1 | peso do vizinho contra o vento |
| `limiarSubida` | 0,12 | 0 – 1,5 | excesso de pressão sobre o próprio nível para subir |
| `limiarDescida` | 0,95 | 0 – 1,5 | déficit de pressão sob o próprio nível para descer |
| `probDecaimento` | 0,015 | 0 – 0,1 | decaimento radioativo por geração |
| `limiarMorte` | 0,08 | 0 – 2 | pressão letal durante o vazamento |
| `limiarMorteResidual` | 0,80 | 0 – 3 | pressão letal depois do sarcófago |
| `probBrotar` | 0,05 | 0 – 0,3 | brotar grama, por vizinho com vegetação |
| `probCrescer1` | 0,006 | 0 – 0,05 | grama → arbusto |
| `probCrescer2` | 0,003 | 0 – 0,05 | arbusto → árvore |
| `vizinhosParaRachar` | 2 | 1 – 8 | o K da regra do concreto |
| `probRachar` | 0,012 | 0 – 0,1 | velocidade da rachadura |
| `RAIO_DA_USINA` | 4 | constante | alcance do reator exposto, em células |

Os valores foram obtidos por calibração (`npm run calibrar`), buscando dois alvos: o
vazamento cobrindo boa parte da cidade e da floresta próxima, e a recuperação levando
de 150 a 250 gerações depois do sarcófago.

---

## 7. Quatro decisões de modelagem

Estas quatro fogem de uma leitura ingênua do enunciado, e cada uma resolve um problema
concreto que apareceu nas medições.

**7.1. A contaminação só avança enquanto a usina vaza.**
A regra na forma "sobe se a média dos vizinhos passa de um limiar" nunca se recupera, e
o motivo é geométrico, não de calibração: o interior de uma mancha sempre enxerga mais
contaminação (média 3, todos os vizinhos no máximo) que a frente de avanço (média
1,125, três vizinhos contaminados). Logo *"um nível é alcançável"* e *"um nível se
auto-sustenta"* são a mesma condição — tudo o que a mancha conquista, ela mantém para
sempre. A leitura física da correção: o solo contaminado é um **reservatório**, não uma
fonte.

**7.2. Os limiares são relativos ao nível da própria célula.**
A comparação `pressão ≥ nível + limiarSubida` transforma a pergunta em *"a vizinhança
está mais contaminada do que eu?"*. É o que dá **gradiente** à mancha: nível 1 na
frente de avanço, 2 logo atrás, 3 só no miolo. Com limiar absoluto, toda célula tocada
subia direto ao máximo e a pluma virava um polígono de cor única.

**7.3. O limiar que mata a vegetação depende da fase.**
Durante o vazamento é baixo (precipitação radioativa caindo do ar); depois do sarcófago
é alto (só o resíduo no solo). Com um limiar único e baixo, cada planta morta vira
contaminação que mata a planta seguinte — uma onda que se alimenta sozinha e continua
devorando a floresta muito depois do reator ser contido.

**7.4. A vegetação só coloniza terreno novo depois do sarcófago.**
Na operação normal a paisagem é mantida (a fase é o retrato do "antes"); durante o
vazamento, a precipitação mata qualquer broto. Sem essa condição, cem gerações de
operação normal levam a vegetação de 63 % para 95 % do mapa e o acidente acontece sobre
uma cidade já engolida pelo mato.

---

## 8. Geração procedural do mapa

O mapa inteiro sai da semente, e a ferramenta é **outro autômato celular**: uma regra de
maioria sobre ruído (cada célula passa a valer o que a maioria da vizinhança de Moore
já vale, repetida 3 a 5 vezes). É o gerador clássico de cavernas, aplicado aqui para
produzir manchas de contorno orgânico em vez de ruído pixel a pixel.

| Camada | Como é feita |
| --- | --- |
| Floresta | três máscaras suavizadas e sobrepostas: onde há mata, onde ela é lenhosa, onde é árvore. A densidade local decide a orla, que fica sempre em grama |
| Silhueta da cidade | a mesma suavização sobre ruído enviesado pela distância de um centro sorteado, o que dá um contorno irregular |
| Ruas | toda a silhueta, com os quarteirões carimbados por cima. São **solo** (asfalto sobre terra), não concreto, senão a contaminação não entraria na cidade |
| Quarteirões | casas de 2x2 a 3x3 com quintais de grama; prédios maiores no miolo |
| Usina | bloco de 5x5 no quarteirão mais periférico da silhueta |
