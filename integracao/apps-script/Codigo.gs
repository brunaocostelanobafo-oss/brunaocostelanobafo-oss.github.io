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

  // Senha que o painel usa para provar que é você ao pedir as vendas.
  // É a única coisa que impede um estranho de ler seu faturamento.
  // Quanto mais longa, melhor — o ideal são 20 caracteres ou mais.
  TOKEN_PAINEL: 'bru261308',

  // Endereço do cardápio, para onde o cliente volta depois de pagar.
  URL_SITE: 'https://brunaocostelanobafo-oss.github.io',

  // Nome da aba da planilha onde as vendas são gravadas.
  ABA: 'Vendas',
};

var API = 'https://api.checkout.infinitepay.io';

var COLUNAS = [
  'data', 'order_nsu', 'transaction_nsu', 'slug', 'cliente', 'telefone',
  'endereco', 'itens', 'valor_centavos', 'pago_centavos', 'parcelas',
  'metodo', 'recibo', 'status', 'registrado_em',
  // Para o ticket de expedição: quando entregar, não quando compraram.
  'entrega_texto', 'hora_agendada', 'retirada', 'observacoes',
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

    /* A página de confirmação de pagamento também é pública, e não pode
       depender do que ficou guardado no navegador do cliente — alguns
       navegadores internos (Instagram, Facebook) perdem esse dado na
       ida e volta até a InfinitePay. O order_nsu já funciona como uma
       senha de fato: é longo, único e só quem pagou o tem. Só devolve
       pedido com status 'pago', nunca um pendente. */
    if (p.acao === 'pedido' && p.order_nsu) {
      return json({ ok: true, pedido: lerPedido(p.order_nsu) });
    }

    if (p.token !== CONFIG.TOKEN_PAINEL) {
      return json({ ok: false, erro: 'Token inválido.' });
    }

    if (p.acao === 'vendas') return json({ ok: true, vendas: lerVendas(p.desde) });
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

  // Número do pedido: data + sequência, para você reconhecer na planilha.
  var orderNsu = dados.order_nsu || gerarOrderNsu();

  var payload = {
    handle: CONFIG.HANDLE,
    items: itens.map(function (i) {
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
    if (dados.cliente.telefone) payload.customer.phone_number = dados.cliente.telefone;
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

  return { ok: true, url: url, order_nsu: orderNsu };
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
  return { ok: true };
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
     Marcar as colunas como texto impede a conversão. */
    var col = indiceDe('entrega_texto') + 1;
    folha.getRange(1, col, folha.getMaxRows(), 2).setNumberFormat('@');

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

  for (var i = 0; i < COLUNAS.length; i++) if (linha[i] === undefined) linha[i] = '';
  aba().appendRow(linha);
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
    if (desde && String(linha.data) < String(desde)) continue;

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
  if (dados.token !== CONFIG.TOKEN_PAINEL) return { ok: false, erro: 'Token inválido.' };

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
  if (!CONFIG.TOKEN_PAINEL || CONFIG.TOKEN_PAINEL.indexOf('TROQUE') === 0) {
    problemas.push('TOKEN_PAINEL ainda é o valor de exemplo — invente uma senha sua.');
  }

  // Curto não impede de funcionar, mas facilita muito quem tentar adivinhar.
  if (CONFIG.TOKEN_PAINEL && CONFIG.TOKEN_PAINEL.length < 20) {
    avisos.push('TOKEN_PAINEL tem ' + CONFIG.TOKEN_PAINEL.length + ' caracteres. ' +
      'Funciona, mas 20 ou mais deixa bem mais difícil de adivinhar.');
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
