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

## Painel administrativo

Abra `admin.html`. Ele controla vendas, clientes, caixa, estoque, custos e CMV.

| Aba | Para quê |
|---|---|
| **Painel** | Receita, CMV, lucro, ticket médio, saldo de caixa e gráficos |
| **Vendas** | Lançar cada venda, com cliente e forma de pagamento |
| **Clientes** | Cadastro com nome, WhatsApp e endereço, mais o histórico de compras |
| **Caixa** | Entradas e saídas de dinheiro por categoria |
| **Estoque** | Insumos, entradas, baixas e alerta de estoque mínimo |
| **Custos** | Quanto custa produzir cada item — é o que gera o CMV |
| **Backup** | Exportar e restaurar os dados |

### ⚠️ Onde os dados ficam

**No navegador do aparelho que você está usando. Não existe servidor.**

Isso significa que os lançamentos:

- não aparecem em outro celular ou computador;
- somem se você limpar os dados do navegador;
- não são vistos por mais ninguém — nem por quem abrir o `admin.html` pela
  internet, porque cada navegador só enxerga o que foi digitado nele.

**Baixe o backup com frequência** (aba Backup). É um arquivo `.json` que você
guarda no Drive ou manda pra si mesmo no WhatsApp, e que restaura tudo em
qualquer aparelho.

### Como o resultado é calculado

```
Receita − CMV                    = Lucro bruto
Lucro bruto − Despesas operacionais = Lucro líquido
```

Compra de mercadoria **não** entra como despesa operacional: ela sai do caixa na
hora da compra, mas só vira custo no resultado quando o produto é vendido, pelo
CMV. Contar nos dois lugares dobraria o custo e faria o lucro parecer menor.

O caixa é uma conta separada: entradas (vendas + aportes) − saídas (todas,
inclusive mercadoria).

## Estrutura

```
.
├── index.html          # Página do cardápio (o selo da marca é um SVG aqui dentro)
├── admin.html          # Painel administrativo
├── css/
│   ├── styles.css      # Visual do cardápio — preto, vermelho e creme da marca
│   └── admin.css       # Visual do painel
├── js/
│   ├── menu-data.js    # ⬅️ EDITE AQUI: itens, preços, entrega, WhatsApp
│   ├── app.js          # Carrinho, regras de entrega e envio pro WhatsApp
│   ├── admin-store.js  # Dados e contas do painel
│   └── admin.js        # Telas e gráficos do painel
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
- [ ] Comprimir as fotos da costela e da mandioca (2 a 3 MB cada, pesado no 4G).
- [ ] Trocar o selo em SVG pelo **arquivo original do logo**, se houver versão
      com fundo transparente.
- [ ] Definir a **chave Pix** em `LOJA.chavePix` (hoje vazia, então não aparece
      na mensagem do pedido).
- [ ] Preencher o **endereço da loja** em `LOJA.endereco`, se quiser mostrá-lo.
- [ ] Cadastrar o **custo de cada produto** na aba Custos do painel — sem isso o
      CMV fica zerado e o lucro aparece inflado.
