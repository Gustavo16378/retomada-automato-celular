# Retomada

**Autômato celular 2D que simula um acidente nuclear e a retomada da natureza**, rodando
inteiramente no navegador, sem framework nenhum.

🔗 **[retomada-automato-celular.pages.dev](https://retomada-automato-celular.pages.dev)**

Uma cidade cercada de floresta convive com a usina construída na borda dela. Quando o
reator falha, a contaminação se espalha pelas ruas e pela mata, matando tudo o que
alcança. Construído o sarcófago, a fonte se apaga: a contaminação decai geração após
geração, a vegetação volta a avançar sobre o terreno limpo e, com o tempo, racha o
concreto das casas abandonadas.

## A inspiração

A imagem de partida é a zona de exclusão de Chernobyl. Décadas depois do acidente, o que
se vê nas fotos de Pripyat não é um deserto: é uma floresta comendo uma cidade — árvores
nascendo dentro de apartamentos, asfalto rachado por raízes, animais circulando entre
prédios. A ausência de gente acabou sendo, para a vegetação, mais benéfica do que a
radiação foi prejudicial.

É esse contraste que o modelo tenta capturar: **a mesma ausência humana que veio da
catástrofe é a condição da recuperação**. Enquanto a cidade era habitada, o mato era
arrancado e as rachaduras, tapadas; é só depois da evacuação que o concreto começa a se
desfazer.

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

O deploy é estático (Cloudflare Pages): comando de build `npm run build`, diretório de
saída `dist`.

---

## Como usar

O cenário tem **três fases**, acionadas pelos botões do painel:

1. **Operação normal** — a usina não emite, a cidade é habitada, a paisagem é mantida.
2. **☢ Acidente** — o reator passa a vazar. A contaminação avança pelas ruas e pela mata.
3. **🧱 Construir sarcófago** — a fonte se apaga. Começa a recuperação.

`↺ Reiniciar` volta à fase 1 com o mesmo mapa. Os demais controles trocam a vizinhança, o
raio, a condição de contorno, o vento e o mapa inicial; o bloco *Parâmetros do cenário*
abre os catorze limiares e probabilidades, ajustáveis com a simulação em movimento. O
pincel pinta qualquer estado direto na grade.

### Semente e reprodutibilidade

Nada na simulação usa `Math.random()`. Todo sorteio vem de um gerador pseudoaleatório com
semente (mulberry32), e a varredura da grade é sempre na mesma ordem. Consequência
prática: **a mesma semente produz exatamente a mesma simulação**, do mapa gerado ao
último pixel, quantas vezes for executada.

É isso que dá validade a qualquer comparação. Ao trocar Moore por Von Neumann mantendo a
semente, a diferença observada vem da vizinhança — não do acaso. O campo *Semente* aceita
texto (`cidade-02`) ou número; o botão 🎲 sorteia um novo.

### Exportação

| Botão | Arquivo | Conteúdo |
| --- | --- | --- |
| `⤓ CSV` | `retomada-historico-<semente>-g<geração>.csv` | uma linha por geração, com a contagem bruta de cada um dos nove estados, o total e os três percentuais |
| `⤓ PNG` | `retomada-mapa-<semente>-g<geração>.png` | a grade no instante do clique, ampliada 4x (800x500) |

O nome dos arquivos guarda a semente e a geração de propósito: é o que permite refazer
exatamente o experimento que gerou aquele dado. O CSV usa ponto e vírgula como separador
e vírgula decimal, com marca UTF-8 no início — abre direto no Excel em português, com
duplo clique.

O PNG não é uma captura de tela: é gerado a partir do canvas interno de uma célula por
pixel, então a imagem sai idêntica independentemente do tamanho da janela, do zoom do
navegador ou da densidade da tela.

### Imagem de compartilhamento

`?og=1` na URL abre um modo à parte que monta o mapa padrão, dispara o acidente, roda um
número fixo de gerações e gera a imagem de 1200x630 usada no Open Graph — sempre a mesma,
porque a semente e o número de gerações são fixos. Sem o parâmetro, nada disso é
executado.

---

## Arquitetura

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
│   ├── csv.ts          histórico em texto, para a planilha do relatório
│   └── index.ts        superfície pública da engine
├── render/     desenho no canvas
│   ├── paleta.ts       aparências, variação de tom e tabelas de cor em bytes
│   └── renderizador.ts ImageData + ampliação por drawImage
├── ui/         controles, laço de animação, pincel, gráfico e exportação
│   ├── dom.ts          acesso tipado a elementos
│   ├── laco.ts         requestAnimationFrame com acumulador de tempo
│   ├── controles.ts    único módulo que conhece os ids do HTML
│   ├── parametros.ts   gera os controles dos parâmetros a partir de uma lista
│   ├── seletorEstado.ts amostras de cor do pincel, geradas da paleta real
│   ├── grafico.ts      gráfico das três séries, ao vivo
│   ├── exportar.ts     download de CSV e PNG
│   ├── capturaOg.ts    modo ?og=1, que gera a imagem de compartilhamento
│   └── pincel.ts       desenho direto na grade com o ponteiro
├── estilo.css
└── main.ts     liga as três camadas (o único ponto com estado global)
```

### Por que essa separação

**A engine não pode tocar no navegador.** É a regra central do projeto, e ela paga três
dividendos concretos:

1. **Testabilidade.** A suíte inteira roda no Node, sem jsdom e sem canvas simulado. Os
   testes cobrem a simulação de verdade, não uma imitação dela.
2. **A simulação roda fora da página.** `npm run calibrar` executa o mesmo código do
   canvas em modo texto, imprimindo indicadores a cada N gerações. Foi assim que os
   parâmetros foram calibrados — e é a prova prática de que a separação é real.
3. **A dependência é de mão única.** `ui` e `render` conhecem a `engine`; a `engine` não
   conhece ninguém. Trocar o canvas por WebGL, ou a página por um script de linha de
   comando, não encosta na simulação.

A fronteira não fica só na documentação: `testes/arquitetura.test.ts` lê os arquivos de
`src/engine` e **falha** se algum deles mencionar `document`, `window`, `ImageData` ou
importar algo de fora do diretório.

Um exemplo de como a regra orienta o desenho: a exportação em CSV é dividida em dois.
Montar o *texto* do arquivo é transformação de dados e mora em `engine/csv.ts`, com
testes; criar o blob e disparar o download é conversa com o navegador e mora em
`ui/exportar.ts`.

### Decisões de implementação que valem destaque

- **Grade em `Uint8Array`.** São 9 estados, então cada célula cabe em um byte; uma grade
  de 200x125 ocupa 25 KB, e as duas (atual e próxima) cabem no cache do processador.
- **Double buffering.** A regra lê da grade atual e a simulação escreve na próxima; no
  fim da geração as duas trocam de papel. É o que garante a atualização *síncrona*
  exigida por um autômato celular — nenhuma célula já recalculada influencia as que ainda
  serão. A troca é O(1), sem cópia de memória.
- **Zero alocação no laço principal.** O contexto passado para a regra, o leitor de
  vizinhança e as funções auxiliares são criados uma única vez. Alocá-los por célula
  significaria 25 mil objetos por geração, a até 60 gerações por segundo.
- **A regra declara o alcance de que precisa.** O contrato `Regra` tem um campo opcional
  `raioAmplo`; quem o declara recebe da simulação uma segunda vizinhança, maior, já
  posicionada. É assim que a usina alcança muito mais longe que uma célula de solo, sem
  que a engine precise saber o que é uma usina.
- **Renderização por tabela.** O laço que preenche os pixels não tem nenhum `if`, nenhuma
  conta de cor e nenhuma chamada de função — só três indexações. A escolha da aparência
  (estado + uso do solo) e a variação de tom estão pré-resolvidas em tabelas montadas na
  inicialização.
- **Laço com acumulador de tempo.** `requestAnimationFrame` desenha uma vez por quadro e
  o acumulador decide quantas gerações cabem no intervalo, com teto por quadro — a
  velocidade em gerações por segundo é respeitada tanto em 60 Hz quanto em 144 Hz.

---

## Os estados

| Valor | Estado | Cor |
| --- | --- | --- |
| 0 | Solo limpo | marrom escuro |
| 1 | Contaminação leve | oliva fosco |
| 2 | Contaminação moderada | verde-limão |
| 3 | Contaminação grave | chartreuse radioativo |
| 4 | Usina nuclear | ciano |
| 5 | Concreto | cinza (rua, telhado ou prédio, conforme o uso do solo) |
| 6 | Grama | verde claro |
| 7 | Arbusto | verde médio |
| 8 | Árvore | verde escuro |

A ordem não é arbitrária: 0..3 formam a escala de contaminação e 6..8 a de vegetação, o
que transforma "subir um nível" em uma soma em vez de uma tabela de transição.

**A camada de uso do solo.** Para as regras, uma rua, um telhado e a parede de um prédio
são o mesmo `CONCRETO`; para os olhos, não. Uma camada **estática** paralela à grade
guarda o que cada célula era quando o mapa foi gerado (`RUA`, `CASA_A/B/C`, `PREDIO`,
`USINA`), e só o renderizador a lê. Ela nem chega à simulação: `aplicarMapa` a devolve e o
`main.ts` a entrega direto ao renderizador, de modo que nenhuma regra consiga alcançá-la.

---

## As regras

### As três fases

| Fase | Usina emite | Contaminação avança | Vegetação morre com | Concreto racha | Natureza recoloniza |
| --- | --- | --- | --- | --- | --- |
| Operação normal | não | — | — | não | não |
| Vazamento | sim | sim | pressão ≥ 0,08 (precipitação) | sim | não |
| Sarcófago | não | não, só decai | pressão ≥ 0,80 (só resíduo) | sim | sim |

### Pressão

```
pressão = Σ(peso_vizinho × nível_vizinho) / Σ(peso_vizinho)
        + emissãoUsina × (células de usina no raio ampliado ÷ total do raio ampliado)
        − absorção × nº de vizinhos arbusto/árvore
```

Níveis: solo = 0, contaminação = 1 a 3, e **0 para concreto, vegetação e usina**. A usina
entra só pelo segundo termo, calculado sobre um raio de 4 células — é o que cria o halo
instantâneo em volta do reator. Dividir pela **soma dos pesos**, e não pela quantidade de
vizinhos, é o que mantém os mesmos limiares válidos em Von Neumann, em Moore e com
qualquer vento.

O vento faz o vizinho do lado de onde ele vem pesar 2x e o do lado oposto 0,5x. É nomeado
pela direção de onde sopra: vento norte empurra a contaminação para o sul.

### Tabela de transições

| Estado atual | Condição | Próximo estado |
| --- | --- | --- |
| **Usina** (4) | sempre | Usina |
| **Solo / contaminado** (0–3) | vazamento em curso **e** pressão ≥ nível + `limiarSubida` **e** nível < 3 | nível **+1** |
| | pressão ≤ nível − `limiarDescida` | nível **−1** (mín. 0) |
| | nos demais casos | nível **−1** com prob. `probDecaimento` |
| **Solo** (0) | reator contido, continuou em 0, nenhum vizinho contaminado, sorteio com p = `probBrotar` × nº vizinhos com vegetação | Grama |
| **Vegetação** (6–8) | pressão ≥ limiar letal da fase | Contaminação leve |
| Grama (6) | senão, prob. `probCrescer1` | Arbusto |
| Arbusto (7) | senão, prob. `probCrescer2` | Árvore |
| Árvore (8) | senão | Árvore |
| **Concreto** (5) | cidade evacuada **e** ≥ `vizinhosParaRachar` vizinhos arbusto/árvore **e** prob. `probRachar` | Grama |
| | nos demais casos | Concreto (nunca recebe contaminação) |

Cada estado cai em exatamente um bloco, então não existe ordem de prioridade escondida
entre as regras.

### Parâmetros

| Parâmetro | Padrão | O que controla |
| --- | --- | --- |
| `emissaoUsina` | 3 | intensidade da fonte durante o vazamento |
| `absorcao` | 0,01 | desconto na pressão por vizinho arbusto/árvore |
| `pesoVentoForte` | 2 | peso do vizinho a favor do vento |
| `pesoVentoFraco` | 0,5 | peso do vizinho contra o vento |
| `limiarSubida` | 0,12 | excesso de pressão sobre o próprio nível para subir |
| `limiarDescida` | 0,95 | déficit de pressão sob o próprio nível para descer |
| `probDecaimento` | 0,015 | decaimento radioativo por geração |
| `limiarMorte` | 0,08 | pressão letal durante o vazamento |
| `limiarMorteResidual` | 0,80 | pressão letal depois do sarcófago |
| `probBrotar` | 0,05 | brotar grama, por vizinho com vegetação |
| `probCrescer1` | 0,006 | grama → arbusto |
| `probCrescer2` | 0,003 | arbusto → árvore |
| `vizinhosParaRachar` | 2 | o K da regra do concreto |
| `probRachar` | 0,012 | velocidade da rachadura |
| `RAIO_DA_USINA` | 4 | alcance do reator exposto, em células |

### Quatro decisões de modelagem

Cada uma resolve um problema que apareceu nas medições — não na intuição.

**1. A contaminação só avança enquanto a usina vaza.** A regra na forma "sobe se a média
dos vizinhos passa de um limiar" nunca se recupera, e o motivo é geométrico: o interior de
uma mancha sempre enxerga mais contaminação (média 3) que a frente de avanço (média
1,125). Logo *"um nível é alcançável"* e *"um nível se auto-sustenta"* são a mesma
condição — tudo o que a mancha conquista, ela mantém para sempre. Nenhum valor de limiar
escapa disso. A leitura física: o solo contaminado é um **reservatório**, não uma fonte.

**2. Os limiares são relativos ao nível da própria célula.** A pergunta vira *"a
vizinhança está mais contaminada do que eu?"*, e é isso que dá **gradiente** à mancha —
nível 1 na frente, 2 atrás, 3 no miolo. Com limiar absoluto, toda célula tocada subia
direto ao máximo e a pluma virava um polígono de cor única.

**3. O limiar que mata a vegetação depende da fase.** Durante o vazamento é a precipitação
radioativa caindo do ar; depois, só o resíduo no solo. Com um limiar único e baixo, cada
planta morta vira contaminação que mata a seguinte — uma onda que se alimenta sozinha e
devora a floresta muito depois do sarcófago.

**4. A natureza só recoloniza depois do sarcófago.** Antes, a paisagem é mantida; durante
o vazamento, a precipitação mata os brotos. Sem isso, cem gerações de operação normal
levam a vegetação de 63 % para 95 % do mapa e o acidente acontece sobre uma cidade já
engolida pelo mato.

---

## O mapa, gerado por outro autômato celular

O mapa inteiro sai da semente, e a ferramenta é uma **regra de maioria**: cada célula
passa a valer o que a maioria da sua vizinhança de Moore já vale. Repetida poucas vezes
sobre ruído puro, ela apaga os pixels soltos e faz emergirem manchas de contorno orgânico.
Vale registrar a simetria: **usamos um autômato celular para gerar o terreno do nosso
autômato celular**.

- **Floresta:** três máscaras suavizadas e sobrepostas — onde há mata, onde ela é lenhosa,
  onde vira árvore. Sortear o tipo célula a célula produziria os três verdes misturados
  pixel a pixel, o chuvisco que a suavização existe para evitar.
- **Cidade:** a mesma suavização sobre ruído *enviesado pela distância* de um centro
  sorteado, o que transforma uma nuvem de probabilidade em uma mancha fechada e irregular
  — um retângulo perfeito denunciaria o gerador.
- **Dentro dela:** malha de ruas, quarteirões com casas de 2x2 a 3x3 separadas por
  quintais de grama, prédios maiores no miolo, e a usina de 5x5 no quarteirão mais
  periférico.

**As ruas são asfalto sobre terra**, com estado `SOLO` e não `CONCRETO`. O concreto é
impermeável pela regra 5, e uma cidade toda de concreto seria uma ilha imune no meio da
contaminação, com os quintais lacrados por todos os lados. Com a malha viária permeável, a
contaminação entra na cidade pelas ruas — que é exatamente por onde ela entraria.

---

## Calibração

```bash
npm run calibrar
npm run calibrar -- geracoes=800 acidente=50 sarcofago=120 vento=norte
npm run calibrar -- limiarMorte=0.2 probDecaimento=0.03
```

Roda a simulação **sem interface** e imprime os indicadores a cada N gerações. Qualquer
parâmetro pode ser sobrescrito na linha de comando. Resultado com os padrões (200x125,
semente `retomada`, acidente na geração 100 e sarcófago na 160):

| Geração | Contaminado | Vegetação | Concreto |
| --- | --- | --- | --- |
| 0 | 0,0 % | 63,4 % | 4,5 % |
| 100 — *acidente* | 0,5 % | 63,3 % | 4,5 % |
| 120 | 8,8 % | 59,6 % | 4,3 % |
| 160 — *sarcófago* | 48,0 % | 37,0 % | 4,1 % |
| 200 | 41,4 % | 47,3 % | 4,1 % |
| 240 | 32,3 % | 47,7 % | 4,1 % |
| 280 | 19,8 % | 49,2 % | 4,1 % |
| 320 | 9,8 % | 52,1 % | 4,1 % |
| 400 | 1,5 % | 63,9 % | 4,0 % |
| 480 | 0,2 % | 80,9 % | 3,5 % |

O vazamento cobre quase metade do mapa e 90 % da contaminação some **194 gerações** depois
do sarcófago.

---

## Testes

```bash
npm test
```

| Arquivo | O que verifica |
| --- | --- |
| `contorno.test.ts` | O vizinho à esquerda da coluna 0 é a última coluna (periódico); fora da grade devolve `FORA_DA_GRADE` (fixo). |
| `vizinhanca.test.ts` | Von Neumann raio 1 tem 4 vizinhos e Moore raio 1 tem 8 (e 12/24 no raio 2); leitura correta nas bordas com cada contorno. |
| `jogoDaVida.test.ts` | O planador se desloca 1 célula na diagonal a cada 4 gerações, atravessa a borda e volta ao ponto de partida; bloco estável; pisca-pisca com período 2. |
| `reprodutibilidade.test.ts` | A mesma semente gera exatamente a mesma simulação, inclusive com regra probabilística. |
| `csv.test.ts` | O CSV tem uma linha por geração, as contagens somam o total de células e os percentuais batem com elas. |
| `cenarioAcidente.test.ts` | Cada uma das cinco regras isoladamente; o alcance ampliado da usina e o seu limite; a média equivalente em Von Neumann e Moore; o vento; a absorção; o concreto que só racha depois da evacuação; a contaminação que nunca aumenta sem fonte; o ciclo completo das três fases; e a geração procedural do mapa. |
| `arquitetura.test.ts` | Nenhum arquivo da engine referencia o navegador ou importa de fora do diretório. |

---

## Documentação complementar

- **[docs/regras.md](docs/regras.md)** — definição formal do autômato, tabelas de estados e
  transições e a lista completa de parâmetros, em formato pronto para colar no relatório.
- **[docs/experimentos.md](docs/experimentos.md)** — roteiro de comparações (Moore x Von
  Neumann, raio 1 x 2, contorno fixo x periódico, com e sem vento), com o que observar em
  cada uma.

---

## Sobre o trabalho

Este projeto foi desenvolvido no contexto de um **trabalho acadêmico em grupo**, de
disciplina de graduação, sobre autômatos celulares. **O código deste repositório é de
autoria de Gustavo Barbosa Lima** — engine, renderização, interface, testes e documentação.

## Licença

[MIT](LICENSE) © Gustavo Barbosa Lima

---

Desenvolvido por [Gustavo Dev](https://gustavodev.dev/).
