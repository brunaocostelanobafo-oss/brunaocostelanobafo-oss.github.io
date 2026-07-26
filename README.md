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

## Estrutura

```
.
├── index.html          # Página do cardápio
├── css/
│   └── styles.css      # Todo o visual
└── js/
    ├── menu-data.js    # ⬅️ EDITE AQUI: itens, preços, horários, WhatsApp
    └── app.js          # Carrinho, formulário e envio pro WhatsApp
```

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

### Mudar horário de funcionamento

Em `LOJA.horarios`. A página calcula sozinha se está **Aberto** ou **Fechado**
e mostra o aviso no topo. `null` = fechado o dia inteiro.

```js
horarios: {
  0: null,                      // domingo fechado
  5: { abre: '18:00', fecha: '23:59' },  // sexta
}
```

## Publicando (GitHub Pages)

Com o repositório no GitHub, vá em **Settings → Pages**, escolha a branch
`main` e a pasta `/ (root)`. Em alguns minutos o cardápio fica no ar num
endereço público, de graça — é esse link que você manda pros clientes.

## Aviso sobre os dados atuais

Os itens, preços e o número de WhatsApp neste repositório são **exemplos**
para o cardápio já funcionar de cara. Troque pelos dados reais da loja
antes de divulgar o link.
