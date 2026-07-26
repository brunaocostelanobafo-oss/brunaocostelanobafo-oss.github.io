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

  // TODO: confirmar o valor real da taxa de entrega.
  taxaEntrega: 1000,

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
        imagem: 'assets/costela-1kg.png',
      },
      {
        nome: 'Costela no Bafo — 1,5kg',
        descricao: 'Porção GG. Assada na hora, na lenha.',
        preco: 13490,
        imagem: 'assets/costela-15kg.png',
        destaque: true,
        selo: 'A mais vendida',
      },
    ],
  },
  {
    id: 'acompanhamentos',
    nome: 'Acompanhamentos',
    emoji: '🍽️',
    itens: [
      { nome: 'Mandioca', preco: 1490, imagem: 'assets/mandioca.png' },
      // TODO: trocar por fotos reais quando você me passar.
      { nome: 'Farofa', preco: 1290 },
      { nome: 'Creme de Alho', preco: 1290 },
    ],
  },
];
