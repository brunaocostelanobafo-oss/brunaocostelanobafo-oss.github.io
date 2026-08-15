/*
 * Cardápio digital — Brunão Costela no Bafo
 *
 * Monta a página a partir de `js/menu-data.js`, controla o carrinho
 * e gera a mensagem do pedido para o WhatsApp.
 *
 * Regras de negócio da casa:
 *   - Delivery aos sábados, domingos e feriados, das 11h às 14h.
 *   - Reserva confirmada de segunda a sexta ganha a entrega grátis
 *     (liga/desliga em LOJA.reserva.freteGratis).
 *
 * Não precisa editar este arquivo para mudar itens, preços ou horários.
 */

(function () {
  'use strict';

  const CHAVE_STORAGE = 'brunao:carrinho';
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  /** Carrinho: { [nomeDoItem]: quantidade } */
  let carrinho = carregarCarrinho();

  // -------------------------------------------------------------- Meta Pixel

  /** fbq pode não existir (bloqueador de anúncios, script ainda carregando). */
  function rastrear(evento, dados) {
    if (typeof fbq === 'function') fbq('track', evento, dados);
  }

  const itensJaVistos = new Set();
  /** Primeiro "+" de cada item conta como interesse real no produto. */
  function rastrearVisualizacaoItem(item) {
    if (itensJaVistos.has(item.nome)) return;
    itensJaVistos.add(item.nome);
    rastrear('ViewContent', {
      content_name: item.nome,
      content_type: 'product',
      value: item.preco / 100,
      currency: 'BRL',
    });
  }

  let checkoutJaRastreado = false;
  /** Uma vez por sessão: abrir o carrinho várias vezes não é um novo início de compra. */
  function rastrearInicioCheckout() {
    if (checkoutJaRastreado) return;
    checkoutJaRastreado = true;
    rastrear('InitiateCheckout', {
      value: totalGeral() / 100,
      currency: 'BRL',
      num_items: quantidadeTotal(),
    });
  }

  // ---------------------------------------------------------------- utilidades

  /** 8990 -> "R$ 89,90" */
  function precoBR(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function todosOsItens() {
    return CARDAPIO.flatMap((categoria) => categoria.itens);
  }

  function acharItem(nome) {
    return todosOsItens().find((item) => item.nome === nome);
  }

  function carregarCarrinho() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_STORAGE) || '{}');
      // Descarta itens que saíram do cardápio desde a última visita.
      const valido = {};
      for (const [nome, qtd] of Object.entries(salvo)) {
        if (acharItem(nome) && Number.isInteger(qtd) && qtd > 0) valido[nome] = qtd;
      }
      return valido;
    } catch {
      return {};
    }
  }

  function salvarCarrinho() {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(carrinho));
    } catch {
      /* modo privado do navegador — segue sem persistir */
    }
  }

  // -------------------------------------------------------- datas e calendário

  /** Data local no formato AAAA-MM-DD (sem passar por UTC). */
  function iso(data) {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
  }

  /** "25/07" */
  function diaMes(data) {
    return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
  }

  function ehFeriado(data) {
    return LOJA.feriados.includes(iso(data));
  }

  /** Sábado, domingo ou feriado. */
  function ehDiaDeEntrega(data) {
    return LOJA.entrega.diasSemana.includes(data.getDay()) || ehFeriado(data);
  }

  /** Dia em que a reserva antecipada dá direito ao benefício. */
  function ehDiaDeReserva(data) {
    return LOJA.reserva.ativa && LOJA.reserva.diasSemana.includes(data.getDay()) && !ehFeriado(data);
  }

  /** Minutos desde a meia-noite. "11:00" -> 660 */
  function emMinutos(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function minutosAgora(data) {
    return data.getHours() * 60 + data.getMinutes();
  }

  /** "11:30" + 30 -> "12:00" */
  function somarMinutos(hhmm, minutos) {
    const total = emMinutos(hhmm) + minutos;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  /** As próximas datas em que a loja entrega, a partir de hoje. */
  function proximasDatasDeEntrega(quantas, hoje = new Date()) {
    quantas = quantas || LOJA.entrega.datasOferecidas || 6;
    const datas = [];
    const { fecha } = LOJA.entrega.horario;

    for (let i = 0; datas.length < quantas && i <= 90; i++) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
      if (!ehDiaDeEntrega(data)) continue;
      // Hoje só entra na lista se ainda dá tempo de entregar.
      if (i === 0 && minutosAgora(hoje) >= emMinutos(fecha)) continue;
      datas.push(data);
    }
    return datas;
  }

  function rotuloData(data, hoje = new Date()) {
    const base = `${DIAS[data.getDay()]}, ${diaMes(data)}`;
    const partes = [];
    if (iso(data) === iso(hoje)) partes.push('hoje');
    if (ehFeriado(data)) partes.push('feriado');
    return partes.length ? `${base} (${partes.join(' · ')})` : base;
  }

  // ------------------------------------------------------------ estado da loja

  /**
   * 'entregando' — é dia de entrega e estamos dentro do horário
   * 'reserva'    — segunda a sexta: dá para reservar e ganhar a entrega
   * 'fechado'    — dia de entrega, mas fora do horário
   */
  function estadoDaLoja(agora = new Date()) {
    const { abre, fecha } = LOJA.entrega.horario;

    if (ehDiaDeEntrega(agora)) {
      const dentro = minutosAgora(agora) >= emMinutos(abre) && minutosAgora(agora) < emMinutos(fecha);
      if (dentro) return { modo: 'entregando', abre, fecha };
      return { modo: 'fechado', abre, fecha };
    }

    if (ehDiaDeReserva(agora)) return { modo: 'reserva', abre, fecha };
    return { modo: 'fechado', abre, fecha };
  }

  // ------------------------------------------------------------------- contas

  function subtotal() {
    return Object.entries(carrinho).reduce((soma, [nome, qtd]) => {
      const item = acharItem(nome);
      return item ? soma + item.preco * qtd : soma;
    }, 0);
  }

  function quantidadeTotal() {
    return Object.values(carrinho).reduce((soma, qtd) => soma + qtd, 0);
  }

  function ehEntrega() {
    const escolha = document.querySelector('input[name="entrega"]:checked');
    return !escolha || escolha.value === 'entrega';
  }

  /** A reserva de hoje dá direito à entrega grátis? */
  function temFreteGratis(hoje = new Date()) {
    return LOJA.reserva.ativa && LOJA.reserva.freteGratis && ehDiaDeReserva(hoje);
  }

  function taxaAtual() {
    if (!ehEntrega()) return 0;
    if (temFreteGratis()) return 0;
    return LOJA.taxaEntrega;
  }

  function pagamentoOnlineLigado() {
    return !!(LOJA.pagamentoOnline && LOJA.pagamentoOnline.ativa && LOJA.pagamentoOnline.urlScript);
  }

  /** Agendar horário certo é opcional e só faz sentido na entrega. */
  function querAgendar() {
    const marca = document.getElementById('check-agendar');
    return !!(marca && marca.checked && ehEntrega() && LOJA.agendamentoHorario.ativo);
  }

  function taxaAgendamento() {
    return querAgendar() ? LOJA.agendamentoHorario.taxa : 0;
  }

  /**
   * Horários que podem ser agendados, dentro da janela de entrega.
   *
   * Um campo de hora livre deixava o cliente escolher 03:00 ou 22:45,
   * quando não há operação. A lista fechada torna o horário inválido
   * impossível de escolher, em vez de recusado depois.
   *
   * O último horário da janela fica de fora: às 14:00 a rota encerra,
   * então não dá para começar uma entrega ali.
   */
  function horariosAgendaveis() {
    const { abre, fecha } = LOJA.entrega.horario;
    const passo = LOJA.agendamentoHorario.intervaloMinutos || 30;
    const lista = [];

    for (let m = emMinutos(abre); m < emMinutos(fecha); m += passo) {
      const h = String(Math.floor(m / 60)).padStart(2, '0');
      const min = String(m % 60).padStart(2, '0');
      lista.push(`${h}:${min}`);
    }
    return lista;
  }

  function totalGeral() {
    return subtotal() + taxaAtual() + taxaAgendamento();
  }

  // -------------------------------------------------------------- renderização

  function montarTopo() {
    document.getElementById('loja-nome').textContent = LOJA.nome;
    document.getElementById('loja-tagline').textContent = LOJA.tagline;
    document.getElementById('loja-selo').textContent = LOJA.selo;
    document.getElementById('loja-desde').textContent = `Desde ${LOJA.desde}`;

    const { modo, fecha } = estadoDaLoja();
    const status = document.getElementById('status-loja');
    const texto = {
      entregando: `Entregando até ${fecha}`,
      reserva: 'Reservas abertas',
      fechado: 'Fora do horário',
    };
    status.hidden = false;
    status.classList.add(`topo__status--${modo}`);
    status.querySelector('.status__texto').textContent = texto[modo];

    const nav = document.getElementById('nav-categorias');
    nav.innerHTML = '';
    for (const categoria of CARDAPIO) {
      const link = document.createElement('a');
      link.className = 'categorias__link';
      link.href = `#cat-${categoria.id}`;
      link.textContent = `${categoria.emoji || ''} ${categoria.nome}`.trim();
      nav.appendChild(link);
    }
  }

  function montarAvisos() {
    const alvo = document.getElementById('avisos');
    alvo.innerHTML = '';

    const { modo, abre, fecha } = estadoDaLoja();

    const aviso = document.createElement('div');
    aviso.className = `aviso aviso--${modo}`;

    /* Com a promoção ligada, o bloco de destaque logo abaixo já anuncia a
       entrega grátis. Repetir aqui só ocupava espaço — e falando em
       "hoje", o que confunde: no sábado "hoje" não dá direito ao
       benefício, que é das reservas de segunda a sexta. */
    const destaqueJaAnuncia = modo === 'reserva' && temFreteGratis();

    if (modo === 'reserva') {
      // O horário e os dias já vêm na linha da regra, logo abaixo.
      aviso.innerHTML =
        '<span class="aviso__icone">📅</span>' +
        '<span><strong>Reservas abertas.</strong> Escolha a data na hora do pedido.</span>';
    } else if (modo === 'entregando') {
      aviso.innerHTML =
        '<span class="aviso__icone">🔥</span>' +
        `<span><strong>Estamos entregando agora,</strong> até as ${fecha}.</span>`;
    } else {
      aviso.innerHTML =
        '<span class="aviso__icone">🕒</span>' +
        '<span><strong>Fora do horário de entrega.</strong> ' +
        'Monte seu pedido e reserve para a próxima data — respondemos assim que abrirmos.</span>';
    }
    if (!destaqueJaAnuncia) alvo.appendChild(aviso);

    // A promoção da entrega grátis é o principal argumento de venda da casa,
    // então ganha destaque próprio em vez de virar mais uma linha de aviso.
    if (LOJA.reserva.ativa && LOJA.reserva.freteGratis) {
      const destaque = document.createElement('div');
      destaque.className = 'destaque-frete';
      destaque.innerHTML =
        '<span class="destaque-frete__icone">🎁</span>' +
        '<p class="destaque-frete__texto">Reservas confirmadas de segunda a sexta ' +
        '<strong>ganham entrega grátis</strong></p>';
      alvo.appendChild(destaque);
    }

    const regra = document.createElement('div');
    regra.className = 'aviso aviso--regra';
    regra.innerHTML =
      '<span class="aviso__icone">🛵</span>' +
      `<span>Delivery <strong>sábados, domingos e feriados</strong>, das ${abre} às ${fecha}.</span>`;
    alvo.appendChild(regra);
  }

  function montarCardapio() {
    const alvo = document.getElementById('cardapio');
    alvo.innerHTML = '';

    for (const categoria of CARDAPIO) {
      const secao = document.createElement('section');
      secao.className = 'categoria';
      secao.id = `cat-${categoria.id}`;

      const titulo = document.createElement('h2');
      titulo.className = 'categoria__titulo';
      titulo.textContent = categoria.nome;
      secao.appendChild(titulo);

      if (categoria.descricao) {
        const desc = document.createElement('p');
        desc.className = 'categoria__descricao';
        desc.textContent = categoria.descricao;
        secao.appendChild(desc);
      }

      if (categoria.banner) {
        const banner = document.createElement('div');
        banner.className = 'categoria__banner';
        banner.innerHTML =
          `<span class="categoria__banner__icone">${categoria.banner.icone}</span>` +
          `<p class="categoria__banner__texto">${categoria.banner.texto}` +
          `<strong>${categoria.banner.destaque}</strong></p>`;
        secao.appendChild(banner);
      }

      const lista = document.createElement('div');
      lista.className = 'itens';
      for (const item of categoria.itens) {
        lista.appendChild(montarItem(item));
      }
      secao.appendChild(lista);
      alvo.appendChild(secao);
    }
  }

  const CHAVE_ESGOTADOS = 'brunao:esgotados';

  /** Última lista conhecida. Vale enquanto a nova não chega. */
  function esgotadosSalvos() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_ESGOTADOS) || '[]');
    } catch {
      return [];
    }
  }

  let esgotados = esgotadosSalvos();

  /**
   * Se o cardápio está aceitando pedido agora — controle manual, para
   * estender o expediente num teste ou fechar de repente. Começa
   * aberto: uma falha de rede não pode travar o site sozinha.
   */
  function buscarStatusLoja() {
    if (!pagamentoOnlineLigado()) return;

    fetch(`${LOJA.pagamentoOnline.urlScript}?acao=status`)
      .then((r) => r.text())
      .then((texto) => {
        if (!texto.trim().startsWith('{')) return;
        const r = JSON.parse(texto);
        if (r.ok && r.aberto === false) aplicarLojaFechada();
      })
      .catch(() => { /* sem conexão: mantém o cardápio aberto */ });
  }

  function aplicarLojaFechada() {
    document.body.classList.add('loja-fechada');

    const aviso = document.createElement('div');
    aviso.className = 'aviso aviso--fechado';
    aviso.innerHTML =
      '<span class="aviso__icone">🚫</span>' +
      '<span><strong>Estamos fechados no momento.</strong> Volte em breve!</span>';
    document.getElementById('avisos').prepend(aviso);
  }

  /**
   * Busca a lista de esgotados sem segurar a página.
   *
   * O cardápio abre na hora com a última lista conhecida e se corrige
   * quando a resposta chega. Esperar o Apps Script — que leva segundos —
   * deixaria o cliente olhando tela vazia.
   *
   * Se a busca falhar, a lista antiga continua valendo. É melhor manter
   * um item esgotado do que voltar a vendê-lo por causa de uma falha de
   * rede.
   */
  function buscarEsgotados() {
    if (!pagamentoOnlineLigado()) return;

    fetch(`${LOJA.pagamentoOnline.urlScript}?acao=esgotados`)
      .then((r) => r.text())
      .then((texto) => {
        if (!texto.trim().startsWith('{')) return;
        const resposta = JSON.parse(texto);
        if (!resposta.ok || !Array.isArray(resposta.esgotados)) return;

        esgotados = resposta.esgotados;
        try {
          localStorage.setItem(CHAVE_ESGOTADOS, JSON.stringify(esgotados));
        } catch { /* modo privado */ }

        montarCardapio();
        limparCarrinhoDeEsgotados();
      })
      .catch(() => { /* sem internet: vale a lista antiga */ });
  }

  /** Item que esgotou enquanto o cliente montava o pedido sai do carrinho. */
  function limparCarrinhoDeEsgotados() {
    const removidos = Object.keys(carrinho).filter((nome) => estaEsgotado(nome));
    if (!removidos.length) return;

    for (const nome of removidos) delete carrinho[nome];
    salvarCarrinho();
    atualizarBarra();
    if (!document.getElementById('modal-pedido').hidden) montarModal();

    alert(`Acabou ${removidos.join(', ')}. Tiramos do seu pedido.`);
  }

  function estaEsgotado(nome) {
    return esgotados.some((e) => e.toLowerCase() === String(nome).toLowerCase());
  }

  function montarItem(item) {
    const esgotado = item.disponivel === false || estaEsgotado(item.nome);

    const cartao = document.createElement('article');
    cartao.className = 'item';
    if (item.destaque && !esgotado) cartao.classList.add('item--destaque');
    if (esgotado) cartao.classList.add('item--esgotado');

    if (item.imagem) {
      const foto = document.createElement('img');
      foto.className = 'item__foto';
      foto.src = item.imagem;
      foto.alt = item.nome;
      foto.loading = 'lazy';
      cartao.appendChild(foto);
    }

    const texto = document.createElement('div');
    texto.className = 'item__texto';

    const nome = document.createElement('h3');
    nome.className = 'item__nome';
    nome.textContent = item.nome;
    if (item.destaque && !esgotado) {
      const selo = document.createElement('span');
      selo.className = 'item__selo';
      selo.textContent = item.selo || 'Mais pedido';
      nome.appendChild(selo);
    }
    texto.appendChild(nome);

    if (item.descricao) {
      const desc = document.createElement('p');
      desc.className = 'item__descricao';
      desc.textContent = item.descricao;
      texto.appendChild(desc);
    }

    const preco = document.createElement('p');
    if (esgotado) {
      preco.className = 'item__esgotado-txt';
      preco.textContent = 'Esgotado hoje';
    } else {
      preco.className = 'item__preco';
      preco.textContent = precoBR(item.preco);
    }
    texto.appendChild(preco);

    cartao.appendChild(texto);

    if (!esgotado) {
      const botao = document.createElement('button');
      botao.className = 'item__add';
      botao.type = 'button';
      botao.textContent = '+';
      botao.setAttribute('aria-label', `Adicionar ${item.nome} ao pedido`);
      botao.addEventListener('click', () => alterarQuantidade(item.nome, 1));
      cartao.appendChild(botao);
    }

    return cartao;
  }

  // ---------------------------------------------------------------- carrinho

  function alterarQuantidade(nome, delta) {
    const nova = (carrinho[nome] || 0) + delta;
    if (nova <= 0) {
      delete carrinho[nome];
    } else {
      carrinho[nome] = nova;
    }
    if (delta > 0) {
      const item = acharItem(nome);
      if (item) rastrearVisualizacaoItem(item);
    }
    salvarCarrinho();
    atualizarBarra();
    if (!document.getElementById('modal-pedido').hidden) montarModal();
  }

  function atualizarBarra() {
    const barra = document.getElementById('barra-carrinho');
    const qtd = quantidadeTotal();
    barra.hidden = qtd === 0;
    // Marca no body para o botão do WhatsApp sair da frente da barra.
    document.body.classList.toggle('tem-carrinho', qtd > 0);
    if (qtd === 0) return;
    document.getElementById('carrinho-qtd').textContent = String(qtd);
    document.getElementById('carrinho-total').textContent = precoBR(subtotal());
  }

  function montarModal() {
    montarListaPedido();
    montarResumo();
  }

  function montarListaPedido() {
    const lista = document.getElementById('lista-pedido');
    lista.innerHTML = '';

    const nomes = Object.keys(carrinho);
    if (nomes.length === 0) {
      const vazio = document.createElement('li');
      vazio.className = 'pedido-vazio';
      vazio.textContent = 'Seu pedido está vazio.';
      lista.appendChild(vazio);
      return;
    }

    for (const nome of nomes) {
      const item = acharItem(nome);
      if (!item) continue;
      const qtd = carrinho[nome];

      const linha = document.createElement('li');
      linha.className = 'linha-pedido';

      const texto = document.createElement('div');
      texto.className = 'linha-pedido__texto';
      texto.innerHTML = '<div class="linha-pedido__nome"></div><div class="linha-pedido__preco"></div>';
      texto.querySelector('.linha-pedido__nome').textContent = item.nome;
      texto.querySelector('.linha-pedido__preco').textContent =
        `${precoBR(item.preco)} · subtotal ${precoBR(item.preco * qtd)}`;
      linha.appendChild(texto);

      const contador = document.createElement('div');
      contador.className = 'contador';
      contador.appendChild(
        botaoContador('−', `Remover uma unidade de ${item.nome}`, () => alterarQuantidade(nome, -1))
      );

      const valor = document.createElement('span');
      valor.className = 'contador__valor';
      valor.textContent = String(qtd);
      contador.appendChild(valor);

      contador.appendChild(
        botaoContador('+', `Adicionar uma unidade de ${item.nome}`, () => alterarQuantidade(nome, 1))
      );

      linha.appendChild(contador);
      lista.appendChild(linha);
    }
  }

  function botaoContador(rotulo, aria, aoClicar) {
    const botao = document.createElement('button');
    botao.className = 'contador__botao';
    botao.type = 'button';
    botao.textContent = rotulo;
    botao.setAttribute('aria-label', aria);
    botao.addEventListener('click', aoClicar);
    return botao;
  }

  function montarResumo() {
    const resumo = document.getElementById('resumo-valores');
    const sub = subtotal();
    const taxa = taxaAtual();

    const linhas = [['Subtotal', precoBR(sub)]];

    if (!ehEntrega()) {
      linhas.push(['Retirada no local', 'Sem taxa']);
    } else if (temFreteGratis()) {
      linhas.push(['Entrega (reserva)', 'Grátis 🎁']);
    } else {
      linhas.push(['Taxa de entrega', taxa === 0 ? 'Grátis' : precoBR(taxa)]);
    }

    if (taxaAgendamento()) {
      linhas.push(['Agendamento de horário', precoBR(taxaAgendamento())]);
    }

    resumo.innerHTML = '';
    for (const [rotulo, valor] of linhas) {
      resumo.appendChild(criarLinhaResumo(rotulo, valor, false));
    }
    resumo.appendChild(criarLinhaResumo('Total', precoBR(totalGeral()), true));
  }

  function criarLinhaResumo(rotulo, valor, ehTotal) {
    const fragmento = document.createDocumentFragment();
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = rotulo;
    dd.textContent = valor;
    if (ehTotal) {
      dt.className = 'resumo__total';
      dd.className = 'resumo__total';
    }
    fragmento.appendChild(dt);
    fragmento.appendChild(dd);
    return fragmento;
  }

  // -------------------------------------------------------------------- modal

  function abrirModal() {
    montarModal();
    document.getElementById('modal-pedido').hidden = false;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('pedido-aberto');
    rastrearInicioCheckout();
  }

  function fecharModal() {
    document.getElementById('modal-pedido').hidden = true;
    document.body.style.overflow = '';
    document.body.classList.remove('pedido-aberto');
    document.getElementById('erro-form').hidden = true;
  }

  // ----------------------------------------------------------------- WhatsApp

  function montarMensagem(dados) {
    const linhas = [`*Novo pedido — ${LOJA.nome}*`, ''];

    for (const [nome, qtd] of Object.entries(carrinho)) {
      const item = acharItem(nome);
      if (!item) continue;
      linhas.push(`${qtd}x ${item.nome} — ${precoBR(item.preco * qtd)}`);
    }

    const sub = subtotal();
    const taxa = taxaAtual();
    const entrega = dados.entrega === 'entrega';

    linhas.push('', `Subtotal: ${precoBR(sub)}`);
    if (entrega) {
      linhas.push(
        temFreteGratis()
          ? 'Entrega: *GRÁTIS* (reserva confirmada de segunda a sexta)'
          : `Taxa de entrega: ${taxa === 0 ? 'Grátis' : precoBR(taxa)}`
      );
    }
    linhas.push(`*Total: ${precoBR(sub + taxa)}*`, '');

    linhas.push(`*Cliente:* ${dados.nome}`);
    linhas.push(`*WhatsApp:* ${dados.telefone}`);
    linhas.push(`*${entrega ? 'Entregar' : 'Retirar'} em:* ${dados.data}`);
    linhas.push(`*Janela:* ${LOJA.entrega.horario.abre} às ${LOJA.entrega.horario.fecha}`);

    if (entrega) {
      linhas.push(`*Endereço:* ${dados.endereco}`);
    } else {
      linhas.push('*Retirada no local*');
    }

    linhas.push(`*Pagamento:* ${dados.pagamento}`);
    if (dados.pagamento === 'Dinheiro' && dados.troco) {
      linhas.push(`*Troco para:* R$ ${dados.troco}`);
    }
    if (dados.pagamento === 'Pix' && LOJA.chavePix) {
      linhas.push(`_Chave Pix da loja: ${LOJA.chavePix}_`);
    }
    if (dados.observacoes) {
      linhas.push(`*Observações:* ${dados.observacoes}`);
    }

    return linhas.join('\n');
  }

  function enviarPedido(evento) {
    evento.preventDefault();

    const form = evento.target;
    const dados = Object.fromEntries(new FormData(form));
    const erro = document.getElementById('erro-form');

    function falhar(mensagem, campo) {
      erro.textContent = mensagem;
      erro.hidden = false;
      if (campo && form.elements[campo]) form.elements[campo].focus();
    }

    if (quantidadeTotal() === 0) return falhar('Adicione pelo menos um item ao pedido.');

    // Última barreira: item que esgotou depois de entrar no carrinho.
    const acabaram = Object.keys(carrinho).filter((nome) => estaEsgotado(nome));
    if (acabaram.length) {
      limparCarrinhoDeEsgotados();
      return falhar(`Acabou ${acabaram.join(', ')}. Confira seu pedido antes de pagar.`);
    }

    if (!dados.nome || !dados.nome.trim()) {
      return falhar('Precisamos do seu nome para identificar o pedido.', 'nome');
    }

    if (!dados.telefone || dados.telefone.replace(/\D/g, '').length < 10) {
      return falhar('Informe um WhatsApp válido, com DDD.', 'telefone');
    }

    if (!dados.data) {
      return falhar('Escolha a data da entrega ou da retirada.', 'data');
    }

    if (dados.entrega === 'entrega' && (!dados.endereco || dados.endereco.trim().length < 8)) {
      return falhar('Informe o endereço completo para a entrega.', 'endereco');
    }

    if (LOJA.pedidoMinimo > 0 && subtotal() < LOJA.pedidoMinimo) {
      return falhar(`O pedido mínimo é ${precoBR(LOJA.pedidoMinimo)}. Adicione mais um item.`);
    }

    // A lista já impede horário fora da janela, mas a conferência fica
    // como rede: o valor do campo pode ser adulterado pelo navegador.
    if (querAgendar() && !horariosAgendaveis().includes(dados.hora)) {
      const { abre, fecha } = LOJA.entrega.horario;
      return falhar(`Escolha um horário entre ${abre} e ${fecha}.`, 'hora');
    }

    erro.hidden = true;

    if (pagamentoOnlineLigado()) return pagarOnline(dados, falhar);

    const texto = encodeURIComponent(montarMensagem(dados));
    window.open(`https://wa.me/${LOJA.whatsapp}?text=${texto}`, '_blank', 'noopener');
  }

  // ------------------------------------------------------- pagamento online

  /**
   * Monta o pedido no formato da InfinitePay e manda para o Apps Script,
   * que é quem fala com a API — o navegador não consegue por causa do CORS.
   *
   * A taxa de entrega e o agendamento viram itens, porque o checkout só
   * entende lista de itens; assim o cliente paga tudo de uma vez.
   */
  function pagarOnline(dados, falhar) {
    const botao = document.getElementById('botao-enviar');
    const rotuloOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Gerando o pagamento…';

    const itens = Object.entries(carrinho).map(([nome, qtd]) => {
      const item = acharItem(nome);
      return { quantity: qtd, price: item.preco, description: item.nome };
    });

    if (taxaAtual() > 0) {
      itens.push({ quantity: 1, price: taxaAtual(), description: 'Taxa de entrega' });
    }
    if (taxaAgendamento() > 0) {
      itens.push({ quantity: 1, price: taxaAgendamento(), description: `Agendamento de horário (${dados.hora})` });
    }

    const entrega = dados.entrega === 'entrega';

    // Guardado antes de sair da página: o cliente volta do checkout numa
    // navegação nova, e é daqui que a tela de confirmação lê o pedido.
    const resumoPedido = {
      itens: itens.map((i) => ({ nome: i.description, qtd: i.quantity, preco: i.price })),
      total: totalGeral(),
      nome: dados.nome,
      telefone: dados.telefone,
      entrega,
      endereco: entrega ? dados.endereco : '',
      data: dados.data,
      hora: querAgendar() ? dados.hora : '',
      observacoes: dados.observacoes || '',
      freteGratis: entrega && temFreteGratis(),
    };

    try {
      localStorage.setItem('brunao:ultimo-pedido', JSON.stringify(resumoPedido));
    } catch { /* modo privado — a tela de confirmação mostra menos detalhe */ }

    fetch(LOJA.pagamentoOnline.urlScript, {
      method: 'POST',
      // text/plain de propósito: o Apps Script não responde a preflight,
      // e application/json faria o navegador disparar um.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        acao: 'criar-link',
        itens,
        cliente: { nome: dados.nome, telefone: dados.telefone },
        enderecoTexto: entrega ? dados.endereco : 'Retirada no local',
        // Vão para a planilha e daí para o ticket de expedição: quem
        // separa o pedido precisa saber a data e o horário, não a data
        // em que a compra foi feita.
        entregaTexto: dados.data,
        horaAgendada: querAgendar() ? dados.hora : '',
        retirada: !entrega,
        observacoes: dados.observacoes || '',
      }),
    })
      .then((r) => r.json())
      .then((resposta) => {
        if (!resposta.ok || !resposta.url) {
          throw new Error(resposta.erro || 'Não foi possível gerar o pagamento.');
        }
        try {
          const salvo = JSON.parse(localStorage.getItem('brunao:ultimo-pedido'));
          salvo.order_nsu = resposta.order_nsu;
          localStorage.setItem('brunao:ultimo-pedido', JSON.stringify(salvo));
        } catch { /* segue sem o número do pedido */ }

        window.location.href = resposta.url;
      })
      .catch((erro) => {
        botao.disabled = false;
        botao.textContent = rotuloOriginal;
        falhar(
          `${erro.message} Se continuar, chame no WhatsApp ${LOJA.whatsappVisivel} que a gente resolve.`
        );
      });
  }

  // ------------------------------------------------------------------- início

  function montarRodape() {
    const { abre, fecha } = LOJA.entrega.horario;
    document.getElementById('rodape-horarios').textContent =
      `Delivery sábados, domingos e feriados · ${abre} às ${fecha}`;

    const zap = document.getElementById('rodape-whatsapp');
    zap.textContent = LOJA.whatsappVisivel;
    zap.href = `https://wa.me/${LOJA.whatsapp}`;

    const insta = document.getElementById('rodape-instagram');
    insta.textContent = `@${LOJA.instagram}`;
    insta.href = `https://instagram.com/${LOJA.instagram}`;

    const endereco = document.getElementById('rodape-endereco');
    endereco.textContent = LOJA.endereco;
    endereco.hidden = !LOJA.endereco;

    /* A mensagem fala em dúvida de propósito. Se convidasse a fazer o
       pedido, o botão puxaria o cliente para fora do checkout — e aí a
       venda voltaria a ser digitada à mão no painel. */
    const flutuante = document.getElementById('zap-flutuante');
    flutuante.href = `https://wa.me/${LOJA.whatsapp}?text=` +
      encodeURIComponent('Olá! Estou no cardápio e queria tirar uma dúvida.');
  }

  function montarFormulario() {
    const pagamento = document.getElementById('select-pagamento');
    for (const forma of LOJA.formasPagamento) {
      const opcao = document.createElement('option');
      opcao.value = forma;
      opcao.textContent = forma;
      pagamento.appendChild(opcao);
    }

    const datas = document.getElementById('select-data');
    for (const data of proximasDatasDeEntrega()) {
      const opcao = document.createElement('option');
      opcao.value = rotuloData(data);
      opcao.textContent = rotuloData(data);
      datas.appendChild(opcao);
    }

    // Troco só aparece quando o pagamento é em dinheiro.
    pagamento.addEventListener('change', () => {
      document.getElementById('campo-troco').hidden = pagamento.value !== 'Dinheiro';
    });

    // Com pagamento online o cliente paga no checkout, então não faz
    // sentido perguntar aqui a forma de pagamento nem o troco.
    if (pagamentoOnlineLigado()) {
      document.getElementById('campo-pagamento').hidden = true;
      document.getElementById('botao-enviar').textContent = 'Pagar e confirmar pedido';
      document.getElementById('modal-aviso').textContent =
        'Você vai para o pagamento seguro da InfinitePay. Pix ou cartão.';
    }

    // Agendamento de horário
    const agendar = document.getElementById('check-agendar');
    if (LOJA.agendamentoHorario && LOJA.agendamentoHorario.ativo) {
      const { abre, fecha } = LOJA.entrega.horario;
      document.getElementById('agendar-descricao').textContent =
        `Sem agendar, você recebe entre ${abre} e ${fecha}, na ordem das reservas. ` +
        `Para escolher a hora, custa ${precoBR(LOJA.agendamentoHorario.taxa)}.`;
      document.getElementById('campo-agendar').hidden = !ehEntrega();

      const horas = document.getElementById('select-hora');
      horas.innerHTML = '';
      for (const hora of horariosAgendaveis()) {
        const opcao = document.createElement('option');
        opcao.value = hora;
        opcao.textContent = `${hora} — entrega entre ${hora} e ${somarMinutos(hora, LOJA.agendamentoHorario.intervaloMinutos || 30)}`;
        horas.appendChild(opcao);
      }

      agendar.addEventListener('change', () => {
        document.getElementById('campo-hora').hidden = !agendar.checked;
        montarResumo();
      });
    }

    // Endereço só faz sentido na entrega; a taxa muda junto.
    for (const radio of document.querySelectorAll('input[name="entrega"]')) {
      radio.addEventListener('change', () => {
        const entrega = ehEntrega();
        document.getElementById('campo-endereco').hidden = !entrega;
        document.getElementById('label-data').textContent = entrega
          ? 'Data da entrega'
          : 'Data da retirada';

        /* Ao trocar para retirada o bloco some, mas a escolha continua
           marcada: quem tinha agendado e volta para entrega encontra o
           horário como deixou. Desmarcar em silêncio fazia o cliente
           perder o agendamento sem perceber — a taxa sumia do resumo e
           nada avisava. Retirada não paga agendamento de qualquer
           forma, porque `querAgendar` exige entrega. */
        if (LOJA.agendamentoHorario && LOJA.agendamentoHorario.ativo) {
          document.getElementById('campo-agendar').hidden = !entrega;
          document.getElementById('campo-hora').hidden = !entrega || !agendar.checked;
        }
        montarResumo();
      });
    }
  }

  function iniciar() {
    montarTopo();
    montarAvisos();
    montarCardapio();
    montarRodape();
    montarFormulario();
    atualizarBarra();

    /* O carrinho sobrevive ao fechamento do navegador. Se um item
       esgotou nesse meio-tempo, ele precisa sair já na abertura — não só
       quando a lista nova chega pela rede. */
    limparCarrinhoDeEsgotados();

    document.getElementById('barra-carrinho').addEventListener('click', abrirModal);
    document.getElementById('form-pedido').addEventListener('submit', enviarPedido);

    for (const alvo of document.querySelectorAll('[data-fechar-modal]')) {
      alvo.addEventListener('click', fecharModal);
    }

    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') fecharModal();
    });

    buscarEsgotados();
    buscarStatusLoja();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
