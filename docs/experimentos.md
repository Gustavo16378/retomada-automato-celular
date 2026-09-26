# Roteiro de experimentos

Comparações sugeridas para o relatório. Todas partem do mesmo ponto — **mapa "Cidade e
usina", semente `retomada`** — e mudam **uma variável de cada vez**. É o que torna a
comparação honesta: com duas mudanças simultâneas não há como saber qual delas causou a
diferença.

## Como executar

Cada experimento pode ser feito de dois jeitos.

**Na página**, ajustando os controles e usando os botões `⤓ CSV` e `⤓ PNG`. O CSV traz
uma linha por geração; o PNG é a imagem da grade no instante do clique. O nome dos dois
arquivos guarda a semente e a geração.

**Na linha de comando**, sem interface, quando o que interessa são só os números:

```bash
npm run calibrar                                   # padrões
npm run calibrar -- vento=norte                    # uma variável mudada
npm run calibrar -- geracoes=800 sarcofago=200     # outro cronograma
npm run calibrar -- semente=cidade-02 intervalo=10 # outra semente, mais amostras
```

O script aceita `largura`, `altura`, `geracoes`, `acidente`, `sarcofago`, `intervalo`,
`semente`, `vento` e **qualquer parâmetro do cenário** pelo nome.

> **Atenção:** a vizinhança, o raio e o contorno não são argumentos do script — eles são
> fixos nele (Moore, raio 1, contorno fixo). Os experimentos 1, 2 e 3 abaixo são feitos
> **na página**, exportando o CSV.

## Protocolo sugerido

1. Carregue o mapa com a semente `retomada` (botão `↺ Reiniciar` garante o estado inicial).
2. Ajuste a variável do experimento.
3. Avance 100 gerações em operação normal.
4. Clique em `☢ Acidente` e avance 60 gerações.
5. Clique em `🧱 Construir sarcófago` e avance até a geração 500.
6. Exporte o CSV. Exporte também o PNG nos instantes do acidente, do sarcófago e do fim.

O gráfico do painel marca com linhas tracejadas as gerações em que você acionou cada
fase, o que ajuda a alinhar as curvas de execuções diferentes.

---

## Experimento 1 — Von Neumann x Moore

**Variável:** seletor *Vizinhança*. **Constantes:** raio 1, contorno fixo, sem vento.

Von Neumann tem 4 vizinhos (só os ortogonais); Moore tem 8 (inclui as diagonais).

**O que observar:**

- **A forma da mancha.** Em Von Neumann a contaminação avança por losangos, porque a
  distância que ela enxerga é a de Manhattan; em Moore a frente é aproximadamente
  quadrada (distância de Chebyshev). Essa diferença de *geometria da métrica* é um dos
  resultados clássicos de autômatos celulares e aparece de forma muito clara aqui.
- **A velocidade.** Moore avança mais rápido, porque a mancha ganha as diagonais.
- **Os limiares continuam valendo nos dois.** Isso não é acaso: a pressão é uma *média
  ponderada*, dividida pela soma dos pesos. Se fosse uma soma, o mesmo `limiarSubida`
  precisaria ser o dobro em Moore. Vale testar essa afirmação: um entorno uniforme de
  contaminação grave produz pressão 3 nas duas vizinhanças.
- **A absorção, porém, muda.** Ela é descontada *por vizinho* lenhoso, sem normalizar —
  então uma cortina de árvores bloqueia mais em Moore, onde há mais vizinhos. Compare a
  resistência da floresta nas duas configurações.

**Números para a tabela:** % contaminado na geração 160 (fim do vazamento) e geração em
que 90 % da contaminação desaparece.

---

## Experimento 2 — raio 1 x raio 2

**Variável:** seletor *Raio*. **Constantes:** Moore, contorno fixo, sem vento.

Moore raio 2 tem 24 vizinhos em vez de 8.

**O que observar:**

- **A frente fica mais lisa.** Com mais vizinhos, a média é calculada sobre uma amostra
  maior, e os detalhes de uma célula pesam menos: a borda da mancha perde a
  irregularidade.
- **O alcance por geração aumenta**, mas *menos do que o dobro*. Vale medir em vez de
  supor: a velocidade não é proporcional ao raio, porque o que limita o avanço é o
  limiar sobre a média, não a distância alcançada.
- **A floresta resiste mais.** Com 24 vizinhos, uma célula no meio da mata tem muito
  mais vizinhos lenhosos, e a absorção é multiplicada por esse número.
- **O custo computacional triplica.** Observe o contador de gerações com a velocidade no
  máximo: é uma demonstração direta de que a complexidade é O(células × vizinhos).

---

## Experimento 3 — contorno fixo x periódico

**Variável:** seletor *Contorno*. **Constantes:** Moore, raio 1, sem vento.

Com contorno **fixo**, o que está fora da grade conta como solo limpo; com **periódico**,
a grade se fecha em um toro e a borda direita encosta na esquerda.

**O que observar:**

- **A borda como sumidouro.** No contorno fixo, as células da beirada têm parte dos
  vizinhos "limpos por definição", o que dilui a pressão e faz a contaminação se
  dissipar ali. É por isso que ele é o padrão do cenário: o entorno do mapa representa
  o mundo lá fora.
- **A mancha dá a volta.** No periódico, a contaminação que sai por um lado reaparece no
  outro, e a mancha acaba encontrando a si mesma. Compare o % contaminado máximo: no
  periódico ele é sensivelmente maior.
- **Efeito sobre a recuperação.** Sem a diluição da borda, o resíduo demora mais para
  sumir. Meça a geração em que a contaminação chega a zero nas duas configurações.
- **Para ver o contorno isolado**, use o mapa *Planador* com a regra do Jogo da Vida: no
  periódico o planador atravessa a borda e reaparece do outro lado; no fixo ele bate na
  parede e se desfaz.

---

## Experimento 4 — o vento

**Variável:** seletor *Vento* (nenhum, norte, sul, leste, oeste). **Constantes:** Moore,
raio 1, contorno fixo.

O vizinho do lado de onde o vento vem pesa 2x; o do lado oposto, 0,5x.

**O que observar:**

- **A pluma deixa de ser radial.** Sem vento a mancha cresce aproximadamente igual em
  todas as direções; com vento ela se alonga na direção para onde ele sopra. Exporte o
  PNG no fim do vazamento para cada direção — é a comparação mais visual do conjunto.
- **A área total contaminada CAI.** É contraintuitivo e vale destacar no relatório: o
  vento não cria contaminação, apenas redistribui a mesma quantidade de pressão. Ao
  concentrar o avanço em uma direção, ele reduz o avanço nas outras três, e o resultado
  líquido é uma mancha menor em área e mais longa em alcance.
- **Depende de onde a usina caiu.** Como o reator fica na periferia da cidade, um vento
  que sopre *da* usina *para* a cidade devasta a área urbana; o oposto joga a
  contaminação na mata e poupa as construções. Anote a posição da usina (visível pelo
  bloco ciano) antes de escolher a direção.
- **A soma dos pesos garante a comparação.** Como a pressão é dividida pela soma dos
  pesos, e não por 8, o vento muda a *distribuição* da pressão sem mudar a escala dela —
  então os mesmos limiares continuam significando a mesma coisa.

---

## Experimento 5 — reprodutibilidade (controle)

Não é uma comparação, é a verificação que dá validade a todas as outras.

1. Rode o cenário completo com a semente `retomada` e exporte o CSV.
2. Clique em `↺ Reiniciar` e repita exatamente os mesmos passos.
3. Compare os dois arquivos: devem ser **idênticos**, linha por linha.

Isso funciona porque nada no projeto usa `Math.random()` dentro da simulação: todo
sorteio vem de um gerador com semente (mulberry32), e a varredura da grade é sempre na
mesma ordem. É o que permite afirmar, no relatório, que uma diferença observada entre
dois experimentos veio da variável alterada e não do acaso.

Em seguida repita com `cidade-02` e `xyz-99` para confirmar que as conclusões não
dependem de um mapa em particular.

---

## Sugestões de variações de parâmetro

Abertos no bloco *Parâmetros do cenário*, com a simulação rodando:

| Ajuste | O que costuma acontecer |
| --- | --- |
| `limiarMorteResidual` para menos de 0,2 | a onda de morte da vegetação não para mais depois do sarcófago; a floresta é consumida por inteiro |
| `probDecaimento` para 0,05 | a recuperação encurta para menos de 80 gerações — rápido demais para ser observada |
| `absorcao` para 0,05 | a floresta densa passa a bloquear a contaminação; a mancha contorna as manchas de mata |
| `vizinhosParaRachar` para 1 | a cidade se desfaz em poucas dezenas de gerações |
| `emissaoUsina` para 0 | nada acontece no acidente: é o controle negativo do experimento |
