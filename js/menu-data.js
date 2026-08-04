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

  // Deixe vazio para não aparecer no rodapé.
  endereco: '',

  taxaEntrega: 800,

  /* Agendar um horário certo dentro da janela de entrega, em vez de
     esperar a rota chegar. Custa à parte. Deixe `ativo: false` para
     não oferecer. */
  agendamentoHorario: {
    ativo: true,
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

    /* Quantas datas de entrega o cliente pode escolher.
       2 = só o fim de semana vigente (sábado e domingo).
       4 = também o fim de semana seguinte.
       Quanto mais longe, mais tempo o preço da carne tem para mudar
       depois que o pedido já foi pago. */
    datasOferecidas: 2,
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
    freteGratis: true,
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

const CARDAPIO = [
  {
    id: 'costelas',
    nome: 'Costela no Bafo',
    emoji: '🔥',
    descricao: 'Assada na lenha, no bafo. A especialidade da casa.',
    itens: [
      {
        nome: 'Costela no Bafo — 1kg',
        descricao: 'Porção G. Assada na hora, na lenha.',
        preco: 8990,
        imagem: 'assets/costela-1kg.jpg',
      },
      {
        nome: 'Costela no Bafo — 1,5kg',
        descricao: 'Porção GG. Assada na hora, na lenha.',
        preco: 13490,
        imagem: 'assets/costela-15kg.jpg',
        destaque: true,
        selo: 'A mais vendida',
      },
    ],
  },
  {
    id: 'combos',
    nome: 'Combos',
    emoji: '🎉',
    descricao: 'Costela com os acompanhamentos, por um preço melhor.',
    itens: [
      {
        nome: 'Combo Bafo Completo',
        descricao: 'Costela no Bafo 1kg + Mandioca + Farofa + Creme de Alho.',
        preco: 11990,
        imagem: 'assets/combo-completo.jpg',
      },
      {
        nome: 'Combo Bafo Família',
        descricao: 'Costela no Bafo 1,5kg + 2 Mandiocas + 2 Farofas + 2 Cremes de Alho.',
        preco: 19990,
        destaque: true,
        selo: 'Para compartilhar',
        imagem: 'assets/combo-familia.jpg',
      },
    ],
  },
  {
    id: 'acompanhamentos',
    nome: 'Acompanhamentos',
    emoji: '🍽️',
    itens: [
      { nome: 'Mandioca', preco: 1490, imagem: 'assets/mandioca.jpg' },
      { nome: 'Farofa', preco: 1290, imagem: 'assets/farofa.jpg' },
      { nome: 'Creme de Alho', preco: 1290, imagem: 'assets/creme-de-alho.jpg' },
    ],
  },
];
