# Retomada

Autômato celular 2D que simula um **acidente nuclear e a retomada da natureza**,
rodando inteiramente no navegador.

Uma cidade cercada de floresta convive com a usina construída na borda dela. Quando
o reator falha, a contaminação se espalha pelas ruas e pela mata, matando tudo o que
alcança. Construído o sarcófago, a fonte se apaga: a contaminação decai geração após
geração, a vegetação volta a avançar sobre o terreno limpo e, com o tempo, racha o
concreto das casas.

> **Status:** etapas 1 a 3 concluídas (engine, Jogo da Vida, renderização, cenário do
> acidente e calibração). O painel completo com todos os parâmetros, o pincel por
> estado e a exportação de dados são a etapa 4 — ver [Cronograma](#cronograma).

---

## Como rodar

Requisitos: Node.js 20 ou superior.

```bash
npm install     # instala as dependências
npm run dev     # ambiente de desenvolvimento em http://localhost:5173
npm test        # roda a suíte de testes da engine
npm run build   # checagem de tipos + build de produção em dist/
```

| Script | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com recarga instantânea. |
| `npm test` | Vitest, apenas sobre `src/engine`. |
| `npm run test:watch` | Vitest em modo observador. |
| `npm run typecheck` | `tsc --noEmit` em modo estrito. |
| `npm run build` | Checagem de tipos seguida do empacotamento. |
| `npm run preview` | Serve o build de produção localmente. |
| `npm run calibrar` | Roda o cenário sem interface e imprime os indicadores. |

### Publicação

O projeto é um site estático. No Cloudflare Pages: comando de build `npm run build`,
diretório de saída `dist`. Antes de publicar, trocar o placeholder
`https://SEU-DOMINIO-AQUI` no `index.html` (canonical, Open Graph e Twitter Card) pelo
domínio real e gerar o `og-image.png` (1200x630) — a exportação do canvas em PNG,
prevista para a etapa 4, serve exatamente para isso.

---

## Arquitetura

A separação em três camadas é a decisão estrutural central do projeto:

```
src/
├── engine/     TypeScript puro — a simulação. NÃO toca em nada do navegador.
│   ├── estados.ts      enum dos 9 estados da célula + predicados
│   ├── rng.ts          gerador pseudoaleatório com semente (mulberry32)
│   ├── vizinhanca.ts   Von Neumann e Moore, raio 1 ou 2 (plugáveis)
│   ├── contorno.ts     periódico (toroidal) e fixo (fora da grade = solo limpo)
│   ├── regras.ts       regras de transição: acidente nuclear e Jogo da Vida
│   ├── uso.ts          camada estática de uso do solo (rua, casa, prédio, usina)
│   ├── simulacao.ts    grade em Uint8Array, double buffering, estatísticas
│   ├── mapas.ts        condições iniciais, incluindo a cidade procedural
│   └── index.ts        superfície pública da engine
├── render/     desenho no canvas
│   ├── paleta.ts       aparências, variação de tom e tabelas de cor em bytes
│   └── renderizador.ts ImageData + ampliação por drawImage
├── ui/         controles, laço de animação e pincel
│   ├── dom.ts          acesso tipado a elementos
│   ├── laco.ts         requestAnimationFrame com acumulador de tempo
│   ├── controles.ts    único módulo que conhece os ids do HTML
│   └── pincel.ts       desenho direto na grade com o ponteiro
├── estilo.css
└── main.ts     liga as três camadas (o único ponto com estado global)
```

**Por que separar assim?**

1. **A engine é testável sem navegador.** Toda a suíte roda no Node, em poucos
   segundos, sem jsdom nem canvas simulado.
2. **A dependência é de mão única:** `ui` e `render` conhecem a `engine`; a `engine`
   não conhece ninguém. O script de calibração é a prova prática: é a mesma simulação
   do canvas rodando em modo texto, sem nenhuma adaptação.
3. **A regra vira dado, não código espalhado.** Uma regra é um objeto com um método
   `aplicar(contexto)`; acrescentar uma nova não muda nenhum tipo existente.

Essa fronteira não fica só na documentação: `testes/arquitetura.test.ts` lê os
arquivos de `src/engine` e **falha** se algum deles mencionar `document`, `window`,
`ImageData` ou importar algo de fora do diretório.

### Decisões de implementação que valem destaque

- **Grade em `Uint8Array`.** São 9 estados, então cada célula cabe em um byte; uma
  grade de 200x125 ocupa 25 KB, e as duas (atual e próxima) cabem no cache do
  processador.
- **Double buffering.** A regra lê da grade atual e a simulação escreve na próxima;
  no fim da geração as duas trocam de papel. É o que garante a atualização
  *síncrona* exigida por um autômato celular — nenhuma célula já recalculada
  influencia as que ainda serão. A troca é O(1), sem cópia de memória.
- **Zero alocação no laço principal.** O contexto passado para a regra, o leitor de
  vizinhança e até as funções auxiliares da regra são criados uma única vez.
  Alocá-los por célula significaria 25 mil objetos por geração, a até 60 gerações por
  segundo.
- **A regra declara o alcance de que precisa.** O contrato `Regra` tem um campo
  opcional `raioAmplo`; quem o declara recebe da simulação uma segunda vizinhança,
  maior, já posicionada. É assim que a usina alcança muito mais longe que uma célula
  de solo, sem que a engine precise saber o que é uma usina.
- **Renderização por tabela.** O laço que preenche os pixels não tem nenhum `if`,
  nenhuma conta de cor e nenhuma chamada de função — só três indexações. Tanto a
  escolha da aparência (estado + uso do solo) quanto a variação de tom estão
  pré-resolvidas em tabelas montadas na inicialização.
- **Laço com acumulador de tempo.** `requestAnimationFrame` desenha uma vez por
  quadro e o acumulador decide quantas gerações cabem no intervalo, com teto por
  quadro — a velocidade em gerações por segundo é respeitada tanto em 60 Hz quanto
  em 144 Hz, e a página não trava ao voltar de segundo plano.

---

## Os estados

| Valor | Estado | Cor |
| --- | --- | --- |
| 0 | Solo limpo | marrom escuro |
| 1 | Contaminação leve | oliva fosco |
| 2 | Contaminação moderada | verde-limão |
| 3 | Contaminação grave | chartreuse radioativo |
| 4 | Usina nuclear | ciano |
| 5 | Concreto | cinza (variável, ver abaixo) |
| 6 | Grama | verde claro |
| 7 | Arbusto | verde médio |
| 8 | Árvore | verde escuro |

A ordem dos valores não é arbitrária: 0..3 formam a escala de contaminação e 6..8 a
escala de vegetação, o que transforma "subir um nível" em uma soma em vez de uma
tabela de transição.

### A camada de uso do solo

Para as REGRAS, uma rua, um telhado e a parede de um prédio são a mesma coisa; para
os OLHOS, não. Por isso existe uma camada **estática** paralela à grade, que guarda o
que cada célula era quando o mapa foi gerado: `NATUREZA`, `RUA`, `CASA_A/B/C`,
`PREDIO`, `USINA`.

Ela **não participa de nenhuma regra** — e isso é garantido pela estrutura, não pela
disciplina: a camada nem chega à simulação. `aplicarMapa` a devolve, o `main.ts` a
guarda e entrega direto ao renderizador.

As três variantes de casa existem porque a variação de tom é por CÉLULA: com uma
variante só, um telhado de 3x3 sairia salpicado. A variante é sorteada uma vez por
casa e pinta o telhado inteiro de um tom só.

---

## As regras

### Jogo da Vida (B3/S23)

A regra clássica de Conway, sobre o mesmo alfabeto de estados: **viva** é a grama e
**morta** é o solo limpo. Está aqui por dois motivos: é o autômato celular de
referência, que qualquer leitor reconhece, e funciona como teste de integração da
engine inteira — se o planador se desloca corretamente, então vizinhança, contorno,
atualização síncrona e ordem de varredura estão todos corretos.

### Cenário do acidente nuclear

O cenário tem **três fases**, e quase tudo deriva delas:

| Fase | Usina emite | Contaminação avança | Vegetação morre com | Concreto racha | Natureza recoloniza |
| --- | --- | --- | --- | --- | --- |
| Operação normal | não | — | — | não (cidade habitada) | não (paisagem mantida) |
| Vazamento | sim | sim | pressão ≥ 0,08 (precipitação) | sim (evacuada) | não (a precipitação mata os brotos) |
| Sarcófago | não | não (só decai) | pressão ≥ 0,8 (só o resíduo) | sim | sim |

#### Pressão

```
pressão = Σ(peso_vizinho × nível_vizinho) / Σ(peso_vizinho)
        + emissãoUsina × (células de usina no raio ampliado ÷ total do raio ampliado)
        − absorção × nº de vizinhos arbusto/árvore
```

Dividir pela **soma dos pesos** — e não pela quantidade de vizinhos — é o que mantém
os mesmos limiares válidos em Von Neumann, em Moore e com qualquer vento: o resultado
continua sendo uma média na escala 0..3.

A usina contribui **zero** na vizinhança imediata e entra só pelo segundo termo,
calculado sobre um raio muito maior (4 células). É isso que cria o halo instantâneo em
volta do reator no momento do acidente, e é a razão de a regra declarar `raioAmplo`.
A varredura ampla só acontece enquanto a usina emite; nas outras fases o custo é uma
comparação.

O vento faz o vizinho do lado de onde ele vem pesar 2x e o do lado oposto 0,5x:

| Vento | Peso 2× | Peso 0,5× |
| --- | --- | --- |
| nenhum | — | — |
| norte | vizinhos acima (`dy < 0`) | abaixo |
| sul | abaixo | acima |
| leste | à direita | à esquerda |
| oeste | à esquerda | à direita |

#### Tabela de transições

| Estado atual | Condição | Próximo estado |
| --- | --- | --- |
| **Usina** | sempre | Usina |
| **Solo / contaminado** (0–3) | vazamento em curso e pressão ≥ nível + `limiarSubida`, nível < 3 | nível **+1** |
| | pressão ≤ nível − `limiarDescida` | nível **−1** (mín. 0) |
| | senão | nível **−1** com prob. `probDecaimento` |
| **Solo** (0) | reator contido, continuou em 0, nenhum vizinho contaminado, sorteio com p = `probBrotar` × nº vizinhos com vegetação | Grama |
| **Vegetação** (6–8) | pressão ≥ limiar letal da fase | Contaminado leve |
| Grama | senão, prob. `probCrescer1` | Arbusto |
| Arbusto | senão, prob. `probCrescer2` | Árvore |
| **Concreto** | cidade evacuada, ≥ `vizinhosParaRachar` vizinhos arbusto/árvore, prob. `probRachar` | Grama |
| | senão | Concreto (nunca recebe contaminação) |

#### Quatro decisões de modelagem, e por que cada uma existe

**1. A contaminação só avança enquanto a usina vaza.**

A regra na forma "sobe se a média dos vizinhos passa de um limiar" **não se recupera
nunca**, e isso não é questão de calibrar melhor — é geometria. O interior de uma
mancha sempre enxerga mais contaminação (média 3, todos os vizinhos no máximo) do que
a frente de avanço (média 1,125, só três vizinhos contaminados). Ou seja, *"um nível é
alcançável"* e *"um nível se auto-sustenta"* são exatamente a mesma condição: tudo o
que a mancha conquista, ela também mantém para sempre. Foi verificado com o script de
calibração, tanto com limiar absoluto quanto com limiar relativo.

A leitura física é direta: o solo contaminado é um **reservatório**, não uma fonte.
Ele empurra contaminação para os lados enquanto há material novo chegando do reator;
fechado o sarcófago, o que restou apenas decai no lugar.

**2. Os limiares são relativos ao nível da própria célula.**

A comparação é `pressão ≥ nível + limiarSubida`, e não contra um valor absoluto. A
leitura vira *"a vizinhança está mais contaminada do que eu?"*, e é isso que dá
GRADIENTE à mancha: na frente de avanço a pressão mal dá para o nível 1; algumas
células atrás dá para o 2; e só no miolo, cercado de nível 3, dá para o 3. Com limiar
absoluto, qualquer célula tocada pela mancha subia direto ao máximo e a pluma virava
um polígono de cor única.

**3. O limiar que mata a vegetação depende da fase.**

Durante o vazamento é baixo (0,08): com o reator exposto, o que mata as plantas é a
precipitação radioativa caindo do ar. Depois do sarcófago é alto (0,8): sobra apenas o
resíduo no solo.

Sem essa diferença o cenário não termina. Com um limiar único e baixo, cada planta
morta vira contaminação nova que mata a planta seguinte — uma onda que se alimenta
sozinha e continua devorando a floresta muito depois do sarcófago. Na calibração isso
aparece como um pico de contaminação 90 gerações *depois* de o reator ser contido.

**4. A natureza só recoloniza terreno novo depois do sarcófago.**

Na operação normal a paisagem é mantida — ruas varridas, clareiras abertas, quintais
aparados; a fase é, de propósito, o retrato do "antes". Durante o vazamento, a
precipitação mata qualquer broto. Sem essa condição, cem gerações de operação normal
levam a vegetação de 63 % para 95 % do mapa e o acidente acontece sobre uma cidade já
engolida pelo mato.

#### Parâmetros

Todos ficam em um objeto só (`ParametrosCenario`), compartilhado com a interface:
mexer em um controle vale já na geração seguinte, sem reconstruir a regra.

| Parâmetro | Padrão | O que faz |
| --- | --- | --- |
| `emissaoUsina` | 3 | intensidade da fonte durante o vazamento |
| `limiarSubida` | 0,12 | quanto a pressão precisa superar o próprio nível para subir |
| `limiarDescida` | 0,95 | quanto precisa ficar abaixo do próprio nível para descer |
| `probDecaimento` | 0,015 | decaimento radioativo; limpa o miolo da mancha |
| `limiarMorte` | 0,08 | mata a vegetação durante o vazamento (precipitação) |
| `limiarMorteResidual` | 0,80 | mata a vegetação depois do sarcófago (só resíduo) |
| `absorcao` | 0,01 | desconto na pressão por vizinho arbusto/árvore |
| `probBrotar` | 0,05 | por vizinho com vegetação |
| `probCrescer1` / `probCrescer2` | 0,006 / 0,003 | grama → arbusto → árvore |
| `vizinhosParaRachar` | 2 | o K da regra do concreto |
| `probRachar` | 0,012 | velocidade com que a mata racha as construções |
| `pesoVentoForte` / `pesoVentoFraco` | 2 / 0,5 | pesos do vento |
| `RAIO_DA_USINA` | 4 | alcance do reator exposto, em células |

---

## O mapa, gerado por outro autômato celular

O mapa inteiro sai da semente, e a ferramenta é uma **regra de maioria** — cada célula
passa a valer o que a maioria da sua vizinhança de Moore já vale. Repetida poucas
vezes sobre ruído puro, ela apaga os pixels soltos e faz emergirem manchas de contorno
orgânico. Vale registrar a simetria: **usamos um autômato celular para gerar o terreno
do nosso autômato celular**.

- **Floresta:** três máscaras independentes, cada uma suavizada e sobreposta como
  camada — uma decide onde há mata e onde ficam as clareiras, outra onde a mata passa
  de grama a arbusto, a terceira onde o arbusto vira árvore. Sortear o tipo célula a
  célula produziria os três verdes misturados pixel a pixel, que é justamente o
  chuvisco que a suavização existe para evitar. Por cima, a densidade local decide a
  ORLA: onde a mata é rala, só nasce grama.
- **Cidade:** a mesma suavização, agora sobre um ruído *enviesado pela distância* de um
  centro sorteado. Perto do centro quase todo mundo é cidade, longe quase ninguém, e a
  maioria transforma essa nuvem de probabilidade em uma mancha fechada e irregular —
  um retângulo perfeito denunciaria o gerador.
- **Dentro da cidade:** malha de ruas, quarteirões com casas de 2x2 a 3x3 separadas por
  quintais de grama, e prédios maiores no miolo. A usina de 5x5 ocupa o quarteirão
  mais periférico, de modo que o vazamento pegue a cidade de um lado e a floresta do
  outro.

**As ruas são asfalto sobre terra**, então o estado delas é `SOLO` e não `CONCRETO`. A
diferença é decisiva: o concreto é impermeável pela regra 5, e uma cidade toda de
concreto seria uma ilha imune no meio da contaminação, com os quintais lacrados por
todos os lados. Com a malha viária permeável, a contaminação entra na cidade pelas
ruas — que é exatamente por onde ela entraria. O cinza do asfalto vem da camada de
uso, não do estado.

---

## Visual

- **Variação de tom estável por célula.** Cada célula recebe um pequeno desvio de tom
  a partir de um hash de (x, y). Depender só das coordenadas é o ponto: se viesse de
  `Math.random()` o mapa cintilaria a cada geração, e se dependesse do estado uma
  célula mudaria de tom ao ser contaminada, confundindo a leitura da mancha.
  A amplitude é discreta de propósito — exagerada, um tom claro de árvore fica parecido
  com um tom escuro de grama e as manchas de vegetação se desmancham em chuvisco.
- **Contaminação** vai de oliva fosco a chartreuse, subindo em saturação e brilho. A
  progressão é de intensidade, não de matiz, o que a torna legível em células de
  poucos pixels.
- **Vegetação** usa três verdes mais escuros e menos amarelados que a contaminação,
  para que mata viva e solo envenenado nunca se confundam.
- **Concreto** se desdobra em rua (cinza escuro), três telhados terrosos e prédio
  (cinza claro), conforme a camada de uso.
- **A usina é o único tom frio da paleta.** Cercada de verdes, cinzas e marrons, ela
  não tem como se perder de vista — e é a origem de tudo o que acontece.

---

## Calibração

```bash
npm run calibrar
npm run calibrar -- geracoes=800 acidente=50 sarcofago=120 vento=norte
npm run calibrar -- limiarMorte=0.2 probDecaimento=0.03
```

Roda a simulação **sem interface** e imprime os indicadores a cada N gerações.
Qualquer parâmetro pode ser sobrescrito na linha de comando, o que permite comparar
cenários sem editar código. Foi com ele que todos os valores acima foram escolhidos.

Resultado com os padrões (200x125, semente `retomada`, acidente na geração 100 e
sarcófago na 160):

| Geração | Contaminado | Vegetação | Concreto | Grave |
| --- | --- | --- | --- | --- |
| 0 | 0,0 % | 63,4 % | 4,5 % | 0,0 % |
| 80 | 0,0 % | 63,4 % | 4,5 % | 0,0 % |
| 100 — *acidente* | 0,5 % | 63,3 % | 4,5 % | 0,0 % |
| 120 | 8,8 % | 59,6 % | 4,3 % | 4,8 % |
| 160 — *sarcófago* | 48,0 % | 37,0 % | 4,1 % | 32,3 % |
| 200 | 41,4 % | 47,3 % | 4,1 % | 13,0 % |
| 240 | 32,3 % | 47,7 % | 4,1 % | 0,3 % |
| 280 | 19,8 % | 49,2 % | 4,1 % | 0,0 % |
| 320 | 9,8 % | 52,1 % | 4,1 % | 0,0 % |
| 360 | 4,2 % | 57,2 % | 4,0 % | 0,0 % |
| 400 | 1,5 % | 63,9 % | 4,0 % | 0,0 % |
| 440 | 0,6 % | 72,4 % | 3,8 % | 0,0 % |
| 480 | 0,2 % | 80,9 % | 3,5 % | 0,0 % |

Os dois alvos ficam atendidos: o vazamento cobre quase metade do mapa, cidade e
floresta próxima incluídas, e 90 % da contaminação some **194 gerações** depois do
sarcófago.

---

## Testes

```bash
npm test
```

A suíte cobre apenas a engine, e cada arquivo tem um propósito declarado:

| Arquivo | O que verifica |
| --- | --- |
| `contorno.test.ts` | O vizinho à esquerda da coluna 0 é a última coluna (periódico); fora da grade devolve `FORA_DA_GRADE` (fixo). |
| `vizinhanca.test.ts` | Von Neumann raio 1 tem 4 vizinhos e Moore raio 1 tem 8 (e 12/24 no raio 2); leitura correta nas bordas com cada contorno. |
| `jogoDaVida.test.ts` | O planador se desloca 1 célula na diagonal a cada 4 gerações, atravessa a borda e volta ao ponto de partida; bloco estável; pisca-pisca com período 2. |
| `reprodutibilidade.test.ts` | A mesma semente gera exatamente a mesma simulação, inclusive com regra probabilística; `reiniciar` recria o gerador. |
| `cenarioAcidente.test.ts` | Cada uma das cinco regras isoladamente; o alcance ampliado da usina e o seu limite; a média ponderada equivalente em Von Neumann e Moore; o vento; a absorção; o concreto que só racha depois da evacuação; a contaminação que nunca aumenta sem fonte; o ciclo completo das três fases; e a geração procedural do mapa. |
| `arquitetura.test.ts` | Nenhum arquivo da engine referencia o navegador ou importa de fora do diretório. |

---

## Cronograma

- [x] **Etapa 1 — engine.** Estados, gerador com semente, vizinhanças, contornos,
      simulação com double buffering, Jogo da Vida e a suíte de testes.
- [x] **Etapa 2 — renderização e passo a passo.** Canvas via `ImageData`, laço de
      animação, play/pause, próxima geração, velocidade, contador, mapas iniciais,
      pincel básico e tema escuro responsivo.
- [x] **Etapa 3 — cenário do acidente nuclear.** Fases, pressão com fonte de longo
      alcance, vento, absorção, mapa procedural com floresta e cidade, camada de uso
      do solo, paleta com variação de tom e o script de calibração.
- [ ] **Etapa 4 — interface completa.** Parâmetros editáveis, pincel com seleção de
      estado, estatísticas ao vivo e exportação em CSV e PNG.

---

Desenvolvido por [Gustavo Dev](https://gustavodev.dev/).
