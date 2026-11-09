/**
 * Brunão Costela no Bafo — servidor da integração com a InfinitePay
 * =================================================================
 *
 * Este arquivo roda no Google Apps Script e faz o papel de servidor,
 * que o site sozinho não consegue fazer. Ele:
 *
 *   1. cria o link de pagamento na InfinitePay quando o cliente pede;
 *   2. recebe o aviso de pagamento aprovado (webhook);
 *   3. confere esse aviso com a InfinitePay antes de aceitar;
 *   4. grava a venda numa planilha do Google;
 *   5. entrega as vendas para o painel administrativo.
 *
 * Por que o site não faz isso direto: a API da InfinitePay não libera
 * chamadas vindas de dentro de uma página (CORS). Ela só aceita
 * servidor para servidor — e é isso que este arquivo é.
 *
 * Como instalar: veja CONFIGURACAO.md, na mesma pasta.
 */

// ===========================================================================
// CONFIGURAÇÃO — preencha estes três valores
// ===========================================================================

var CONFIG = {
  // Sua InfiniteTag, sem o $ da frente.
  HANDLE: 'obrunaocostelanobafo',

  // Endereço do cardápio, para onde o cliente volta depois de pagar.
  URL_SITE: 'https://brunaocostelanobafo-oss.github.io',

  // Nome da aba da planilha onde as vendas são gravadas.
  ABA: 'Vendas',

  // Pixel "Brunão" na Meta. O TOKEN da API de Conversões NÃO fica aqui:
  // este arquivo vai para um repositório público. Ele fica em
  // Configurações do projeto > Propriedades do script (META_CAPI_TOKEN).
  META_PIXEL_ID: '4433696376853064',
};

var META_GRAPH_VERSAO = 'v23.0';

/**
 * Senha que o painel usa para provar que é você (ler vendas com nome,
 * telefone e endereço de clientes; abrir/fechar o cardápio; esgotados).
 *
 * Fica em Configurações do projeto > Propriedades do script, com o nome
 * TOKEN_PAINEL — nunca aqui no código, porque este arquivo é publicado
 * junto com o site e qualquer um consegue lê-lo.
 *
 * Sem a propriedade, nada que exige senha funciona: é melhor travar do
 * que aceitar qualquer coisa.
 */
function tokenPainel() {
  return PropertiesService.getScriptProperties().getProperty('TOKEN_PAINEL') || '';
}

function tokenConfere(recebido) {
  var certo = tokenPainel();
  return certo.length >= 20 && String(recebido || '') === certo;
}

var API = 'https://api.checkout.infinitepay.io';

var COLUNAS = [
  'data', 'order_nsu', 'transaction_nsu', 'slug', 'cliente', 'telefone',
  'endereco', 'itens', 'valor_centavos', 'pago_centavos', 'parcelas',
  'metodo', 'recibo', 'status', 'registrado_em',
  // Para o ticket de expedição: quando entregar, não quando compraram.
  'entrega_texto', 'hora_agendada', 'retirada', 'observacoes',
  // Dados da encomenda (JSON) guardados até o pagamento; só então ela vai para a aba Encomendas.
  'encomenda',
];

// ===========================================================================
// ENTRADAS — o Apps Script chama estas duas funções sozinho
// ===========================================================================

/**
 * Recebe tudo que chega por POST. Duas coisas diferentes caem aqui:
 *
 *   - o site pedindo um link de pagamento  ({ acao: 'criar-link', ... })
 *   - a InfinitePay avisando que pagaram   ({ invoice_slug, ... })
 *
 * A chamada do site vem com Content-Type text/plain de propósito: o
 * Apps Script não responde a preflight, e text/plain evita que o
 * navegador dispare um.
 */
function doPost(e) {
  try {
    var corpo = JSON.parse(e.postData.contents);

    if (corpo.acao === 'criar-link') return json(criarLink(corpo));
    if (corpo.acao === 'esgotar') return json(salvarEsgotados(corpo));
    if (corpo.acao === 'status') return json(salvarStatusLoja(corpo));
    if (corpo.acao === 'horario') return json(salvarHorarioExtra(corpo));
    if (corpo.acao === 'encomendas-status') return json(salvarStatusEncomendas(corpo));
    if (corpo.acao === 'encomenda-marcar') return json(marcarEncomenda(corpo));
    if (corpo.acao === 'encomenda-manual') return json(lancarEncomendaManual(corpo));
    if (corpo.acao === 'encomenda-excluir') return json(excluirEncomenda(corpo));

    // Sem 'acao' e com slug de fatura: é a InfinitePay avisando.
    if (corpo.invoice_slug || corpo.transaction_nsu) return json(receberWebhook(corpo));

    return json({ ok: false, erro: 'Não entendi o que você quer.' });
  } catch (erro) {
    registrarErro('doPost', erro);
    return json({ ok: false, erro: String(erro) });
  }
}

/**
 * O painel pede a lista de vendas por aqui.
 * Precisa do token, senão qualquer um leria seu faturamento.
 */
function doGet(e) {
  try {
    var p = e.parameter || {};

    /* Quais itens estão esgotados é a única coisa que o cardápio precisa
       ler, e ele é uma página pública — não tem onde guardar um token
       sem deixá-lo à vista. Também não há o que proteger: é a mesma
       informação que qualquer cliente vê na tela. */
    if (p.acao === 'esgotados') return json({ ok: true, esgotados: lerEsgotados() });

    /* Encomendas abertas ou encerradas (Natal e Confraternizações):
       também é informação que o cliente já vê na tela. */
    if (p.acao === 'encomendas-status') return json({ ok: true, status: lerStatusEncomendas() });

    /* Se o cardápio está aceitando pedido agora — controle manual do
       dono, independente do dia/horário programado. Pública pelo mesmo
       motivo do esgotados: é a mesma informação que qualquer cliente vê
       na tela, só que decidindo se mostra o cardápio ou um aviso. */
    if (p.acao === 'status') return json({ ok: true, aberto: lerStatusLoja() });

    /* Janela extra de horário: estende o atendimento numa data específica
       sem mexer no horário padrão do site. Pública pelo mesmo motivo dos
       outros — é a mesma informação que já aparece na tela do cliente. */
    if (p.acao === 'horario') return json({ ok: true, horario: lerHorarioExtra() });

    /* A página de confirmação de pagamento também é pública, e não pode
       depender do que ficou guardado no navegador do cliente — alguns
       navegadores internos (Instagram, Facebook) perdem esse dado na
       ida e volta até a InfinitePay. O order_nsu já funciona como uma
       senha de fato: é longo, único e só quem pagou o tem. Só devolve
       pedido com status 'pago', nunca um pendente. */
    if (p.acao === 'pedido' && p.order_nsu) {
      return json({ ok: true, pedido: lerPedido(p.order_nsu) });
    }

    if (!tokenConfere(p.token)) {
      return json({ ok: false, erro: 'Token inválido.' });
    }

    if (p.acao === 'vendas') return json({ ok: true, vendas: lerVendas(p.desde) });
    if (p.acao === 'encomendas') return json({ ok: true, encomendas: lerEncomendas(), status: lerStatusEncomendas() });
    if (p.acao === 'ping') return json({ ok: true, mensagem: 'Integração no ar.' });
    if (p.acao === 'diagnostico') return json({ ok: true, diagnostico: diagnostico() });

    return json({ ok: false, erro: 'Ação desconhecida.' });
  } catch (erro) {
    registrarErro('doGet', erro);
    return json({ ok: false, erro: String(erro) });
  }
}

// ===========================================================================
// 1. CRIAR O LINK DE PAGAMENTO
// ===========================================================================

/**
 * Monta o pedido e pede o link para a InfinitePay.
 *
 * Os preços chegam em centavos do site e são reconferidos aqui contra
 * o que o cliente diz que comprou — nunca confiamos no total que vem
 * de fora, só na soma dos itens.
 */
function criarLink(dados) {
  var itens = (dados.itens || []).filter(function (i) {
    return i && i.quantity > 0 && i.price > 0 && i.description;
  });

  if (!itens.length) return { ok: false, erro: 'Pedido sem itens.' };

  var precoErrado = conferirPrecos(itens);
  if (precoErrado) {
    registrarErro('criarLink', 'Preço recusado: ' + precoErrado);
    return { ok: false, erro: 'O cardápio foi atualizado. Recarregue a página e monte o pedido de novo.' };
  }

  // Número do pedido: data + sequência, para você reconhecer na planilha.
  var orderNsu = dados.order_nsu || gerarOrderNsu();

  /* Encomenda (aba Encomendas): o cliente paga um sinal de 50% ou o total.
     O pedido completo fica na planilha (itens e valor_centavos); a
     InfinitePay cobra só o valor de agora, calculado AQUI a partir dos
     preços já conferidos — nunca o que o navegador diz. */
  var cobranca = itens;
  if (dados.encomenda) {
    var sinal = Number(dados.encomenda.sinal);
    if (sinal !== 50 && sinal !== 100) {
      return { ok: false, erro: 'Percentual de sinal inválido.' };
    }
    if (sinal === 50) {
      cobranca = [{
        quantity: 1,
        price: Math.round(somar(itens) * 50 / 100),
        description: 'Sinal de 50% da encomenda',
      }];
    }
  }

  var payload = {
    handle: CONFIG.HANDLE,
    items: cobranca.map(function (i) {
      return {
        quantity: Math.round(i.quantity),
        price: Math.round(i.price),
        description: String(i.description).slice(0, 120),
      };
    }),
    order_nsu: orderNsu,
    redirect_url: CONFIG.URL_SITE + '/pago.html',
    webhook_url: ScriptApp.getService().getUrl(),
  };

  if (dados.cliente && dados.cliente.nome) {
    payload.customer = { name: dados.cliente.nome };
    var telCheckout = telefoneCheckout(dados.cliente.telefone);
    if (telCheckout) payload.customer.phone_number = telCheckout;
    if (dados.cliente.email) payload.customer.email = dados.cliente.email;
  }

  if (dados.endereco && dados.endereco.street) {
    payload.address = dados.endereco;
  }

  var resposta = UrlFetchApp.fetch(API + '/links', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var codigo = resposta.getResponseCode();
  var texto = resposta.getContentText();

  if (codigo < 200 || codigo >= 300) {
    registrarErro('criarLink', 'HTTP ' + codigo + ' — ' + texto);
    return { ok: false, erro: 'A InfinitePay recusou o pedido (HTTP ' + codigo + ').' };
  }

  var corpo = {};
  try { corpo = JSON.parse(texto); } catch (ignorado) {}

  // A documentação não fixa o nome do campo do link, então procuramos
  // entre os nomes possíveis em vez de chutar um só.
  var url = corpo.url || corpo.link || corpo.checkout_url || corpo.payment_url ||
            (corpo.data && (corpo.data.url || corpo.data.link));

  if (!url) {
    registrarErro('criarLink', 'Resposta sem link: ' + texto);
    return { ok: false, erro: 'A InfinitePay respondeu sem o link.', resposta: corpo };
  }

  // Guarda o pedido como pendente. Se o cliente pagar, o webhook completa.
  gravarPendente(orderNsu, dados, itens);

  /* Encomenda: os dados ficam guardados no pedido pendente. Só entra na aba
     "Encomendas" quando o pagamento (sinal ou total) for confirmado. */

  return { ok: true, url: url, order_nsu: orderNsu };
}

/**
 * Tabela de preços que o servidor aceita, em centavos.
 *
 * O site é público: qualquer um pode mandar um pedido com o preço que
 * quiser. Por isso cada item é conferido aqui antes de virar link de
 * pagamento. ATENÇÃO: mudou preço ou produto em js/menu-data.js, mude
 * aqui também e implante "Nova versão" — senão o pedido é recusado.
 */
var PRECOS = {
  'Fraldinha no Bafo · 1 kg': 14990,
  'Combo Família · Com osso': 24990,
  'Combo Família · Desossada': 28740,
  'Combo Completo · Com osso': 15990,
  'Combo Completo · Desossada': 18490,
  'Combo Casal · Com osso': 10990,
  'Combo Casal · Desossada': 12940,
  'Costela no Bafo 1,5 kg · Com osso': 14990,
  'Costela no Bafo 1,5 kg · Desossada': 18740,
  'Costela no Bafo 1 kg · Com osso': 9990,
  'Costela no Bafo 1 kg · Desossada': 12490,
  'Costela no Bafo 500 g · Com osso': 7790,
  'Costela no Bafo 500 g · Desossada': 9740,
  'Arroz': 1990,
  'Mandioca': 1490,
  'Farofa': 1290,
  'Creme de Alho': 1290,
  'Taxa de entrega': 1000,
};
var PRECO_AGENDAMENTO = 800; // "Agendamento de horário (HH:MM)"

/** Devolve a descrição do primeiro item com preço fora da tabela, ou ''. */
function conferirPrecos(itens) {
  for (var i = 0; i < itens.length; i++) {
    var nome = String(itens[i].description);
    var certo = /^Agendamento de horário \(\d\d:\d\d\)$/.test(nome) ? PRECO_AGENDAMENTO : PRECOS[nome];
    if (certo === undefined || Math.round(itens[i].price) !== certo) return nome + ' = ' + itens[i].price;
  }
  return '';
}

/**
 * A InfinitePay espera o telefone como "+5535999999999" (DDI +55 e só números).
 * O cliente digita "(35) 99999-9999"; sem converter, o checkout não consegue
 * casar o contato na verificação por código.
 */
function telefoneCheckout(tel) {
  var d = String(tel || '').replace(/\D/g, '');
  if (d.indexOf('55') === 0 && d.length >= 12) d = d.slice(2); // já veio com DDI
  if (d.length !== 10 && d.length !== 11) return '';           // número incompleto: não manda
  return '+55' + d;
}

function gerarOrderNsu() {
  var agora = new Date();
  var carimbo = Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyyMMdd-HHmmss');
  return 'bcb-' + carimbo + '-' + Math.floor(Math.random() * 900 + 100);
}

// ===========================================================================
// 2 e 3. RECEBER O WEBHOOK — e conferir antes de acreditar
// ===========================================================================

/**
 * A InfinitePay não assina o webhook, e a URL dele fica exposta no
 * payload que criamos. Ou seja: qualquer um que descubra o endereço
 * poderia mandar um "pagamento aprovado" falso e sujar seu financeiro.
 *
 * Por isso nada é aceito de primeira. Todo aviso é reconferido direto
 * com a InfinitePay, e só entra na planilha se ela confirmar.
 */
function receberWebhook(aviso) {
  var orderNsu = aviso.order_nsu;
  var transactionNsu = aviso.transaction_nsu;
  var slug = aviso.invoice_slug || aviso.slug;

  if (!orderNsu || !transactionNsu || !slug) {
    return { ok: false, erro: 'Aviso incompleto.' };
  }

  // Evita gravar duas vezes se a InfinitePay reenviar o mesmo aviso.
  if (jaRegistrada(transactionNsu)) {
    return { ok: true, mensagem: 'Já registrada.' };
  }

  var confere = conferirPagamento(orderNsu, transactionNsu, slug);

  if (!confere.ok || !confere.paid) {
    registrarErro('webhook', 'Aviso NAO confirmado pela InfinitePay: ' + JSON.stringify(aviso));
    return { ok: false, erro: 'Pagamento não confirmado na conferência.' };
  }

  // O valor que vale é o que a InfinitePay confirmou, não o do aviso.
  registrarVenda(aviso, confere);

  try { registrarEncomendaPaga(orderNsu, confere); } catch (erro) { registrarErro('encomenda-pagar', erro); }

  // Avisar a Meta nunca pode derrubar o registro da venda.
  try {
    enviarCompraMeta(orderNsu);
  } catch (erro) {
    registrarErro('meta-capi', erro);
  }

  return { ok: true };
}

// ===========================================================================
// META — API de Conversões (Purchase pelo servidor)
//
// O Pixel do navegador só vê a compra se o cliente voltar para pago.html.
// Aqui o servidor avisa a Meta direto quando a InfinitePay confirma. O
// event_id é o order_nsu, o mesmo eventID que o navegador já usa, então a
// Meta junta os dois avisos e conta a venda uma vez só.
//
// Propriedades do script (Configurações do projeto):
//   META_CAPI_TOKEN  — token gerado no Gerenciador de Eventos (obrigatória)
//   META_TEST_CODE   — código de "Testar eventos" (opcional; apague depois)
// ===========================================================================

function hashMeta(texto) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

function telefoneMeta(tel) {
  var digitos = String(tel || '').replace(/\D/g, '');
  if (!digitos) return '';
  return digitos.indexOf('55') === 0 ? digitos : '55' + digitos;
}

function enviarCompraMeta(orderNsu) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('META_CAPI_TOKEN');
  if (!token) return;

  var pedido = lerPedido(orderNsu);
  if (!pedido || !pedido.total) return;

  var usuario = { country: [hashMeta('br')] };
  var tel = telefoneMeta(pedido.telefone);
  if (tel) usuario.ph = [hashMeta(tel)];

  var partes = String(pedido.nome || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (partes.length) usuario.fn = [hashMeta(partes[0])];
  if (partes.length > 1) usuario.ln = [hashMeta(partes[partes.length - 1])];

  var corpo = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(orderNsu),
      action_source: 'website',
      event_source_url: CONFIG.URL_SITE + '/pago.html',
      user_data: usuario,
      custom_data: { value: pedido.total / 100, currency: 'BRL' },
    }],
  };

  var codigoTeste = props.getProperty('META_TEST_CODE');
  if (codigoTeste) corpo.test_event_code = codigoTeste;

  var resposta = UrlFetchApp.fetch(
    'https://graph.facebook.com/' + META_GRAPH_VERSAO + '/' + CONFIG.META_PIXEL_ID +
      '/events?access_token=' + encodeURIComponent(token),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(corpo),
      muteHttpExceptions: true,
    });

  var codigo = resposta.getResponseCode();
  var texto = resposta.getContentText();

  if (codigo < 200 || codigo >= 300) {
    registrarErro('meta-capi', 'HTTP ' + codigo + ' — ' + texto);
  } else if (codigoTeste) {
    registrarErro('meta-capi (teste ok)', orderNsu + ' — ' + texto);
  }
}

/**
 * Rode uma vez pelo editor, com META_CAPI_TOKEN e META_TEST_CODE
 * preenchidos: manda uma compra de mentira para a aba "Testar eventos"
 * do Gerenciador de Eventos, sem precisar vender nada.
 */
function testarMetaCapi() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('META_CAPI_TOKEN')) {
    console.log('Falta a propriedade META_CAPI_TOKEN.');
    return;
  }
  if (!props.getProperty('META_TEST_CODE')) {
    console.log('Falta a propriedade META_TEST_CODE (código de "Testar eventos").');
    return;
  }

  var folha = aba();
  var ultima = folha.getLastRow();
  var orderNsu = '';
  for (var i = ultima; i > 1; i--) {
    if (folha.getRange(i, indiceDe('status') + 1).getValue() === 'pago') {
      orderNsu = String(folha.getRange(i, indiceDe('order_nsu') + 1).getValue());
      break;
    }
  }
  if (!orderNsu) { console.log('Nenhuma venda paga para usar no teste.'); return; }

  enviarCompraMeta(orderNsu);
  console.log('Teste enviado com o pedido ' + orderNsu + '. Confira em "Testar eventos".');
}

/** Pergunta para a InfinitePay se aquele pagamento existe mesmo. */
function conferirPagamento(orderNsu, transactionNsu, slug) {
  var resposta = UrlFetchApp.fetch(API + '/payment_check', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      handle: CONFIG.HANDLE,
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu,
      slug: slug,
    }),
    muteHttpExceptions: true,
  });

  if (resposta.getResponseCode() !== 200) {
    return { ok: false, paid: false };
  }

  var corpo = {};
  try { corpo = JSON.parse(resposta.getContentText()); } catch (ignorado) {}

  return {
    ok: corpo.success === true,
    paid: corpo.paid === true,
    amount: corpo.amount || 0,
    paid_amount: corpo.paid_amount || 0,
    installments: corpo.installments || 1,
    capture_method: corpo.capture_method || '',
  };
}

// ===========================================================================
// 4. A PLANILHA
// ===========================================================================

function aba() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var folha = planilha.getSheetByName(CONFIG.ABA);

  if (!folha) {
    folha = planilha.insertSheet(CONFIG.ABA);
    folha.appendRow(COLUNAS);
    folha.setFrozenRows(1);
  }

  /* "Domingo, 02/08" e "11:30" são texto, mas o Sheets acha que são data
     e hora e converte sozinho ao gravar. Depois disso o texto original se
     perde e o ticket sai com 1899-12-30T14:36:28Z no lugar do horário.
     Marcar as colunas como texto impede a conversão.

     `getMaxRows()` pode ser bem maior que o que a aba realmente usa (o
     Sheets começa com 1000 linhas em branco), e formatar tudo isso de
     novo em toda chamada — inclusive só para ler uma venda — é o que
     estava deixando a sincronização lenta à medida que a aba cresce.
     200 linhas de folga além do que já foi usado já cobrem meses de
     pedidos futuros sem precisar varrer a aba inteira toda vez. */
    var folga = folha.getLastRow() + 200;
    var linhas = Math.min(folga, folha.getMaxRows());

    var col = indiceDe('entrega_texto') + 1;
    folha.getRange(1, col, linhas, 2).setNumberFormat('@');

  /* Telefone com "+" na frente (ex.: "+55 35 9...") também sofre esse
     problema: o Sheets acha que é fórmula e grava #ERROR! no lugar do
     número. Isso já aconteceu e quebrou o casamento por telefone e a
     correspondência avançada do Pixel daquela venda. */
    var colTel = indiceDe('telefone') + 1;
    folha.getRange(1, colTel, linhas, 1).setNumberFormat('@');

  // Aba criada antes da coluna "encomenda": completa o cabeçalho.
  var colEnc = indiceDe('encomenda') + 1;
  if (folha.getRange(1, colEnc).getValue() !== 'encomenda') folha.getRange(1, colEnc).setValue('encomenda');

  return folha;
}

function indiceDe(nome) {
  return COLUNAS.indexOf(nome);
}

function gravarPendente(orderNsu, dados, itens) {
  var cliente = dados.cliente || {};
  var linha = [];
  linha[indiceDe('data')] = hojeISO();
  linha[indiceDe('order_nsu')] = orderNsu;
  linha[indiceDe('transaction_nsu')] = '';
  linha[indiceDe('slug')] = '';
  linha[indiceDe('cliente')] = cliente.nome || '';
  linha[indiceDe('telefone')] = cliente.telefone || '';
  linha[indiceDe('endereco')] = dados.enderecoTexto || '';
  linha[indiceDe('itens')] = JSON.stringify(itens);
  linha[indiceDe('valor_centavos')] = somar(itens);
  linha[indiceDe('pago_centavos')] = '';
  linha[indiceDe('parcelas')] = '';
  linha[indiceDe('metodo')] = '';
  linha[indiceDe('recibo')] = '';
  linha[indiceDe('status')] = 'pendente';
  linha[indiceDe('registrado_em')] = new Date();
  linha[indiceDe('entrega_texto')] = dados.entregaTexto || '';
  linha[indiceDe('hora_agendada')] = dados.horaAgendada || '';
  linha[indiceDe('retirada')] = dados.retirada ? 'sim' : '';
  linha[indiceDe('observacoes')] = dados.observacoes || '';
  if (dados.encomenda) {
    linha[indiceDe('encomenda')] = JSON.stringify({
      sinal: Number(dados.encomenda.sinal) || 100,
      horario: dados.encomenda.horario || '',
      tipo: dados.encomenda.tipo === 'confraternizacao' ? 'confraternizacao' : 'natal',
      dataIso: dados.encomenda.dataIso || '',
    });
  }

  for (var i = 0; i < COLUNAS.length; i++) if (linha[i] === undefined) linha[i] = '';
  aba().appendRow(linha);
}

// ===========================================================================
// ABA "ENCOMENDAS" — uma linha por encomenda (Natal, Ano Novo…)
//
// Além da aba de vendas (que o painel lê), cada encomenda entra aqui com o
// total, o que já foi pago (sinal) e o que falta receber na entrega. A aba é
// criada sozinha na primeira encomenda.
// ===========================================================================

var ABA_ENCOMENDAS = 'Encomendas';
var COLUNAS_ENC = [
  'registrado_em', 'order_nsu', 'status', 'cliente', 'telefone',
  'data_entrega', 'horario', 'entrega_ou_retirada', 'endereco', 'itens',
  'total_centavos', 'sinal_percentual', 'pago_centavos', 'restante_centavos',
  'forma_pagamento', 'observacoes',
  // Colunas acrescentadas depois (ficam no fim para não mexer nas linhas já gravadas)
  'tipo', 'data_iso', 'quitado_em', 'entregue_em',
];

function abaEncomendas() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var folha = planilha.getSheetByName(ABA_ENCOMENDAS);
  if (!folha) {
    folha = planilha.insertSheet(ABA_ENCOMENDAS);
    folha.appendRow(COLUNAS_ENC);
    folha.setFrozenRows(1);
    folha.getRange(1, 1, 1, COLUNAS_ENC.length).setFontWeight('bold');
    // Telefone, data e horário são texto: o Sheets converteria sozinho.
    var colTel = COLUNAS_ENC.indexOf('telefone') + 1;
    var colData = COLUNAS_ENC.indexOf('data_entrega') + 1;
    folha.getRange(2, colTel, 1000, 1).setNumberFormat('@');
    folha.getRange(2, colData, 1000, 2).setNumberFormat('@');
  }
  // Aba criada antes das colunas novas: completa o cabeçalho.
  var cab = folha.getRange(1, 1, 1, COLUNAS_ENC.length).getValues()[0];
  for (var c = 0; c < COLUNAS_ENC.length; c++) {
    if (cab[c] !== COLUNAS_ENC[c]) {
      folha.getRange(1, c + 1).setValue(COLUNAS_ENC[c]).setFontWeight('bold');
      if (COLUNAS_ENC[c] === 'data_iso' || COLUNAS_ENC[c] === 'quitado_em' || COLUNAS_ENC[c] === 'entregue_em') {
        folha.getRange(2, c + 1, 1000, 1).setNumberFormat('@'); // texto: o Sheets não vira data sozinho
      }
    }
  }
  return folha;
}

/** Insere uma linha na aba Encomendas. `c` traz todos os campos já prontos. */
function inserirEncomenda(c) {
  var linha = [];
  linha[COLUNAS_ENC.indexOf('registrado_em')] = new Date();
  linha[COLUNAS_ENC.indexOf('order_nsu')] = c.order_nsu;
  linha[COLUNAS_ENC.indexOf('status')] = c.pago >= c.total ? 'pago 100%' : 'sinal pago';
  linha[COLUNAS_ENC.indexOf('cliente')] = c.cliente || '';
  linha[COLUNAS_ENC.indexOf('telefone')] = c.telefone || '';
  linha[COLUNAS_ENC.indexOf('data_entrega')] = c.data_entrega || '';
  linha[COLUNAS_ENC.indexOf('horario')] = c.horario || '';
  linha[COLUNAS_ENC.indexOf('entrega_ou_retirada')] = c.retirada ? 'Retirada' : 'Entrega';
  linha[COLUNAS_ENC.indexOf('endereco')] = c.endereco || '';
  linha[COLUNAS_ENC.indexOf('itens')] = c.itens || '';
  linha[COLUNAS_ENC.indexOf('total_centavos')] = c.total;
  linha[COLUNAS_ENC.indexOf('sinal_percentual')] = c.sinal;
  linha[COLUNAS_ENC.indexOf('pago_centavos')] = c.pago;
  linha[COLUNAS_ENC.indexOf('restante_centavos')] = Math.max(0, c.total - c.pago);
  linha[COLUNAS_ENC.indexOf('forma_pagamento')] = c.forma || '';
  linha[COLUNAS_ENC.indexOf('observacoes')] = c.observacoes || '';
  linha[COLUNAS_ENC.indexOf('tipo')] = c.tipo === 'confraternizacao' ? 'confraternizacao' : 'natal';
  linha[COLUNAS_ENC.indexOf('data_iso')] = /^\d{4}-\d{2}-\d{2}$/.test(c.data_iso || '') ? c.data_iso : '';
  for (var i = 0; i < COLUNAS_ENC.length; i++) if (linha[i] === undefined) linha[i] = '';
  abaEncomendas().appendRow(linha);
}

function encomendaExiste(orderNsu) {
  var folha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_ENCOMENDAS);
  if (!folha) return false;
  var valores = folha.getDataRange().getValues();
  var col = COLUNAS_ENC.indexOf('order_nsu');
  for (var i = 1; i < valores.length; i++) if (String(valores[i][col]) === String(orderNsu)) return true;
  return false;
}

/**
 * Pagamento confirmado: se o pedido era uma encomenda, cria a linha na aba
 * Encomendas com o que foi pago e o que falta. Tentativas sem pagamento
 * nunca chegam aqui, então não entram no sistema.
 */
function registrarEncomendaPaga(orderNsu, confere) {
  var valores = aba().getDataRange().getValues();
  var colOrder = indiceDe('order_nsu');
  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][colOrder]) !== String(orderNsu)) continue;
    var meta = {};
    try { meta = JSON.parse(valores[i][indiceDe('encomenda')] || '{}'); } catch (ignorado) {}
    if (!meta.sinal) return; // pedido comum, não é encomenda
    if (encomendaExiste(orderNsu)) return;

    var itens = [];
    try { itens = JSON.parse(valores[i][indiceDe('itens')] || '[]'); } catch (ignorado) {}
    var total = somar(itens);
    var resumo = itens.map(function (it) { return it.quantity + 'x ' + it.description; }).join('; ');
    inserirEncomenda({
      order_nsu: String(orderNsu),
      cliente: valores[i][indiceDe('cliente')],
      telefone: String(valores[i][indiceDe('telefone')] || ''),
      data_entrega: String(valores[i][indiceDe('entrega_texto')] || ''),
      horario: meta.horario,
      retirada: valores[i][indiceDe('retirada')] === 'sim',
      endereco: valores[i][indiceDe('endereco')],
      itens: resumo,
      total: total,
      sinal: meta.sinal,
      pago: Number(confere.paid_amount) || 0,
      forma: traduzirMetodo(confere.capture_method),
      observacoes: valores[i][indiceDe('observacoes')],
      tipo: meta.tipo,
      data_iso: meta.dataIso,
    });
    return;
  }
}

/**
 * Lançamento manual (pedido combinado por fora: WhatsApp, Pix direto…).
 * dados: { token, tipo, data_iso, data_entrega, horario, cliente, telefone,
 *          retirada, endereco, itens (texto), total, pago, forma, observacoes }
 * Só entra se houver pagamento (pago > 0), igual aos pedidos do site.
 */
function lancarEncomendaManual(dados) {
  if (!tokenConfere(dados.token)) return { ok: false, erro: 'Token inválido.' };
  var total = Math.round(Number(dados.total) || 0);
  var pago = Math.round(Number(dados.pago) || 0);
  if (!dados.cliente) return { ok: false, erro: 'Informe o nome do cliente.' };
  if (!dados.itens) return { ok: false, erro: 'Informe os itens.' };
  if (total <= 0) return { ok: false, erro: 'O total precisa ser maior que zero.' };
  if (pago <= 0) return { ok: false, erro: 'Só entram encomendas com pagamento (sinal ou total). Informe o valor recebido.' };
  if (pago > total) return { ok: false, erro: 'O valor recebido não pode ser maior que o total.' };
  var nsu = 'manual-' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
  inserirEncomenda({
    order_nsu: nsu,
    cliente: String(dados.cliente).slice(0, 120),
    telefone: String(dados.telefone || ''),
    data_entrega: String(dados.data_entrega || ''),
    horario: String(dados.horario || ''),
    retirada: !!dados.retirada,
    endereco: String(dados.endereco || ''),
    itens: String(dados.itens).slice(0, 2000),
    total: total,
    sinal: Math.round(pago * 100 / total),
    pago: pago,
    forma: String(dados.forma || ''),
    observacoes: 'LANÇAMENTO MANUAL. ' + String(dados.observacoes || ''),
    tipo: dados.tipo,
    data_iso: dados.data_iso,
  });
  return { ok: true, order_nsu: nsu };
}

/** Exclui uma encomenda da aba Encomendas (não desfaz o pagamento na InfinitePay). */
function excluirEncomenda(dados) {
  if (!tokenConfere(dados.token)) return { ok: false, erro: 'Token inválido.' };
  var folha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_ENCOMENDAS);
  if (!folha) return { ok: false, erro: 'Não há encomendas.' };
  var valores = folha.getDataRange().getValues();
  var col = COLUNAS_ENC.indexOf('order_nsu');
  for (var i = valores.length - 1; i >= 1; i--) {
    if (String(valores[i][col]) === String(dados.order_nsu)) {
      folha.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Encomenda não encontrada.' };
}

/** Completa a linha pendente daquele pedido, ou cria uma nova se não achar. */
function registrarVenda(aviso, confere) {
  var folha = aba();
  var valores = folha.getDataRange().getValues();
  var colOrder = indiceDe('order_nsu');
  var linhaAlvo = -1;

  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][colOrder]) === String(aviso.order_nsu)) { linhaAlvo = i + 1; break; }
  }

  if (linhaAlvo === -1) {
    gravarPendente(aviso.order_nsu, {}, aviso.items || []);
    linhaAlvo = folha.getLastRow();
  }

  folha.getRange(linhaAlvo, indiceDe('transaction_nsu') + 1).setValue(aviso.transaction_nsu);
  folha.getRange(linhaAlvo, indiceDe('slug') + 1).setValue(aviso.invoice_slug || aviso.slug || '');
  folha.getRange(linhaAlvo, indiceDe('pago_centavos') + 1).setValue(confere.paid_amount);
  folha.getRange(linhaAlvo, indiceDe('parcelas') + 1).setValue(confere.installments);
  folha.getRange(linhaAlvo, indiceDe('metodo') + 1).setValue(traduzirMetodo(confere.capture_method));
  folha.getRange(linhaAlvo, indiceDe('recibo') + 1).setValue(aviso.receipt_url || '');
  folha.getRange(linhaAlvo, indiceDe('status') + 1).setValue('pago');
}

function jaRegistrada(transactionNsu) {
  var valores = aba().getDataRange().getValues();
  var col = indiceDe('transaction_nsu');
  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][col]) === String(transactionNsu)) return true;
  }
  return false;
}

// ===========================================================================
// 5. ENTREGAR AS VENDAS PARA O PAINEL
// ===========================================================================

function lerVendas(desde) {
  var valores = aba().getDataRange().getValues();
  var vendas = [];

  for (var i = 1; i < valores.length; i++) {
    var linha = {};
    for (var c = 0; c < COLUNAS.length; c++) linha[COLUNAS[c]] = valores[i][c];

    if (linha.status !== 'pago') continue;

    // Encomenda tem espaço próprio (aba Encomendas); não entra em Vendas nem no faturamento do dia a dia.
    if (/^ENCOMENDA/.test(String(linha.observacoes || ''))) continue;

    /* `linha.data` às vezes chega como Date de verdade (o Sheets converte
       sozinho, e essa coluna não está protegida como texto). Comparando
       direto contra `desde` — uma string 'AAAA-MM-DD' — o filtro nunca
       batia e a busca sempre trazia a aba inteira, mesmo pedindo só os
       dias recentes. Passar pelo formatarData() antes resolve. */
    if (desde && formatarData(linha.data) < String(desde)) continue;

    var itens = [];
    try { itens = JSON.parse(linha.itens || '[]'); } catch (ignorado) {}

    vendas.push({
      data: formatarData(linha.data),
      order_nsu: String(linha.order_nsu),
      transaction_nsu: String(linha.transaction_nsu),
      cliente: linha.cliente,
      telefone: String(linha.telefone || ''),
      endereco: linha.endereco,
      itens: itens,
      valor: Number(linha.pago_centavos || linha.valor_centavos || 0),
      metodo: linha.metodo,
      recibo: linha.recibo,
      entrega_texto: formatarEntrega(linha.entrega_texto),
      hora_agendada: formatarHora(linha.hora_agendada),
      retirada: linha.retirada === 'sim',
      observacoes: linha.observacoes || '',
    });
  }
  return vendas;
}

/** Um único pedido pago, pelo order_nsu — para a página de confirmação. */
function lerPedido(orderNsu) {
  var valores = aba().getDataRange().getValues();

  for (var i = 1; i < valores.length; i++) {
    var linha = {};
    for (var c = 0; c < COLUNAS.length; c++) linha[COLUNAS[c]] = valores[i][c];

    if (String(linha.order_nsu) !== String(orderNsu)) continue;
    if (linha.status !== 'pago') return null;

    var itensBrutos = [];
    try { itensBrutos = JSON.parse(linha.itens || '[]'); } catch (ignorado) {}
    var itens = itensBrutos.map(function (i) {
      return { nome: i.description, qtd: i.quantity, preco: i.price };
    });

    return {
      nome: linha.cliente,
      telefone: String(linha.telefone || ''),
      itens: itens,
      total: Number(linha.pago_centavos || linha.valor_centavos || 0),
      entrega: linha.retirada !== 'sim',
      endereco: linha.endereco,
      data: formatarEntrega(linha.entrega_texto),
      hora: formatarHora(linha.hora_agendada),
      observacoes: linha.observacoes || '',
    };
  }
  return null;
}

// ===========================================================================
// ENCOMENDAS — lista para o painel, abrir/fechar e marcar recebido/entregue
// ===========================================================================

var TIPOS_ENCOMENDA = ['natal', 'confraternizacao'];

/** Aberta por padrão; a Tati fecha pelo painel (ou pelo ENCOMENDAS no site). */
function lerStatusEncomendas() {
  var props = PropertiesService.getScriptProperties();
  var r = {};
  for (var i = 0; i < TIPOS_ENCOMENDA.length; i++) {
    r[TIPOS_ENCOMENDA[i]] = props.getProperty('encomendas_' + TIPOS_ENCOMENDA[i]) !== 'false';
  }
  return r;
}

function salvarStatusEncomendas(dados) {
  if (!tokenConfere(dados.token)) return { ok: false, erro: 'Token inválido.' };
  if (TIPOS_ENCOMENDA.indexOf(dados.tipo) === -1) return { ok: false, erro: 'Tipo de encomenda inválido.' };
  PropertiesService.getScriptProperties().setProperty('encomendas_' + dados.tipo, dados.aberta === false ? 'false' : 'true');
  return { ok: true, status: lerStatusEncomendas() };
}

/** Todas as encomendas, com os números em centavos, para o painel. */
function lerEncomendas() {
  var folha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_ENCOMENDAS);
  if (!folha) return [];
  var valores = folha.getDataRange().getValues();
  var cab = valores[0];
  var lista = [];
  for (var i = 1; i < valores.length; i++) {
    var l = {};
    for (var c = 0; c < COLUNAS_ENC.length; c++) {
      var coluna = cab.indexOf(COLUNAS_ENC[c]);
      var v = coluna === -1 ? '' : valores[i][coluna];
      l[COLUNAS_ENC[c]] = ehData(v) ? Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm') : v;
    }
    if (!l.order_nsu || l.status === 'aguardando pagamento') continue;
    lista.push({
      order_nsu: String(l.order_nsu),
      registrado_em: String(l.registrado_em),
      status: String(l.status),
      cliente: String(l.cliente),
      telefone: String(l.telefone),
      data_entrega: String(l.data_entrega),
      data_iso: String(l.data_iso).slice(0, 10),
      horario: String(l.horario),
      entrega_ou_retirada: String(l.entrega_ou_retirada),
      endereco: String(l.endereco),
      itens: String(l.itens),
      total: Number(l.total_centavos) || 0,
      sinal_percentual: Number(l.sinal_percentual) || 0,
      pago: Number(l.pago_centavos) || 0,
      restante: Number(l.restante_centavos) || 0,
      forma_pagamento: String(l.forma_pagamento),
      observacoes: String(l.observacoes),
      tipo: String(l.tipo) || 'natal',
      quitado_em: String(l.quitado_em).slice(0, 10),
      entregue_em: String(l.entregue_em).slice(0, 10),
    });
  }
  return lista;
}

/**
 * Marca uma encomenda como "restante recebido" ou "entregue" (ou desfaz).
 * dados: { token, order_nsu, campo: 'quitado'|'entregue', valor: true|false }
 */
function marcarEncomenda(dados) {
  if (!tokenConfere(dados.token)) return { ok: false, erro: 'Token inválido.' };
  if (dados.campo !== 'quitado' && dados.campo !== 'entregue') return { ok: false, erro: 'Campo inválido.' };
  var folha = abaEncomendas();
  var valores = folha.getDataRange().getValues();
  var colOrder = COLUNAS_ENC.indexOf('order_nsu');
  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][colOrder]) !== String(dados.order_nsu)) continue;
    var linha = i + 1;
    var hoje = hojeISO();
    var total = Number(valores[i][COLUNAS_ENC.indexOf('total_centavos')]) || 0;
    if (dados.campo === 'entregue') {
      folha.getRange(linha, COLUNAS_ENC.indexOf('entregue_em') + 1).setValue(dados.valor ? hoje : '');
    } else if (dados.valor) {
      // Restante recebido na entrega: o pago passa a ser o total.
      folha.getRange(linha, COLUNAS_ENC.indexOf('pago_centavos') + 1).setValue(total);
      folha.getRange(linha, COLUNAS_ENC.indexOf('restante_centavos') + 1).setValue(0);
      folha.getRange(linha, COLUNAS_ENC.indexOf('quitado_em') + 1).setValue(hoje);
      folha.getRange(linha, COLUNAS_ENC.indexOf('status') + 1).setValue('quitado');
    } else {
      // Desfazer: volta ao que o pagamento online registrou (sinal).
      var sinalPct = Number(valores[i][COLUNAS_ENC.indexOf('sinal_percentual')]) || 100;
      var pagoOnline = Math.round(total * sinalPct / 100);
      folha.getRange(linha, COLUNAS_ENC.indexOf('pago_centavos') + 1).setValue(pagoOnline);
      folha.getRange(linha, COLUNAS_ENC.indexOf('restante_centavos') + 1).setValue(Math.max(0, total - pagoOnline));
      folha.getRange(linha, COLUNAS_ENC.indexOf('quitado_em') + 1).setValue('');
      folha.getRange(linha, COLUNAS_ENC.indexOf('status') + 1).setValue(sinalPct < 100 ? 'sinal pago' : 'pago 100%');
    }
    return { ok: true };
  }
  return { ok: false, erro: 'Encomenda não encontrada.' };
}

// ===========================================================================
// Ligar/desligar o cardápio
//
// Controle manual, separado do dia/horário programado no site — para
// estender o expediente num teste ou fechar de repente sem precisar
// mexer em código. Fica guardado nas propriedades do script, não numa
// aba: é um valor só, não uma lista.
// ===========================================================================

function lerStatusLoja() {
  var valor = PropertiesService.getScriptProperties().getProperty('cardapio_aberto');
  // Sem valor gravado ainda = aberto, o padrão de sempre.
  return valor !== 'false';
}

function salvarStatusLoja(dados) {
  if (!tokenConfere(dados.token)) return { ok: false, erro: 'Token inválido.' };
  PropertiesService.getScriptProperties().setProperty('cardapio_aberto', dados.aberto ? 'true' : 'false');
  return { ok: true, aberto: !!dados.aberto };
}

/**
 * Estende o atendimento numa data específica (uma exceção, um teste),
 * sem mexer no horário padrão do site. Guarda só uma janela por vez —
 * a de agora substitui a anterior, e mandar sem data/horário limpa.
 */
function lerHorarioExtra() {
  var bruto = PropertiesService.getScriptProperties().getProperty('horario_extra');
  if (!bruto) return null;
  try { return JSON.parse(bruto); } catch (ignorado) { return null; }
}

function salvarHorarioExtra(dados) {
  if (!tokenConfere(dados.token)) return { ok: false, erro: 'Token inválido.' };

  if (!dados.data || !dados.abre || !dados.fecha) {
    PropertiesService.getScriptProperties().deleteProperty('horario_extra');
    return { ok: true, horario: null };
  }

  var horario = { data: dados.data, abre: dados.abre, fecha: dados.fecha };
  PropertiesService.getScriptProperties().setProperty('horario_extra', JSON.stringify(horario));
  return { ok: true, horario: horario };
}

// ===========================================================================
// Itens esgotados
//
// O cardápio é um arquivo estático: o painel não tem como alterar o que
// o cliente vê. A lista de esgotados fica aqui no meio, onde os dois
// alcançam — o painel grava, o cardápio lê.
// ===========================================================================

var ABA_ESGOTADOS = 'Esgotados';

function abaEsgotados() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var folha = planilha.getSheetByName(ABA_ESGOTADOS);

  if (!folha) {
    folha = planilha.insertSheet(ABA_ESGOTADOS);
    folha.appendRow(['produto', 'esgotado_em']);
    folha.setFrozenRows(1);
  }
  return folha;
}

function lerEsgotados() {
  var valores = abaEsgotados().getDataRange().getValues();
  var lista = [];

  for (var i = 1; i < valores.length; i++) {
    var nome = String(valores[i][0] || '').trim();
    if (nome) lista.push(nome);
  }
  return lista;
}

/**
 * Substitui a lista inteira pela que o painel mandou.
 *
 * Gravar a lista completa em vez de marcar item a item evita ficar com
 * um produto esgotado esquecido: o que não vier na lista volta a ser
 * vendido, e o painel manda sempre o estado inteiro.
 */
function salvarEsgotados(dados) {
  if (!tokenConfere(dados.token)) return { ok: false, erro: 'Token inválido.' };

  var lista = (dados.esgotados || []).map(function (n) { return String(n).trim(); })
    .filter(function (n) { return n; });

  var folha = abaEsgotados();
  if (folha.getLastRow() > 1) {
    folha.getRange(2, 1, folha.getLastRow() - 1, 2).clearContent();
  }

  var agora = new Date();
  for (var i = 0; i < lista.length; i++) {
    folha.getRange(i + 2, 1).setValue(lista[i]);
    folha.getRange(i + 2, 2).setValue(agora);
  }

  return { ok: true, esgotados: lista };
}

// ===========================================================================
// Diagnóstico — o que fica invisível na conferência do dia a dia
// ===========================================================================

/**
 * Mostra o que a lista de vendas esconde: os pedidos que geraram link mas
 * nunca foram confirmados, e os erros que o webhook registrou.
 *
 * Um pedido pago que não aparece na planilha cai num destes dois lugares —
 * ou em nenhum, e aí o link foi criado fora do cardápio.
 */
function diagnostico() {
  var folha = aba();
  var valores = folha.getDataRange().getValues();
  var pendentes = [];

  for (var i = 1; i < valores.length; i++) {
    var linha = {};
    for (var c = 0; c < COLUNAS.length; c++) linha[COLUNAS[c]] = valores[i][c];
    if (linha.status === 'pago') continue;

    pendentes.push({
      data: formatarData(linha.data),
      order_nsu: String(linha.order_nsu),
      cliente: linha.cliente,
      valor: Number(linha.valor_centavos || 0),
      status: linha.status,
      registrado_em: String(linha.registrado_em),
    });
  }

  var erros = [];
  var folhaErros = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Erros');
  if (folhaErros) {
    var linhasErro = folhaErros.getDataRange().getValues();
    // Os mais recentes primeiro, no máximo 20.
    for (var e = linhasErro.length - 1; e >= 0 && erros.length < 20; e--) {
      if (!linhasErro[e][0]) continue;
      erros.push({
        quando: String(linhasErro[e][0]),
        onde: String(linhasErro[e][1]),
        mensagem: String(linhasErro[e][2]).slice(0, 300),
      });
    }
  }

  return {
    totalLinhas: Math.max(0, valores.length - 1),
    pendentes: pendentes,
    erros: erros,
    urlWebhook: ScriptApp.getService().getUrl(),
  };
}

// ===========================================================================
// Utilidades
// ===========================================================================

function json(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

function somar(itens) {
  var total = 0;
  for (var i = 0; i < itens.length; i++) {
    total += (itens[i].price || 0) * (itens[i].quantity || 0);
  }
  return total;
}

function traduzirMetodo(metodo) {
  if (metodo === 'credit_card') return 'Cartão de crédito';
  if (metodo === 'debit_card') return 'Cartão de débito';
  if (metodo === 'pix') return 'Pix';
  return metodo || '';
}

function hojeISO() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
}

var DIAS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function ehData(valor) {
  return Object.prototype.toString.call(valor) === '[object Date]';
}

/* As linhas gravadas antes da correção têm data de verdade no lugar do
   texto. Em vez de perder esses pedidos, traduzimos de volta na leitura. */
function formatarEntrega(valor) {
  if (!ehData(valor)) return String(valor || '');

  var iso = Utilities.formatDate(valor, 'America/Sao_Paulo', 'yyyy-MM-dd').split('-');
  var dia = new Date(Number(iso[0]), Number(iso[1]) - 1, Number(iso[2]));
  return DIAS_PT[dia.getDay()] + ', ' + iso[2] + '/' + iso[1];
}

function formatarHora(valor) {
  if (!ehData(valor)) return String(valor || '');
  return Utilities.formatDate(valor, 'America/Sao_Paulo', 'HH:mm');
}

function formatarData(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, 'America/Sao_Paulo', 'yyyy-MM-dd');
  }
  return String(valor);
}

function registrarErro(onde, erro) {
  console.error('[' + onde + '] ' + erro);
  try {
    var planilha = SpreadsheetApp.getActiveSpreadsheet();
    var folha = planilha.getSheetByName('Erros') || planilha.insertSheet('Erros');
    folha.appendRow([new Date(), onde, String(erro)]);
  } catch (ignorado) {}
}

// ===========================================================================
// Teste — rode uma vez pelo editor para conferir se está tudo de pé
// ===========================================================================

function testarConfiguracao() {
  var problemas = [];
  var avisos = [];

  if (!CONFIG.HANDLE || CONFIG.HANDLE.indexOf('$') === 0) {
    problemas.push('HANDLE vazia ou com $ na frente.');
  }
  if (!tokenPainel()) {
    problemas.push('Falta a propriedade TOKEN_PAINEL (Configurações do projeto > Propriedades do script). Sem ela o painel não consegue ler as vendas.');
  }

  // Curto não impede de funcionar, mas facilita muito quem tentar adivinhar.
  if (tokenPainel() && tokenPainel().length < 20) {
    problemas.push('TOKEN_PAINEL tem ' + tokenPainel().length + ' caracteres. Use 20 ou mais — senha curta é recusada.');
  }

  aba();
  console.log('Aba "' + CONFIG.ABA + '" pronta.');

  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (ignorado) {}
  console.log(url ? 'URL do app: ' + url : 'Ainda não publicado. Faça a Implantação primeiro.');

  if (problemas.length) console.log('\nPROBLEMAS:\n- ' + problemas.join('\n- '));
  if (avisos.length) console.log('\nAVISOS (não impedem de funcionar):\n- ' + avisos.join('\n- '));
  if (!problemas.length && !avisos.length) console.log('\nConfiguração ok.');

  return { problemas: problemas, avisos: avisos };
}
