/*
 * DADOS DO CARDÁPIO
 * -----------------
 * Este é o único arquivo que você precisa editar no dia a dia.
 *
 * Preços em CENTAVOS: 5990 = R$ 59,90 (evita erro de arredondamento).
 * Item esgotado: adicione `disponivel: false`.
 */

const LOJA = {
  nome: 'Brunão Costela no Bafo',
  tagline: 'Costela assada 12 horas no bafo. Só chegar e comer.',

  // Código do país + DDD + número, só dígitos.
  // TODO: trocar pelo WhatsApp real da loja antes de divulgar.
  whatsapp: '5511999999999',

  endereco: 'Rua do Churrasco, 123 — Centro',

  // Taxa de entrega em centavos. Use 0 para entrega grátis.
  taxaEntrega: 800,

  // Pedido mínimo em centavos. Use 0 para não exigir mínimo.
  pedidoMinimo: 3000,

  chavePix: 'brunao@costelanobafo.com.br',

  formasPagamento: ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito'],

  // 0 = domingo … 6 = sábado. null = fechado o dia inteiro.
  horarios: {
    0: { abre: '11:00', fecha: '16:00' },
    1: null,
    2: null,
    3: { abre: '18:00', fecha: '23:00' },
    4: { abre: '18:00', fecha: '23:00' },
    5: { abre: '18:00', fecha: '23:59' },
    6: { abre: '11:00', fecha: '23:59' },
  },
};

const CARDAPIO = [
  {
    id: 'costelas',
    nome: 'Costelas no Bafo',
    emoji: '🔥',
    descricao: 'A especialidade da casa. Assada lentamente por 12 horas.',
    itens: [
      {
        nome: 'Costela no Bafo — 500g',
        descricao: 'Serve 1 a 2 pessoas. Acompanha farofa e vinagrete.',
        preco: 5990,
        destaque: true,
      },
      {
        nome: 'Costela no Bafo — 1kg',
        descricao: 'Serve 3 a 4 pessoas. Acompanha farofa, vinagrete e pão de alho.',
        preco: 10990,
        destaque: true,
      },
      {
        nome: 'Costela Premium Barbecue',
        descricao: 'Costela de 700g selada no molho barbecue da casa.',
        preco: 7490,
      },
      {
        nome: 'Costela Desfiada na Mandioca',
        descricao: 'Costela desfiada sobre purê de mandioca gratinado.',
        preco: 6490,
      },
    ],
  },
  {
    id: 'porcoes',
    nome: 'Porções',
    emoji: '🍖',
    descricao: 'Direto da brasa para a mesa.',
    itens: [
      {
        nome: 'Fraldinha na Brasa — 500g',
        descricao: 'Fatiada na hora, com pão de alho e vinagrete.',
        preco: 5490,
      },
      {
        nome: 'Linguiça Artesanal — 500g',
        descricao: 'Linguiça de pernil defumada na lenha.',
        preco: 3990,
      },
      {
        nome: 'Frango a Passarinho — 500g',
        descricao: 'Crocante, com alho frito e limão.',
        preco: 3490,
      },
      {
        nome: 'Mandioca Frita',
        descricao: 'Porção generosa, sequinha, com maionese verde.',
        preco: 2490,
      },
    ],
  },
  {
    id: 'marmitas',
    nome: 'Marmitas',
    emoji: '🍱',
    descricao: 'Prato feito completo, quentinho.',
    itens: [
      {
        nome: 'Marmita de Costela — P',
        descricao: 'Arroz, feijão, farofa, vinagrete e costela desfiada.',
        preco: 2490,
      },
      {
        nome: 'Marmita de Costela — G',
        descricao: 'Porção reforçada de costela, arroz, feijão e acompanhamentos.',
        preco: 3290,
      },
      {
        nome: 'Marmita Mista',
        descricao: 'Costela, linguiça e frango com os acompanhamentos da casa.',
        preco: 3490,
      },
    ],
  },
  {
    id: 'acompanhamentos',
    nome: 'Acompanhamentos',
    emoji: '🥗',
    itens: [
      { nome: 'Farofa da Casa', descricao: 'Na manteiga, com bacon e ovo.', preco: 1290 },
      { nome: 'Vinagrete', descricao: 'Bem gelado, do jeito certo.', preco: 990 },
      { nome: 'Arroz Branco', descricao: 'Porção individual.', preco: 990 },
      { nome: 'Pão de Alho — 2 unidades', descricao: 'Grelhado na brasa.', preco: 1490 },
      { nome: 'Maionese Temperada', descricao: 'Receita da casa, 300g.', preco: 1590 },
    ],
  },
  {
    id: 'bebidas',
    nome: 'Bebidas',
    emoji: '🥤',
    itens: [
      { nome: 'Refrigerante Lata 350ml', preco: 700 },
      { nome: 'Refrigerante 2 Litros', preco: 1500 },
      { nome: 'Suco Natural 500ml', descricao: 'Laranja, maracujá ou limão.', preco: 1200 },
      { nome: 'Água Mineral 500ml', preco: 500 },
      { nome: 'Cerveja Long Neck', descricao: 'Bem gelada.', preco: 1200 },
    ],
  },
];
