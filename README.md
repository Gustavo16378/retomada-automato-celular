# Retomada

Autômato celular 2D que simula **contaminação ambiental e recuperação da vegetação**
em uma cidade vista de cima, rodando inteiramente no navegador.

Enquanto a cidade está ativa, as fábricas emitem contaminação que se espalha pelo
solo e mata a vegetação. Ao abandonar a cidade, as fontes se apagam: a contaminação
decai geração após geração, a vegetação avança sobre o solo limpo e, com o tempo,
racha o concreto.

> **Status:** etapas 1 e 2 concluídas (engine + Jogo da Vida + testes; renderização e
> execução passo a passo). As regras do cenário da cidade, o painel completo e a
> exportação de dados são as etapas 3 e 4 — ver [Cronograma](#cronograma).

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
│   ├── regras.ts       regras de transição (Jogo da Vida; cidade na etapa 3)
│   ├── simulacao.ts    grade em Uint8Array, double buffering, estatísticas
│   ├── mapas.ts        condições iniciais (vazio, planador, sopa aleatória)
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

### Cenário cidade/contaminação — etapa 3

Resumo do que será implementado (os testes correspondentes já estão declarados como
pendentes em `testes/cenarioCidade.test.ts`):

Define-se a **pressão** de uma célula como a *média* ponderada do nível de
contaminação dos vizinhos (solo = 0, contaminado = 1 a 3, fábrica ativa = 3, demais =
0). Usar a média, e não a soma, é o que faz os mesmos limiares valerem para Von
Neumann e para Moore, que têm quantidades diferentes de vizinhos. O vento faz o
vizinho do lado de onde ele vem pesar 2x e o do lado oposto 0,5x; cada arbusto ou
árvore vizinho reduz a pressão (absorção).

1. **Fábrica** permanece fábrica. Com a cidade abandonada, não emite.
2. **Solo e contaminação (0..3):** pressão ≥ limiar de subida sobe um nível (máx. 3);
   pressão ≤ limiar de descida desce um nível (mín. 0); senão mantém.
3. **Solo limpo** sem contaminação na vizinhança vira grama com probabilidade
   proporcional ao número de vizinhos com vegetação.
4. **Vegetação (6..8):** com pressão ≥ limiar de morte vira contaminação leve; senão
   cresce (grama → arbusto → árvore, cada passo com sua probabilidade).
5. **Concreto** não recebe contaminação; com ao menos K vizinhos arbusto/árvore, vira
   grama com uma probabilidade de rachadura.

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
| `cenarioCidade.test.ts` | Casos do cenário da cidade, declarados como pendentes até a etapa 3. |

---

## Cronograma

- [x] **Etapa 1 — engine.** Estados, gerador com semente, vizinhanças, contornos,
      simulação com double buffering, Jogo da Vida e a suíte de testes.
- [x] **Etapa 2 — renderização e passo a passo.** Canvas via `ImageData`, laço de
      animação, play/pause, próxima geração, velocidade, contador, mapas iniciais,
      pincel básico e tema escuro responsivo.
- [ ] **Etapa 3 — regras do cenário cidade.** Pressão, vento, absorção, abandono da
      cidade e o mapa "Cidade" gerado proceduralmente.
- [ ] **Etapa 4 — interface completa.** Parâmetros editáveis, pincel com seleção de
      estado, estatísticas ao vivo e exportação em CSV e PNG.

---

Desenvolvido por [Gustavo Dev](https://gustavodev.dev/).
