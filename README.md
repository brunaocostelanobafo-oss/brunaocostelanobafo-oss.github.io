# 🔥 Brunão Costela no Bafo — Cardápio Digital

Cardápio digital online do **Brunão Costela no Bafo**. O cliente monta o pedido pelo
celular e finaliza direto no WhatsApp, com a mensagem já pronta e formatada.

## Como funciona

1. O cliente abre o link do cardápio no celular.
2. Escolhe os itens e monta o carrinho.
3. Preenche nome, entrega ou retirada e forma de pagamento.
4. Clica em **Enviar pedido** → abre o WhatsApp da loja com o pedido escrito.

Sem app para instalar, sem cadastro, sem taxa de marketplace.

## Rodando na sua máquina

O projeto é HTML, CSS e JavaScript puro — não tem build nem instalação.
Basta abrir o arquivo `index.html` no navegador.

Se preferir servir por HTTP (recomendado — o navegador bloqueia algumas coisas
em arquivos abertos direto do disco):

```bash
npx --yes serve --listen 8000 .
```

Depois acesse `http://localhost:8000`.

## Como a entrega funciona

- **Delivery aos sábados, domingos e feriados**, das 11h às 14h.
- **Reserva confirmada de segunda a sexta ganha a entrega grátis.**

A página calcula tudo sozinha: mostra se estamos entregando, em reserva ou fora
do horário, monta a lista das próximas datas de entrega (incluindo feriados) e
tira ou cobra a taxa conforme o dia em que o cliente fez o pedido.

## Estrutura

```
.
├── index.html          # Página do cardápio (o selo da marca é um SVG aqui dentro)
├── css/
│   └── styles.css      # Todo o visual — preto, vermelho e creme da marca
├── js/
│   ├── menu-data.js    # ⬅️ EDITE AQUI: itens, preços, entrega, WhatsApp
│   └── app.js          # Carrinho, regras de entrega e envio pro WhatsApp
└── assets/             # Fotos dos produtos
```

## Ligando e desligando a entrega grátis

Em `js/menu-data.js`, dentro de `LOJA.reserva`:

```js
reserva: {
  ativa: true,
  freteGratis: true,   // true = reserva de segunda a sexta não paga entrega
  diasSemana: [1, 2, 3, 4, 5],
}
```

Trocar `freteGratis` para `false` desliga a promoção e todo mundo passa a pagar
a taxa normal. Nada mais precisa ser alterado — o resumo do pedido e a mensagem
do WhatsApp se ajustam sozinhos.

## Feriados

A lista fica em `LOJA.feriados`, no formato `AAAA-MM-DD`. Feriado conta como dia
de entrega, igual sábado e domingo. **Atualize a lista no começo de cada ano.**

## Editando o cardápio

Tudo que muda no dia a dia está em **um único arquivo**: `js/menu-data.js`.
Você não precisa mexer em mais nada.

### Trocar o WhatsApp da loja

No topo do arquivo, em `LOJA.whatsapp`. Use o formato internacional,
só números — código do país + DDD + número:

```js
whatsapp: '5511999999999',  // 55 + 11 + 999999999
```

### Mudar um preço

Preços ficam em centavos, para não dar erro de arredondamento.
`5990` significa R$ 59,90:

```js
{ nome: 'Costela no Bafo — 500g', preco: 5990 }
```

### Esgotar um item do dia

Marque `disponivel: false`. Ele continua aparecendo no cardápio, mas apagado,
com o aviso "Esgotado hoje" e sem o botão de adicionar:

```js
{ nome: 'Fraldinha na Brasa', preco: 5490, disponivel: false }
```

### Adicionar um item novo

Copie uma linha existente dentro da categoria e ajuste. Só `nome` e `preco`
são obrigatórios.

### Mudar o horário ou os dias de entrega

Em `LOJA.entrega`. `diasSemana` usa 0 = domingo … 6 = sábado.

```js
entrega: {
  diasSemana: [0, 6],                        // domingo e sábado
  horario: { abre: '11:00', fecha: '14:00' },
}
```

## Publicando (GitHub Pages)

Com o repositório no GitHub, vá em **Settings → Pages**, escolha a branch
`main` e a pasta `/ (root)`. Em alguns minutos o cardápio fica no ar num
endereço público, de graça — é esse link que você manda pros clientes.

## Pendências

Itens, preços, WhatsApp e identidade visual já são os reais. Ainda falta:

- [ ] Confirmar o **valor da taxa de entrega** (hoje em R$ 10,00, chutado).
- [ ] Fotos da **farofa** e do **creme de alho**.
- [ ] Trocar o selo em SVG pelo **arquivo original do logo**, se houver versão
      com fundo transparente.
- [ ] Definir a **chave Pix** em `LOJA.chavePix` (hoje vazia, então não aparece
      na mensagem do pedido).
- [ ] Preencher o **endereço da loja** em `LOJA.endereco`, se quiser mostrá-lo.
