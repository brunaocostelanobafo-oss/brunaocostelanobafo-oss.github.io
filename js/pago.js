/*
 * Página de pós-pagamento.
 *
 * A InfinitePay traz o cliente de volta para cá com os dados do pagamento
 * na URL. O detalhe do pedido (itens, data, endereço) vem do que o
 * cardápio guardou antes de sair para o checkout.
 *
 * Esta página é confirmação para o cliente. O pedido em si você já
 * recebeu: o webhook grava na planilha e ele aparece no painel, mesmo
 * que o cliente feche esta tela.
 */

(function () {
  'use strict';

  const CHAVE = 'brunao:ultimo-pedido';

  function precoBR(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function parametros() {
    const p = new URLSearchParams(location.search);
    return {
      orderNsu: p.get('order_nsu') || '',
      transactionNsu: p.get('transaction_nsu') || '',
      slug: p.get('slug') || '',
      metodo: p.get('capture_method') || '',
      recibo: p.get('receipt_url') || '',
    };
  }

  function lerPedidoLocal() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE) || 'null');
    } catch {
      return null;
    }
  }

  /**
   * Busca o pedido direto da planilha, pelo order_nsu — fonte confiável,
   * que não depende do navegador do cliente ter guardado nada. Alguns
   * navegadores internos (Instagram, Facebook) perdem o que ficou salvo
   * no aparelho quando o cliente sai para pagar na InfinitePay e volta;
   * a planilha não tem esse problema.
   */
  function buscarPedidoServidor(orderNsu) {
    if (!orderNsu || !LOJA.pagamentoOnline || !LOJA.pagamentoOnline.urlScript) {
      return Promise.resolve(null);
    }
    const url = `${LOJA.pagamentoOnline.urlScript}?acao=pedido&order_nsu=${encodeURIComponent(orderNsu)}`;
    return fetch(url)
      .then((r) => r.json())
      .then((resposta) => (resposta.ok ? resposta.pedido : null))
      .catch(() => null);
  }

  function nomeDoMetodo(metodo) {
    if (metodo === 'credit_card') return 'cartão de crédito';
    if (metodo === 'debit_card') return 'cartão de débito';
    if (metodo === 'pix') return 'Pix';
    return '';
  }

  async function montar() {
    const dados = parametros();
    const pedido = (await buscarPedidoServidor(dados.orderNsu)) || lerPedidoLocal();

    // Subtítulo
    const metodo = nomeDoMetodo(dados.metodo);
    document.getElementById('pago-sub').textContent = metodo
      ? `Recebemos seu pagamento por ${metodo}.`
      : 'Recebemos seu pagamento.';

    // Itens
    if (pedido && pedido.itens && pedido.itens.length) {
      const lista = document.getElementById('pago-itens');
      for (const item of pedido.itens) {
        const li = document.createElement('li');
        li.textContent = `${item.qtd}x ${item.nome}`;
        const valor = document.createElement('span');
        valor.textContent = precoBR(item.preco * item.qtd);
        li.appendChild(valor);
        lista.appendChild(li);
      }
      document.getElementById('pago-total').textContent = `Total pago: ${precoBR(pedido.total)}`;
      document.getElementById('bloco-pedido').hidden = false;
    }

    // Data e endereço
    if (pedido && pedido.data) {
      document.getElementById('entrega-titulo').textContent =
        pedido.entrega ? 'Sua entrega' : 'Sua retirada';
      document.getElementById('pago-data').textContent = pedido.data;

      const endereco = document.getElementById('pago-endereco');
      if (pedido.entrega && pedido.endereco) {
        endereco.textContent = '📍 ' + pedido.endereco;
      } else if (!pedido.entrega) {
        endereco.textContent = '📍 Retirada no local';
      }
      document.getElementById('bloco-entrega').hidden = false;
    }

    // Instruções de entrega
    const instrucoes = document.getElementById('pago-instrucoes');
    for (const paragrafo of (LOJA.textoEntrega || [])) {
      const p = document.createElement('p');
      p.className = 'pago__instrucao';
      p.textContent = paragrafo;
      instrucoes.appendChild(p);
    }

    if (pedido && pedido.hora) {
      const nota = document.getElementById('pago-agendado');
      nota.textContent = `Você agendou para as ${pedido.hora}. Vamos respeitar esse horário.`;
      nota.hidden = false;
    }

    // Comprovante
    if (dados.recibo) {
      document.getElementById('pago-recibo').href = dados.recibo;
      document.getElementById('pago-recibo-linha').hidden = false;
    }

    // WhatsApp com a mensagem pronta
    document.getElementById('pago-zap').href =
      `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(mensagem(pedido, dados))}`;

    await rastrearCompra(dados, pedido);

    // O pedido já foi usado; limpar evita que uma visita futura a esta
    // página mostre um pedido antigo como se fosse novo.
    try {
      localStorage.removeItem(CHAVE);
      localStorage.removeItem('brunao:carrinho');
    } catch { /* sem problema */ }
  }

  const PIXEL_ID = '4433696376853064';

  /** SHA-256 em hexadecimal — formato que o Meta exige pra correspondência
      avançada (nunca manda telefone/nome em texto puro). */
  async function sha256Hex(texto) {
    const bytes = new TextEncoder().encode(texto);
    const buffer = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** O Meta espera só dígitos, com código do país — sem espaço, +, ( ) ou -. */
  function telefoneNormalizado(tel) {
    let digitos = String(tel || '').replace(/\D/g, '');
    if (digitos && !digitos.startsWith('55')) digitos = '55' + digitos;
    return digitos;
  }

  /**
   * Reforça a correspondência avançada com o telefone do cliente antes do
   * Purchase — o Meta usa isso pra ligar a compra ao clique do anúncio que
   * a originou. Sem esse reforço, a correspondência fica fraca e algumas
   * vendas que vieram de anúncio real acabam sem crédito na campanha.
   */
  async function reforcarCorrespondencia(pedido) {
    const digitos = telefoneNormalizado(pedido && pedido.telefone);
    if (!digitos) return;
    try {
      const hash = await sha256Hex(digitos);
      fbq('init', PIXEL_ID, { ph: hash });
    } catch { /* sem Web Crypto (http, navegador antigo): segue sem reforço */ }
  }

  /**
   * Só dispara com pagamento de verdade confirmado pela InfinitePay
   * (order_nsu + recibo, que só existem depois da aprovação — nunca na
   * criação do link) e só uma vez por pedido, mesmo que a página seja
   * recarregada.
   */
  async function rastrearCompra(dados, pedido) {
    if (typeof fbq !== 'function') return;
    if (!dados.orderNsu || !dados.recibo || !pedido || !pedido.total) return;

    const chaveJaEnviado = 'brunao:purchase-enviado:' + dados.orderNsu;
    try {
      if (localStorage.getItem(chaveJaEnviado)) return;
      localStorage.setItem(chaveJaEnviado, '1');
    } catch { /* sem localStorage, segue e aceita o risco de reenviar */ }

    await reforcarCorrespondencia(pedido);

    fbq('track', 'Purchase', {
      value: pedido.total / 100,
      currency: 'BRL',
    }, { eventID: dados.orderNsu });
  }

  function mensagem(pedido, dados) {
    const linhas = ['Olá! Acabei de fazer um pedido pelo site.', ''];

    if (pedido && pedido.nome) linhas.push(`*Cliente:* ${pedido.nome}`);
    if (dados.orderNsu) linhas.push(`*Pedido:* ${dados.orderNsu}`);

    if (pedido && pedido.itens) {
      linhas.push('');
      for (const item of pedido.itens) linhas.push(`${item.qtd}x ${item.nome}`);
      linhas.push('', `*Total pago:* ${precoBR(pedido.total)}`);
    }

    if (pedido && pedido.data) {
      linhas.push('', `*${pedido.entrega ? 'Entrega' : 'Retirada'}:* ${pedido.data}`);
      if (pedido.hora) linhas.push(`*Horário agendado:* ${pedido.hora}`);
      if (pedido.entrega && pedido.endereco) linhas.push(`*Endereço:* ${pedido.endereco}`);
    }

    if (pedido && pedido.observacoes) linhas.push(`*Observações:* ${pedido.observacoes}`);

    return linhas.join('\n');
  }

  document.addEventListener('DOMContentLoaded', montar);
})();
