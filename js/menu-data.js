/*
 * DADOS DO CARDÁPIO — Brunão Costela no Bafo
 * ------------------------------------------
 * Este é o único arquivo que você precisa editar no dia a dia.
 *
 * Preços em CENTAVOS: 8990 = R$ 89,90 (evita erro de arredondamento).
 * Item esgotado: adicione `disponivel: false`.
 */

const LOJA = {
  nome: 'Brunão Costela no Bafo',
  tagline: 'Seu almoço merece uma costela no bafo.',
  selo: 'Feito na lenha!',
  desde: '2021',

  // Código do país + DDD + número, só dígitos. (35) 99766-7164
  whatsapp: '5535997667164',
  whatsappVisivel: '(35) 99766-7164',

  instagram: 'brunaocostelanobafo',

  // Aparece na capa do cardápio e nas informações da loja.
  cidade: 'Varginha · MG',

  // Endereço de retirada. Aparece no rodapé e em "Informações da loja".
  // Deixe vazio para esconder.
  endereco: 'Rua Adelina Garcia Chagas, 425 — Rio Verde',

  taxaEntrega: 1000,

  /* Agendar um horário certo dentro da janela de entrega, em vez de
     esperar a rota chegar. Custa à parte. Deixe `ativo: false` para
     não oferecer. */
  agendamentoHorario: {
    ativo: false,
    taxa: 800,

    // De quantos em quantos minutos os horários são oferecidos.
    // Os horários saem sozinhos da janela de entrega definida abaixo,
    // então mudar o horário da rota muda a lista junto.
    intervaloMinutos: 30,
  },

  /* ---------------------------------------------------------------------
   * PAGAMENTO ONLINE (InfinitePay)
   *
   * Com `ativa: true`, o cliente paga na hora do pedido e a venda cai
   * sozinha no painel. Com `false`, o cardápio volta a mandar o pedido
   * pelo WhatsApp e você lança na mão.
   *
   * A URL sai da implantação do Apps Script — veja
   * integracao/apps-script/CONFIGURACAO.md
   * ------------------------------------------------------------------- */
  pagamentoOnline: {
    ativa: true,
    urlScript: 'https://script.google.com/macros/s/AKfycbz2qeJ-xuAXrd_whJOqJEI_uYyW3JYgvJiaM49SUeEA8sHfRzPXLlyj6xqjzFTrwzqp/exec',
  },

  /* Instruções mostradas na página de pós-pagamento. Cada item é um
     parágrafo. Edite à vontade — é texto puro. */
  textoEntrega: [
    'Para as reservas antecipadas trabalhamos com uma única rota, realizada entre 11h e 14h, seguindo a ordem das reservas.',
    'Assim que a rota começar, avisaremos pelo WhatsApp.',
  ],

  // Pedido mínimo em centavos. Use 0 para não exigir mínimo.
  pedidoMinimo: 0,

  // Deixe vazio para não enviar a chave na mensagem do pedido.
  chavePix: '',

  formasPagamento: ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito'],

  /* ---------------------------------------------------------------------
   * ENTREGA
   * Delivery aos sábados, domingos e feriados, das 11h às 14h.
   * diasSemana: 0 = domingo … 6 = sábado.
   * ------------------------------------------------------------------- */
  entrega: {
    diasSemana: [0, 6],
    horario: { abre: '11:00', fecha: '14:00' },

    /* Teto de quantas datas mostrar — não "quantas sempre aparecem".
       A lista para sozinha assim que a sequência de dias de entrega
       quebra (ex.: sábado e domingo normais nunca chegam a 3, porque
       segunda não é dia de entrega). Esse teto só importa quando a
       sequência é mais longa que o normal, como um feriado colado no
       fim de semana — por isso 3, para caber sábado + domingo + a
       segunda de feriado (07/09) nessa semana específica. */
    datasOferecidas: 3,
  },

  /* ---------------------------------------------------------------------
   * RESERVA ANTECIPADA (ENCOMENDA)
   *
   * Reservas confirmadas de segunda a sexta ganham a entrega grátis.
   *
   * >>> É AQUI QUE VOCÊ ADMINISTRA A RETIRADA DO FRETE <<<
   *
   *   freteGratis: true   → reserva feita de segunda a sexta não paga entrega
   *   freteGratis: false  → todo mundo paga a taxa normal (promoção desligada)
   *
   * `diasSemana` define quais dias dão direito ao benefício.
   * ------------------------------------------------------------------- */
  reserva: {
    ativa: true,
    freteGratis: false,
    diasSemana: [1, 2, 3, 4, 5],
  },

  /* ---------------------------------------------------------------------
   * FERIADOS — contam como dia de entrega, igual sábado e domingo.
   * Formato AAAA-MM-DD. Atualize no começo de cada ano.
   * ------------------------------------------------------------------- */
  feriados: [
    // 2026
    '2026-09-07', // Independência
    '2026-10-12', // Nossa Senhora Aparecida
    '2026-11-02', // Finados
    '2026-11-15', // Proclamação da República
    '2026-11-20', // Consciência Negra
    '2026-12-25', // Natal
    // 2027
    '2027-01-01', // Confraternização Universal
    '2027-02-08', // Carnaval
    '2027-02-09', // Carnaval
    '2027-03-26', // Sexta-feira Santa
    '2027-04-21', // Tiradentes
    '2027-05-01', // Dia do Trabalho
    '2027-05-27', // Corpus Christi
    '2027-09-07', // Independência
    '2027-10-12', // Nossa Senhora Aparecida
    '2027-11-02', // Finados
    '2027-11-15', // Proclamação da República
    '2027-11-20', // Consciência Negra
    '2027-12-25', // Natal
  ],
};

/* ---------------------------------------------------------------------
 * CARDÁPIO
 *
 * Produto com `variantes` (com osso / desossada) abre a escolha ao ser
 * tocado. Cada variante é vendida com o próprio `nome` — é ele que vai
 * para o pagamento, a planilha, o ticket da cozinha e o painel, por isso
 * diz sempre se é com osso ou desossada.
 *
 * `legado` é o nome antigo do produto, de antes das variantes. O painel
 * usa para levar a ficha técnica e o custo já cadastrados para a variante
 * com osso. Não apague.
 *
 * Variante com `imagem` própria troca a foto quando o cliente a escolhe.
 *
 * `tags` aparecem como etiquetas no card (peso, quantas pessoas serve).
 * Produto sem `imagem` mostra um ícone no lugar da foto.
 * ------------------------------------------------------------------- */
const CARDAPIO = [
  {
    id: 'combos',
    nome: 'Combos',
    descricao: 'Porção de costela + acompanhamentos. Escolha com osso ou desossada.',

    /* Ordem de propósito: o Família (maior valor) primeiro ancora a
       percepção de preço — o Completo em seguida parece "o equilibrado".
       O Casal fica por último: é uma alternativa mais em conta pra não
       perder cliente sensível a preço. */
    itens: [
      {
        id: 'combo-familia',
        nome: 'Combo Família',
        descricao: '1,5 kg de costela no bafo + arroz, mandioca, farofa e creme de alho. Porções tamanho G.',
        tags: ['1,5 kg de costela', 'Serve até 6 pessoas'],
        selo: 'Para compartilhar',
        imagem: 'assets/combo-familia.jpg',
        variantes: [
          { rotulo: 'Com osso', nome: 'Combo Família · Com osso', preco: 24990, legado: 'Combo Bafo Família' },
          { rotulo: 'Desossada', nome: 'Combo Família · Desossada', preco: 28740, imagem: 'assets/costela-desossada.jpg' },
        ],
      },
      {
        id: 'combo-completo',
        nome: 'Combo Completo',
        descricao: '1 kg de costela no bafo + arroz, mandioca e farofa (porções M, 500 g cada) + 150 g de creme de alho.',
        tags: ['1 kg de costela', 'Serve até 4 pessoas'],
        selo: 'Recomendado',
        imagem: 'assets/combo-completo.jpg',
        variantes: [
          { rotulo: 'Com osso', nome: 'Combo Completo · Com osso', preco: 15990, legado: 'Combo Bafo Completo' },
          { rotulo: 'Desossada', nome: 'Combo Completo · Desossada', preco: 18490, imagem: 'assets/costela-desossada.jpg' },
        ],
      },
      {
        id: 'combo-casal',
        nome: 'Combo Casal',
        descricao: '500 g de costela no bafo + arroz, mandioca e farofa (porções P, 300 g cada).',
        tags: ['500 g de costela', 'Serve 2 pessoas'],
        imagem: 'assets/combo-casal.jpg',
        variantes: [
          { rotulo: 'Com osso', nome: 'Combo Casal · Com osso', preco: 10990, legado: 'Combo Casal' },
          { rotulo: 'Desossada', nome: 'Combo Casal · Desossada', preco: 12940, imagem: 'assets/costela-desossada.jpg' },
        ],
      },
    ],
  },
  {
    id: 'costelas',
    nome: 'Costela no Bafo',
    descricao: 'Assada na lenha, no bafo. A especialidade da casa.',
    /* Mesma lógica de ancoragem dos combos: maior valor primeiro. */
    itens: [
      {
        id: 'costela-15kg',
        nome: 'Costela no Bafo · 1,5 kg',
        descricao: 'Porção GG, assada na hora, na lenha. Escolha com osso ou desossada.',
        tags: ['1,5 kg', 'Serve até 6 pessoas'],
        selo: 'A mais vendida',
        imagem: 'assets/costela-15kg.jpg',
        variantes: [
          { rotulo: 'Com osso', nome: 'Costela no Bafo 1,5 kg · Com osso', preco: 14990, legado: 'Costela no Bafo — 1,5kg' },
          { rotulo: 'Desossada', nome: 'Costela no Bafo 1,5 kg · Desossada', preco: 18740, imagem: 'assets/costela-desossada.jpg' },
        ],
      },
      {
        id: 'costela-1kg',
        nome: 'Costela no Bafo · 1 kg',
        descricao: 'Porção G, assada na hora, na lenha. Escolha com osso ou desossada.',
        tags: ['1 kg', 'Serve até 4 pessoas'],
        imagem: 'assets/costela-1kg.jpg',
        variantes: [
          { rotulo: 'Com osso', nome: 'Costela no Bafo 1 kg · Com osso', preco: 9990, legado: 'Costela no Bafo — 1kg' },
          { rotulo: 'Desossada', nome: 'Costela no Bafo 1 kg · Desossada', preco: 12490, imagem: 'assets/costela-desossada.jpg' },
        ],
      },
      {
        id: 'costela-500g',
        nome: 'Costela no Bafo · 500 g',
        descricao: 'Porção P, assada na hora, na lenha. Escolha com osso ou desossada.',
        tags: ['500 g', 'Serve 2 pessoas'],
        imagem: 'assets/costela-500g.jpg',
        variantes: [
          { rotulo: 'Com osso', nome: 'Costela no Bafo 500 g · Com osso', preco: 7790, legado: 'Costela no Bafo — 500g' },
          { rotulo: 'Desossada', nome: 'Costela no Bafo 500 g · Desossada', preco: 9740, imagem: 'assets/costela-desossada.jpg' },
        ],
      },
    ],
  },
  {
    id: 'acompanhamentos',
    nome: 'Acompanhamentos',
    descricao: 'Para completar o seu pedido.',
    itens: [
      { id: 'arroz', nome: 'Arroz', descricao: 'Arroz branco soltinho.', tags: ['900 g'], preco: 1990, selo: 'Novo', imagem: 'assets/arroz.jpg' },
      { id: 'mandioca', nome: 'Mandioca', descricao: 'Mandioca cozida.', tags: ['Porção'], preco: 1490, imagem: 'assets/mandioca.jpg' },
      { id: 'farofa', nome: 'Farofa', descricao: 'Farofa da casa.', tags: ['Porção'], preco: 1290, imagem: 'assets/farofa.jpg' },
      { id: 'creme-de-alho', nome: 'Creme de Alho', descricao: 'Creme de alho da casa.', tags: ['Porção'], preco: 1290, imagem: 'assets/creme-de-alho.jpg' },
    ],
  },
];

/* Banners do topo (carrossel). `abre` é o id do produto que o toque abre. */
const BANNERS = [
  { tag: 'Novidade', titulo: 'Costela desossada', texto: 'Em todas as porções e combos. Toque e escolha a sua.', imagem: 'assets/costela-desossada.jpg', abre: 'costela-1kg' },
  { tag: 'Para a família', titulo: 'Combo Família', texto: 'Serve até 6 pessoas. A partir de R$ 249,90.', imagem: 'assets/combo-familia.jpg', abre: 'combo-familia' },
  { tag: 'Para dois', titulo: 'Combo Casal', texto: 'Costela, arroz, mandioca e farofa. A partir de R$ 109,90.', imagem: 'assets/combo-casal.jpg', abre: 'combo-casal' },
];

/* Vitrine "Mais pedidos", na ordem em que aparece. O primeiro leva o selo. */
const MAIS_PEDIDOS = ['costela-1kg', 'combo-completo', 'combo-familia', 'costela-15kg', 'combo-casal'];

/**
 * Tudo o que pode ser vendido, já com as variantes abertas: cada uma vira
 * um item com nome e preço próprios. Usado pelo cardápio e pelo painel.
 */
function itensVendaveis() {
  return CARDAPIO.flatMap((categoria) => categoria.itens.flatMap((produto) =>
    produto.variantes
      ? produto.variantes.map((v) => ({ ...v, produto, imagem: v.imagem || produto.imagem }))
      : [{ ...produto, produto }]
  ));
}
