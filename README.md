# Retomada

Autômato celular 2D que simula **contaminação ambiental e recuperação da vegetação**
em uma cidade vista de cima, rodando inteiramente no navegador.

Enquanto a cidade está ativa, as fábricas emitem contaminação que se espalha pelo
solo e mata a vegetação. Ao abandonar a cidade, as fontes se apagam: a contaminação
decai geração após geração, a vegetação avança sobre o solo limpo e, com o tempo,
racha o concreto.

> **Status:** etapas 1 a 3 concluídas (engine, Jogo da Vida, renderização, regras do
> cenário da cidade e calibração). O painel completo com todos os parâmetros, o pincel
> por estado e a exportação de dados são a etapa 4 — ver [Cronograma](#cronograma).

---

## Como rodar

Requisitos: Node.js 20 ou superior.

```bash
npm install     # instala as dependências
npm run dev     # ambiente de desenvolvimento em http://localhost:5173
npm test        # roda a suíte de testes da engine
npm run build   # checagem de tipos + build de produção em dist/
npm run preview # serve o build de produção localmente
```

| Script | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com recarga instantânea. |
| `npm test` | Vitest, apenas sobre `src/engine`. |
| `npm run test:watch` | Vitest em modo observador. |
| `npm run typecheck` | `tsc --noEmit` em modo estrito. |
| `npm run build` | Checagem de tipos seguida do empacotamento. |
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
│   ├── regras.ts       regras de transição: cenário cidade e Jogo da Vida
│   ├── simulacao.ts    grade em Uint8Array, double buffering, estatísticas
│   ├── mapas.ts        condições iniciais (cidade procedural, planador, sopa…)
│   └── index.ts        superfície pública da engine
├── render/     desenho no canvas
│   ├── paleta.ts       cores de cada estado (hex para a UI, bytes para o canvas)
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

1. **A engine é testável sem navegador.** Toda a suíte roda no Node, em menos de um
   segundo, sem jsdom nem canvas simulado.
2. **A dependência é de mão única:** `ui` e `render` conhecem a `engine`; a `engine`
   não conhece ninguém. Dá para trocar o canvas por WebGL, ou a página por um script
   de linha de comando que exporta CSV, sem tocar na simulação.
3. **A regra vira dado, não código espalhado.** Uma regra é um objeto com um método
   `aplicar(contexto)`; acrescentar uma nova não muda nenhum tipo existente.

Essa fronteira não fica só na documentação: `testes/arquitetura.test.ts` lê os
arquivos de `src/engine` e **falha** se algum deles mencionar `document`, `window`,
`ImageData` ou importar algo de fora do diretório.

### Decisões de implementação que valem destaque

- **Grade em `Uint8Array`.** São 9 estados, então cada célula cabe em um byte; uma
  grade de 160x100 ocupa 16 KB, e as duas (atual e próxima) cabem no cache do
  processador.
- **Double buffering.** A regra lê da grade atual e a simulação escreve na próxima;
  no fim da geração as duas trocam de papel. É o que garante a atualização
  *síncrona* exigida por um autômato celular — nenhuma célula já recalculada
  influencia as que ainda serão. A troca é O(1), sem cópia de memória.
- **Zero alocação no laço principal.** O contexto passado para a regra e o leitor de
  vizinhança são objetos únicos, reposicionados célula a célula. Criar objetos novos
  significaria ~16 mil alocações por geração, a até 60 gerações por segundo.
- **Renderização por `ImageData`.** Um `fillRect` por célula seriam 16 mil chamadas ao
  contexto 2D por quadro. Em vez disso, os pixels são escritos de uma vez em um
  `ImageData` do tamanho exato da grade, que é depois ampliado para a tela com um
  único `drawImage`, com suavização desligada.
- **Laço com acumulador de tempo.** `requestAnimationFrame` desenha uma vez por
  quadro e o acumulador decide quantas gerações cabem no intervalo, com teto por
  quadro — a velocidade em gerações por segundo é respeitada tanto em 60 Hz quanto
  em 144 Hz, e a página não trava ao voltar de segundo plano.

---

## Os estados

| Valor | Estado | Cor |
| --- | --- | --- |
| 0 | Solo limpo | marrom escuro |
| 1 | Contaminação leve | lima tóxico |
| 2 | Contaminação moderada | ocre |
| 3 | Contaminação grave | roxo |
| 4 | Fábrica | vermelho |
| 5 | Concreto | cinza |
| 6 | Grama | verde claro |
| 7 | Arbusto | verde médio |
| 8 | Árvore | verde escuro |

A ordem dos valores não é arbitrária: 0..3 formam a escala de contaminação e 6..8 a
escala de vegetação, o que transforma "subir um nível" em uma soma em vez de uma
tabela de transição.

---

## As regras

### Jogo da Vida (B3/S23) — implementada

A regra clássica de Conway, sobre o mesmo alfabeto de estados: **viva** é a grama e
**morta** é o solo limpo.

- Uma célula morta com exatamente **3** vizinhas vivas nasce.
- Uma célula viva com **2 ou 3** vizinhas vivas sobrevive; nos demais casos morre
  (solidão ou superpopulação).

Ela está aqui por dois motivos: é o autômato celular de referência, que qualquer
leitor reconhece, e funciona como teste de integração da engine inteira — se o
planador se desloca corretamente, então vizinhança, contorno, atualização síncrona e
ordem de varredura estão todos corretos.

### Cenário cidade/contaminação

A **pressão** de uma célula é a *média ponderada* do nível de contaminação dos
vizinhos, descontada a absorção da vegetação lenhosa:

```
pressão = Σ(peso_vizinho × nível_vizinho) / Σ(peso_vizinho)  −  absorção × nº de vizinhos arbusto/árvore
```

Os níveis: solo = 0, contaminado = 1 a 3, fábrica ativa = `emissaoFabrica`, concreto e
vegetação = 0. Dividir pela **soma dos pesos** — e não pela quantidade de vizinhos — é
o que mantém os mesmos limiares válidos em Von Neumann, em Moore e com qualquer vento:
o resultado continua sendo uma média na escala 0..3.

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
| **Fábrica** | sempre | Fábrica |
| **Solo / contaminado** (0–3) | cidade ativa e pressão ≥ `limiarSubida`, nível < 3 | nível **+1** |
| | pressão ≤ `limiarDescida` | nível **−1** (mín. 0) |
| | senão | nível **−1** com prob. `probDecaimento` |
| **Solo** (0) | continuou em 0, nenhum vizinho contaminado, sorteio com p = `probBrotar` × nº vizinhos com vegetação | Grama |
| **Vegetação** (6–8) | pressão ≥ `limiarMorte` | Contaminado leve |
| Grama | senão, prob. `probCrescer1` | Arbusto |
| Arbusto | senão, prob. `probCrescer2` | Árvore |
| **Concreto** | ≥ `vizinhosParaRachar` vizinhos arbusto/árvore, prob. `probRachar` | Grama |
| | senão | Concreto (nunca recebe contaminação) |

#### Duas decisões de modelagem que valem explicação

A regra na forma "sobe se a média dos vizinhos passa de um limiar" **não se recupera
nunca**, e isso não é questão de calibrar melhor — é geometria. O interior de uma
mancha sempre enxerga mais contaminação (média 3, todos os vizinhos no máximo) do que
a frente de avanço (média 1,125, só três vizinhos contaminados). Ou seja, *"um nível é
alcançável"* e *"um nível se auto-sustenta"* são exatamente a mesma condição: tudo o
que a mancha conquista, ela também mantém para sempre. Foi verificado com o script de
calibração, tanto com limiar absoluto quanto com limiar relativo ao próprio nível.

Por isso duas linhas fogem do enunciado original:

1. **A contaminação só avança enquanto a cidade emite.** O solo contaminado é um
   *reservatório*, não uma fonte: ele empurra contaminação para os lados enquanto há
   emissão nova chegando, e desligadas as fábricas o que restou apenas se degrada no
   lugar.
2. **`probDecaimento`**, a degradação própria da contaminação. É ela que limpa o miolo
   da mancha, onde a pressão é alta demais para a descida por vizinhança — que só
   acontece nas bordas, junto ao solo limpo.

Há ainda uma condição de escala que aparece na prática: a regra 3 só faz brotar grama
ao lado de vegetação já existente, então a faixa verde da borda precisa **sobreviver**
à fase industrial. Por isso o gerador coloca as fábricas na região central do mapa: em
uma grade pequena, ou com as fábricas perto da borda, a mancha esteriliza tudo e a
recuperação fica matematicamente impossível.

#### Parâmetros

Todos ficam em um objeto só (`ParametrosCidade`), compartilhado com a interface: mexer
em um controle vale já na geração seguinte, sem reconstruir a regra.

| Parâmetro | Padrão | O que faz |
| --- | --- | --- |
| `emissaoFabrica` | 3 | nível emitido por uma fábrica ativa |
| `limiarSubida` | 0,35 | um vizinho grave em Moore dá 3/8 = 0,375: basta para avançar |
| `limiarDescida` | 0,15 | vizinhança quase limpa faz decair 1 nível por geração |
| `probDecaimento` | 0,03 | degradação própria; é o motor da recuperação |
| `limiarMorte` | 0,60 | a vegetação resiste a 1 vizinho grave e morre com 2 |
| `absorcao` | 0,02 | desconto na pressão por vizinho arbusto/árvore |
| `probBrotar` | 0,05 | por vizinho com vegetação |
| `probCrescer1` | 0,030 | grama → arbusto |
| `probCrescer2` | 0,015 | arbusto → árvore |
| `vizinhosParaRachar` | 2 | o K da regra do concreto |
| `probRachar` | 0,012 | velocidade com que a mata racha o concreto |
| `pesoVentoForte` / `pesoVentoFraco` | 2 / 0,5 | pesos do vento |

### Calibração

```bash
npm run calibrar
npm run calibrar -- geracoes=600 abandono=150 vento=norte probDecaimento=0.05
```

Roda a simulação **sem interface** e imprime os indicadores a cada N gerações. Qualquer
parâmetro pode ser sobrescrito na linha de comando, o que permite comparar cenários sem
editar código. Foi com ele que os valores acima foram escolhidos.

Resultado com os padrões (160x100, semente `retomada`, abandono na geração 100):

| Geração | Contaminado | Vegetação | Concreto |
| --- | --- | --- | --- |
| 0 | 0,0 % | 23,6 % | 25,9 % |
| 30 | 16,2 % | 46,7 % | 25,9 % |
| 100 — *abandono* | 58,6 % | 14,3 % | 25,3 % |
| 140 | 50,2 % | 14,2 % | 25,2 % |
| 200 | 20,5 % | 15,2 % | 25,1 % |
| 238 | 5,9 % | 19,4 % | 25,1 % |
| 300 | 0,3 % | 38,9 % | 24,9 % |
| 400 | 0,0 % | 63,2 % | 22,0 % |

Os dois alvos do enunciado ficam atendidos: a contaminação é claramente visível na
geração 30 e 90 % dela some 138 gerações depois do abandono. O script também é a prova
prática de que a engine não depende do navegador — é a mesma simulação do canvas
rodando no Node, sem nenhuma adaptação.

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
| `arquitetura.test.ts` | Nenhum arquivo da engine referencia o navegador ou importa de fora do diretório. |
| `cenarioCidade.test.ts` | Cada uma das cinco regras do cenário isoladamente; a média ponderada equivalente em Von Neumann e Moore; o vento; a absorção; a contaminação nunca aumentando com a cidade abandonada; e a recuperação completa de uma cidade inteira. |

---

## Cronograma

- [x] **Etapa 1 — engine.** Estados, gerador com semente, vizinhanças, contornos,
      simulação com double buffering, Jogo da Vida e a suíte de testes.
- [x] **Etapa 2 — renderização e passo a passo.** Canvas via `ImageData`, laço de
      animação, play/pause, próxima geração, velocidade, contador, mapas iniciais,
      pincel básico e tema escuro responsivo.
- [x] **Etapa 3 — regras do cenário cidade.** Pressão, vento, absorção, abandono da
      cidade, o mapa "Cidade" gerado proceduralmente e o script de calibração.
- [ ] **Etapa 4 — interface completa.** Parâmetros editáveis, pincel com seleção de
      estado, estatísticas ao vivo e exportação em CSV e PNG.

---

Desenvolvido por [Gustavo Dev](https://gustavodev.dev/).
