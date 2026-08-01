# Ligando o pagamento automático da InfinitePay

Este guia leva uns 15 minutos e é feito uma vez só. Não precisa saber programar
— é copiar, colar e clicar.

## O que vamos montar

```
Cliente monta o pedido no cardápio
        ↓
        └─→ Google Apps Script  →  InfinitePay  →  link de pagamento
                                                          ↓
                                          cliente paga (Pix ou cartão)
                                                          ↓
        ┌─────────────────  InfinitePay avisa que pagou  ─┘
        ↓
Apps Script confere se é verdade
        ↓
Grava na planilha  →  seu painel puxa a venda pronta
```

O Apps Script faz o papel de servidor. Sem ele nada disso funciona, porque a
InfinitePay não aceita ser chamada de dentro de uma página de internet.

---

## Passo 1 — Criar a planilha

1. Abra [sheets.new](https://sheets.new) (cria uma planilha em branco)
2. Dê o nome de **Vendas Brunão** no canto superior esquerdo

Não precisa criar coluna nenhuma. O programa monta tudo sozinho.

## Passo 2 — Abrir o editor de código

Na planilha: menu **Extensões** → **Apps Script**.

Abre uma aba nova com um editor e um arquivo `Código.gs` contendo umas
três linhas de exemplo.

## Passo 3 — Colar o código

1. **Apague tudo** que estiver no editor (`Ctrl` + `A`, depois `Delete`)
2. Abra o arquivo `Codigo.gs` desta pasta, copie **todo** o conteúdo
3. Cole no editor
4. Salve (`Ctrl` + `S`)

## Passo 4 — Preencher seus dados

Bem no começo do código tem um bloco `CONFIG`. Ajuste três coisas:

```js
var CONFIG = {
  HANDLE: 'obrunaocostelanobafo',
  TOKEN_PAINEL: 'TROQUE-POR-UMA-SENHA-LONGA-SUA',
  URL_SITE: 'https://brunaocostelanobafo-oss.github.io',
  ABA: 'Vendas',
};
```

- **HANDLE** — sua InfiniteTag, sem o `$`. Já deixei preenchida; confira se está certa.
- **TOKEN_PAINEL** — **invente uma senha sua**, longa, tipo `costela-no-bafo-2026-kj38fh`.
  É o que impede estranhos de lerem seu faturamento.
  ⚠️ **Não use a senha do seu e-mail, do banco ou da InfinitePay.**
- **URL_SITE** — já está certo.

Salve de novo (`Ctrl` + `S`).

## Passo 5 — Publicar

1. Botão azul **Implantar** (canto superior direito) → **Nova implantação**
2. Clique na engrenagem ⚙️ ao lado de "Selecionar tipo" → **App da Web**
3. Preencha:

   | Campo | Valor |
   |---|---|
   | Descrição | `Integração InfinitePay` |
   | Executar como | **Eu** (seu e-mail) |
   | Quem pode acessar | **Qualquer pessoa** |

   ⚠️ O "Qualquer pessoa" é obrigatório — é assim que a InfinitePay
   consegue avisar que o cliente pagou. Seus dados continuam protegidos
   pelo token que você inventou.

4. **Implantar**
5. Vai pedir autorização: **Autorizar acesso** → escolha sua conta Google

   Vai aparecer uma tela assustadora dizendo *"O Google não verificou este app"*.
   É normal — o app é seu, você acabou de escrever. Clique em **Avançado** →
   **Acessar Vendas Brunão (não seguro)**.

6. **Copie a URL do app da Web.** É um endereço longo terminando em `/exec`.
   Guarde — você vai precisar dele no próximo passo.

## Passo 6 — Testar

No editor, escolha a função `testarConfiguracao` na lista de cima e clique
em **Executar**. Embaixo aparece o resultado.

Se disser **"Configuração ok"**, está tudo certo.
Se listar problemas, corrija o que ele apontar e rode de novo.

## Passo 7 — Ligar no cardápio

Me mande a URL que você copiou no passo 5. Eu coloco no site e testo a ponta a
ponta com você.

Se preferir fazer sozinha: abra `js/menu-data.js` e preencha o bloco `INTEGRACAO`
com a URL e o token.

---

## Quando algo der errado

**"Não consigo criar o link de pagamento"**
Confira a HANDLE. É seu nome de usuário no app da InfinitePay, sem o `$`.

**A venda não aparece no painel**
Abra a planilha e veja a aba `Vendas`. Se a linha estiver como `pendente`, o
cliente gerou o link mas não pagou. Se nem linha existe, veja a aba `Erros` —
o programa anota lá tudo que deu problema.

**Um pedido pago na InfinitePay não chegou na planilha**
Três causas possíveis, nesta ordem:

1. **O link foi gerado fora do cardápio** (pelo app da InfinitePay, por
   exemplo). Nesse caso não há aviso configurado e o pedido nunca chega —
   é esperado, e a venda precisa ser lançada à mão no painel.
2. **O aviso chegou mas não passou na conferência.** Vai estar na aba `Erros`.
3. **O aviso não chegou.** A linha fica como `pendente` na aba `Vendas`.

Para ver os dois últimos de uma vez, abra no navegador:
`SUA_URL/exec?acao=diagnostico&token=SEU_TOKEN`

**Mudei o código e nada mudou**
Toda alteração precisa de nova publicação: **Implantar** → **Gerenciar
implantações** → ✏️ (lápis) → Versão: **Nova versão** → **Implantar**.
A URL continua a mesma.

---

## Sobre segurança

Duas coisas que vale você saber.

**O aviso de pagamento é conferido antes de virar venda.** A InfinitePay não
assina o webhook, e o endereço dele fica visível no pedido. Se alguém
descobrisse esse endereço, poderia mandar um "pagamento aprovado" falso. Por
isso o programa não acredita no aviso: para cada um, ele pergunta de volta para
a InfinitePay se aquele pagamento existe mesmo, e só grava se ela confirmar.

**O valor gravado é o que a InfinitePay confirmou**, nunca o que veio no aviso.

**O token protege seu faturamento.** Sem ele, ninguém lê as vendas — mesmo
sabendo a URL. Guarde-o como guarda uma senha, e não coloque em lugar público.
