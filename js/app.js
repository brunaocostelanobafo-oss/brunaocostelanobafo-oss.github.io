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

  const PIXEL_ID = '4433696376853064';

  /** SHA-256 em hexadecimal — formato que o Meta exige pra correspondência
      avançada (nunca manda telefone em texto puro). */
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
   * Reforça a correspondência avançada assim que o telefone é conhecido,
   * no envio do checkout — ajuda o Meta a ligar essa sessão ao clique do
   * anúncio que a originou, mesmo que o Purchase só confirme depois, na
   * volta da InfinitePay.
   */
  async function reforcarCorrespondencia(telefone) {
    const digitos = telefoneNormalizado(telefone);
    if (!digitos || typeof fbq !== 'function') return;
    try {
      const hash = await sha256Hex(digitos);
      fbq('init', PIXEL_ID, { ph: hash });
    } catch { /* sem Web Crypto (http, navegador antigo): segue sem reforço */ }
  }

  // ---------------------------------------------------------------- utilidades

  /** 8990 -> "R$ 89,90" */
  function precoBR(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** Itens vendáveis: cada variante (com osso / desossada) conta como um. */
  function todosOsItens() {
    return itensVendaveis();
  }

  function acharProduto(id) {
    for (const categoria of CARDAPIO) {
      const produto = categoria.itens.find((p) => p.id === id);
      if (produto) return produto;
    }
    return null;
  }

  /** Variantes do produto, ou ele mesmo quando não tem escolha. */
  function opcoesDe(produto) {
    return produto.variantes ? produto.variantes : [produto];
  }

  /** O menor preço — é o que aparece como "A partir de". */
  function precoInicial(produto) {
    return Math.min(...opcoesDe(produto).map((o) => o.preco));
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

  /**
   * Janela extra de horário: controle manual do painel para estender o
   * atendimento num dia específico (um teste, uma exceção), sem mexer
   * no horário padrão do site. Vale só para a data exata que ela cobre.
   */
  let horarioExtra = null;

  function janelaDoDia(data) {
    if (horarioExtra && horarioExtra.data === iso(data)) {
      return { abre: horarioExtra.abre, fecha: horarioExtra.fecha };
    }
    return { abre: LOJA.entrega.horario.abre, fecha: LOJA.entrega.horario.fecha };
  }

  /** Sábado, domingo, feriado — ou um dia com janela extra aplicada. */
  function ehDiaDeEntrega(data) {
    if (horarioExtra && horarioExtra.data === iso(data)) return true;
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
  /**
   * As próprias datas oferecidas pertencem sempre ao mesmo ciclo — o
   * fim de semana vigente, nunca um fim de semana futuro. Por isso a
   * busca para assim que encontra um dia sem entrega depois de já ter
   * incluído algum: não completa a cota pulando pro próximo ciclo.
   */
  function proximasDatasDeEntrega(quantas, hoje = new Date()) {
    quantas = quantas || LOJA.entrega.datasOferecidas || 6;
    const datas = [];
    let ultimaIncluida = null;

    for (let i = 0; datas.length < quantas && i <= 90; i++) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);

      if (!ehDiaDeEntrega(data)) {
        if (ultimaIncluida) break;
        continue;
      }
      // Hoje só entra na lista se ainda dá tempo de entregar.
      if (i === 0 && minutosAgora(hoje) >= emMinutos(janelaDoDia(data).fecha)) continue;

      if (ultimaIncluida && Math.round((data - ultimaIncluida) / 86400000) > 1) break;

      datas.push(data);
      ultimaIncluida = data;
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
    const { abre, fecha } = janelaDoDia(agora);

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

  function textoStatus() {
    const { modo, fecha } = estadoDaLoja();
    if (modo === 'entregando') return { modo, texto: `Entregando agora · até ${fecha}` };
    return { modo, texto: 'Reservas abertas · entregas sáb, dom e feriados' };
  }

  function montarTopo() {
    document.getElementById('loja-nome').textContent = LOJA.nome;
    document.getElementById('loja-local').textContent = `${LOJA.cidade} · Feito na lenha desde ${LOJA.desde}`;
    document.getElementById('loja-desde').textContent = `Desde ${LOJA.desde}`;

    const { abre, fecha } = LOJA.entrega.horario;
    document.getElementById('chip-horario').textContent = `${abre.replace(':00', 'h')} às ${fecha.replace(':00', 'h')}`;
    document.getElementById('chip-taxa').textContent = precoBR(LOJA.taxaEntrega);

    montarAvisos();

    const nav = document.getElementById('nav-categorias');
    nav.innerHTML = '';
    CARDAPIO.forEach((categoria, i) => {
      const link = document.createElement('a');
      link.className = 'categorias__link' + (i === 0 ? ' categorias__link--ativa' : '');
      link.href = `#cat-${categoria.id}`;
      link.textContent = categoria.nome;
      nav.appendChild(link);
    });
    acompanharCategoriaVisivel();
  }

  /** Destaca na barra de categorias a seção que está na tela. */
  function acompanharCategoriaVisivel() {
    if (!('IntersectionObserver' in window)) return;
    const links = [...document.querySelectorAll('.categorias__link')];
    const observador = new IntersectionObserver((entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        const id = entrada.target.id;
        for (const link of links) {
          link.classList.toggle('categorias__link--ativa', link.getAttribute('href') === `#${id}`);
        }
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    // As seções são montadas depois; observa quando existirem.
    setTimeout(() => document.querySelectorAll('.categoria').forEach((s) => observador.observe(s)), 0);
  }

  /** Status da loja na capa. Refeito quando chega uma janela extra de horário. */
  function montarAvisos() {
    const { modo, texto } = textoStatus();
    const status = document.getElementById('status-loja');
    status.className = `loja__status loja__status--${modo}`;
    status.textContent = texto;
  }

  function montarBanners() {
    const alvo = document.getElementById('banners');
    const pontos = document.getElementById('banners-pontos');
    alvo.innerHTML = '';
    pontos.innerHTML = '';
    const lista = (typeof BANNERS !== 'undefined' ? BANNERS : []).filter((b) => acharProduto(b.abre));
    if (!lista.length) { document.getElementById('carrossel').hidden = true; pontos.hidden = true; return; }

    lista.forEach((b, i) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'banner';
      botao.style.backgroundImage = `url("${b.imagem}")`;
      botao.innerHTML = '<span class="banner__tag"></span><span class="banner__titulo"></span><span class="banner__texto"></span>';
      botao.querySelector('.banner__tag').textContent = b.tag;
      botao.querySelector('.banner__titulo').textContent = b.titulo;
      botao.querySelector('.banner__texto').textContent = b.texto;
      botao.addEventListener('click', () => abrirProduto(acharProduto(b.abre)));
      alvo.appendChild(botao);

      const ponto = document.createElement('button');
      ponto.type = 'button';
      ponto.setAttribute('aria-label', `Ver banner ${i + 1}: ${b.titulo}`);
      ponto.addEventListener('click', () => irParaBanner(i));
      pontos.appendChild(ponto);
    });

    const banners = [...alvo.children];
    const anterior = document.getElementById('banner-anterior');
    const proximo = document.getElementById('banner-proximo');
    const maximo = () => alvo.scrollWidth - alvo.clientWidth;
    const inicioDe = (i) => Math.min(banners[i].offsetLeft - banners[0].offsetLeft, maximo());

    /* Qual banner está em destaque. No fim da rolagem é sempre o último:
       em tela larga os últimos nem chegam a encostar na esquerda, e o
       cálculo pela posição deixava o ponto parado no meio. */
    function atual() {
      if (alvo.scrollLeft >= maximo() - 4) return banners.length - 1;
      let melhor = 0;
      banners.forEach((_, i) => {
        if (Math.abs(inicioDe(i) - alvo.scrollLeft) < Math.abs(inicioDe(melhor) - alvo.scrollLeft)) melhor = i;
      });
      return melhor;
    }

    function irParaBanner(i) {
      const destino = Math.max(0, Math.min(i, banners.length - 1));
      alvo.scrollTo({ left: inicioDe(destino), behavior: 'smooth' });
      // Nem todo navegador avisa o fim da rolagem animada; confere depois.
      setTimeout(marcar, 450);
    }

    function marcar() {
      const i = atual();
      [...pontos.children].forEach((p, n) => {
        p.classList.toggle('ativo', n === i);
        p.setAttribute('aria-current', n === i ? 'true' : 'false');
      });
      anterior.disabled = alvo.scrollLeft <= 4;
      proximo.disabled = alvo.scrollLeft >= maximo() - 4;
    }

    // As setas andam até o próximo ponto onde a rolagem realmente muda.
    anterior.addEventListener('click', () => {
      const alvos = banners.map((_, i) => i).filter((i) => inicioDe(i) < alvo.scrollLeft - 4);
      irParaBanner(alvos.length ? alvos[alvos.length - 1] : 0);
    });
    proximo.addEventListener('click', () => {
      const i = banners.findIndex((_, n) => inicioDe(n) > alvo.scrollLeft + 4);
      irParaBanner(i === -1 ? banners.length - 1 : i);
    });
    alvo.addEventListener('scroll', marcar, { passive: true });
    alvo.addEventListener('scrollend', marcar);
    window.addEventListener('resize', marcar);
    marcar();
  }

  function montarVitrine() {
    const alvo = document.getElementById('vitrine');
    alvo.innerHTML = '';
    const produtos = (typeof MAIS_PEDIDOS !== 'undefined' ? MAIS_PEDIDOS : [])
      .map(acharProduto)
      .filter((p) => p && !produtoEsgotado(p));
    document.getElementById('bloco-mais-pedidos').hidden = !produtos.length;

    produtos.forEach((produto, i) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'mini';
      botao.innerHTML =
        '<span class="mini__foto"></span><span class="mini__nome"></span>' +
        '<span class="mini__de">A partir de</span><span class="mini__preco"></span>';
      const foto = botao.querySelector('.mini__foto');
      if (produto.imagem) foto.style.backgroundImage = `url("${produto.imagem}")`;
      else foto.classList.add('sem-foto');
      if (i === 0) foto.innerHTML = '<span class="mini__selo">🔥 O favorito</span>';
      botao.querySelector('.mini__nome').textContent = produto.nome;
      botao.querySelector('.mini__preco').textContent = precoBR(precoInicial(produto));
      if (!produto.variantes) botao.querySelector('.mini__de').hidden = true;
      botao.addEventListener('click', () => abrirProduto(produto));
      alvo.appendChild(botao);
    });
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

      const lista = document.createElement('div');
      lista.className = 'itens';
      for (const produto of categoria.itens) lista.appendChild(montarItem(produto));
      secao.appendChild(lista);
      alvo.appendChild(secao);
    }
    montarVitrine();
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

  function buscarHorarioExtra() {
    if (!pagamentoOnlineLigado()) return;

    fetch(`${LOJA.pagamentoOnline.urlScript}?acao=horario`)
      .then((r) => r.text())
      .then((texto) => {
        if (!texto.trim().startsWith('{')) return;
        const r = JSON.parse(texto);
        if (!r.ok || !r.horario) return;

        horarioExtra = r.horario;
        // Já apareceu com a lista de datas e o aviso montados sem essa
        // janela — refaz os dois pra ela valer sem precisar recarregar.
        montarAvisos();
        atualizarDatasNoFormulario();
      })
      .catch(() => { /* sem conexão: segue com o horário padrão */ });
  }

  function atualizarDatasNoFormulario() {
    const select = document.getElementById('select-data');
    if (!select) return;
    const valorAtual = select.value;
    select.innerHTML = '';
    for (const data of proximasDatasDeEntrega()) {
      const opcao = document.createElement('option');
      opcao.value = rotuloData(data);
      opcao.textContent = rotuloData(data);
      select.appendChild(opcao);
    }
    // Mantém a escolha do cliente se ela ainda existir na lista nova.
    if ([...select.options].some((o) => o.value === valorAtual)) select.value = valorAtual;
  }

  function aplicarLojaFechada() {
    document.body.classList.add('loja-fechada');

    const aviso = document.createElement('div');
    aviso.className = 'aviso aviso--loja-fechada';
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

  /** Esgotado só quando todas as opções do produto acabaram. */
  function produtoEsgotado(produto) {
    if (produto.disponivel === false) return true;
    return opcoesDe(produto).every((o) => o.disponivel === false || estaEsgotado(o.nome));
  }

  function montarItem(produto) {
    const esgotado = produtoEsgotado(produto);

    const cartao = document.createElement('button');
    cartao.type = 'button';
    cartao.className = 'item' + (esgotado ? ' item--esgotado' : '');
    cartao.disabled = esgotado;

    const texto = document.createElement('div');
    texto.className = 'item__texto';

    if (produto.selo && !esgotado) {
      const selo = document.createElement('span');
      selo.className = 'item__selo';
      selo.textContent = produto.selo;
      texto.appendChild(selo);
    }

    const nome = document.createElement('h3');
    nome.className = 'item__nome';
    nome.textContent = produto.nome;
    texto.appendChild(nome);

    if (produto.descricao) {
      const desc = document.createElement('p');
      desc.className = 'item__descricao';
      desc.textContent = produto.descricao;
      texto.appendChild(desc);
    }

    if (produto.tags && produto.tags.length) {
      const tags = document.createElement('div');
      tags.className = 'item__tags';
      for (const t of produto.tags) {
        const span = document.createElement('span');
        span.textContent = t;
        tags.appendChild(span);
      }
      texto.appendChild(tags);
    }

    const preco = document.createElement('div');
    if (esgotado) {
      preco.className = 'item__esgotado-txt';
      preco.textContent = 'Esgotado hoje';
    } else {
      preco.className = 'item__preco';
      if (produto.variantes) {
        const de = document.createElement('span');
        de.className = 'item__de';
        de.textContent = 'A partir de';
        preco.appendChild(de);
      }
      preco.appendChild(document.createTextNode(precoBR(precoInicial(produto))));
    }
    texto.appendChild(preco);
    cartao.appendChild(texto);

    const foto = document.createElement('span');
    foto.className = 'item__foto';
    if (produto.imagem) {
      const img = document.createElement('img');
      img.src = produto.imagem;
      img.alt = '';
      img.loading = 'lazy';
      foto.appendChild(img);
    } else {
      foto.classList.add('sem-foto');
      foto.textContent = '🍽️';
    }
    cartao.appendChild(foto);

    cartao.setAttribute('aria-label', `${produto.nome}, ${esgotado ? 'esgotado' : 'a partir de ' + precoBR(precoInicial(produto))}`);
    if (!esgotado) cartao.addEventListener('click', () => abrirProduto(produto));
    return cartao;
  }

  // ------------------------------------------------- folha do produto e da loja

  function abrirFolha(conteudo) {
    const veu = document.getElementById('folha');
    const caixa = document.getElementById('folha-caixa');
    caixa.innerHTML = '';
    caixa.appendChild(conteudo);
    veu.hidden = false;
    caixa.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    const fechar = caixa.querySelector('.folha__fechar');
    if (fechar) fechar.focus();
  }

  function fecharFolha() {
    const veu = document.getElementById('folha');
    if (veu.hidden) return;
    veu.hidden = true;
    document.getElementById('folha-caixa').innerHTML = '';
    if (document.getElementById('modal-pedido').hidden) document.body.style.overflow = '';
  }

  /** Escolha da opção (com osso / desossada), quantidade e "Adicionar". */
  function abrirProduto(produto) {
    if (!produto || produtoEsgotado(produto)) return;

    const opcoes = opcoesDe(produto);
    let escolhida = opcoes.find((o) => !estaEsgotado(o.nome) && o.disponivel !== false);
    let qtd = 1;

    const raiz = document.createElement('div');
    raiz.innerHTML =
      `<div class="folha__foto${produto.imagem ? '' : ' sem-foto'}">` +
      '<button type="button" class="folha__fechar" aria-label="Fechar">×</button></div>' +
      '<div class="folha__corpo">' +
      '<h2 class="folha__nome"></h2><p class="folha__desc"></p><div class="item__tags"></div>' +
      '<div class="opcoes" hidden><div class="opcoes__cab"><span>Escolha o tipo da costela</span><em>Obrigatório</em></div></div>' +
      '<div class="folha__acao"><div class="contador contador--grande">' +
      '<button type="button" class="contador__botao" data-passo="-1" aria-label="Diminuir">−</button>' +
      '<span class="contador__valor">1</span>' +
      '<button type="button" class="contador__botao" data-passo="1" aria-label="Aumentar">+</button></div>' +
      '<button type="button" class="folha__adicionar"><span>Adicionar</span><span class="folha__total"></span></button></div>' +
      '</div>';

    const foto = raiz.querySelector('.folha__foto');
    if (produto.imagem) foto.style.backgroundImage = `url("${produto.imagem}")`;
    else foto.insertAdjacentText('afterbegin', '🍽️');
    raiz.querySelector('.folha__nome').textContent = produto.nome;
    raiz.querySelector('.folha__desc').textContent = produto.descricao || '';
    const tags = raiz.querySelector('.item__tags');
    for (const t of produto.tags || []) {
      const span = document.createElement('span');
      span.textContent = t;
      tags.appendChild(span);
    }

    if (produto.variantes) {
      const bloco = raiz.querySelector('.opcoes');
      bloco.hidden = false;
      bloco.setAttribute('role', 'radiogroup');
      produto.variantes.forEach((v, i) => {
        const acabou = v.disponivel === false || estaEsgotado(v.nome);
        const linha = document.createElement('label');
        linha.className = 'opcao-tipo' + (acabou ? ' opcao-tipo--esgotada' : '');
        linha.innerHTML = '<span class="opcao-tipo__nome"></span><span class="opcao-tipo__preco"></span>' +
          `<input type="radio" name="variante" id="variante-${produto.id}-${i}">`;
        linha.querySelector('.opcao-tipo__nome').textContent = v.rotulo + (acabou ? ' · esgotado' : '');
        linha.querySelector('.opcao-tipo__preco').textContent = precoBR(v.preco);
        const radio = linha.querySelector('input');
        radio.disabled = acabou;
        radio.checked = v === escolhida;
        radio.addEventListener('change', () => { escolhida = v; atualizar(); });
        bloco.appendChild(linha);
      });
    }

    const valor = raiz.querySelector('.contador__valor');
    const total = raiz.querySelector('.folha__total');
    // A foto acompanha a escolha: a desossada tem foto própria.
    function atualizar() {
      valor.textContent = String(qtd);
      total.textContent = precoBR(escolhida.preco * qtd);
      const imagem = escolhida.imagem || produto.imagem;
      if (imagem) foto.style.backgroundImage = `url("${imagem}")`;
    }
    for (const b of raiz.querySelectorAll('[data-passo]')) {
      b.addEventListener('click', () => { qtd = Math.max(1, qtd + Number(b.dataset.passo)); atualizar(); });
    }
    raiz.querySelector('.folha__fechar').addEventListener('click', fecharFolha);
    raiz.querySelector('.folha__adicionar').addEventListener('click', () => {
      alterarQuantidade(escolhida.nome, qtd);
      fecharFolha();
    });

    atualizar();
    abrirFolha(raiz);
  }

  function abrirInfoLoja() {
    const { abre, fecha } = LOJA.entrega.horario;
    const janela = `${abre} às ${fecha}`;
    const raiz = document.createElement('div');
    raiz.className = 'folha__corpo folha__corpo--info';
    raiz.innerHTML =
      '<button type="button" class="folha__fechar folha__fechar--fixo" aria-label="Fechar">×</button>' +
      '<h2 class="folha__nome">Informações da loja</h2>' +
      '<div class="info"><span class="info__icone">🕚</span><div><b>Entregas</b>' +
      `<table class="horarios"><tbody><tr><td>Sábado</td><td>${janela}</td></tr>` +
      `<tr><td>Domingo</td><td>${janela}</td></tr><tr><td>Feriados</td><td>${janela}</td></tr>` +
      '<tr><td>Segunda a sexta</td><td>Só reservas</td></tr></tbody></table></div></div>' +
      '<div class="info"><span class="info__icone">📅</span><div><b>Reservas</b><p>Abertas a semana toda. Você escolhe a data de entrega no pedido. A rota é única e segue a ordem das reservas.</p></div></div>' +
      `<div class="info"><span class="info__icone">🛵</span><div><b>Entrega</b><p>Taxa de ${precoBR(LOJA.taxaEntrega)} em ${LOJA.cidade.split(' ·')[0]}. Também dá para retirar no local, sem taxa.</p></div></div>` +
      '<div class="info"><span class="info__icone">💳</span><div><b>Pagamento</b><p>Pix ou cartão de crédito, pelo pagamento seguro da InfinitePay.</p></div></div>' +
      `<div class="info"><span class="info__icone">💬</span><div><b>WhatsApp</b><p><a href="https://wa.me/${LOJA.whatsapp}" target="_blank" rel="noopener">${LOJA.whatsappVisivel}</a></p></div></div>` +
      `<div class="info"><span class="info__icone">📷</span><div><b>Instagram</b><p><a href="https://instagram.com/${LOJA.instagram}" target="_blank" rel="noopener">@${LOJA.instagram}</a></p></div></div>` +
      (LOJA.endereco ? '<div class="info"><span class="info__icone">📍</span><div><b>Endereço</b><p class="info__endereco"></p></div></div>' : '');
    if (LOJA.endereco) raiz.querySelector('.info__endereco').textContent = LOJA.endereco;
    raiz.querySelector('.folha__fechar').addEventListener('click', fecharFolha);
    abrirFolha(raiz);
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

  /** Rua, número e bairro em campos separados -> uma linha só para o ticket,
      a mensagem e a planilha. Ponto de referência é opcional. */
  function montarEndereco(dados) {
    const partes = [dados.rua, dados.numero, dados.bairro]
      .map((p) => (p || '').trim())
      .filter(Boolean)
      .join(', ');
    const referencia = (dados.referencia || '').trim();
    return referencia ? `${partes} — ${referencia}` : partes;
  }

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

    // 10 dígitos = fixo (DDD + 8); 11 = celular (DDD + 9 dígitos). Fora
    // dessa faixa é número incompleto ou com dígito a mais, e depois
    // ninguém consegue chamar esse cliente no WhatsApp para confirmar.
    const digitosTelefone = (dados.telefone || '').replace(/\D/g, '').length;
    if (digitosTelefone < 10 || digitosTelefone > 11) {
      return falhar('Informe um WhatsApp válido, com DDD.', 'telefone');
    }

    if (!dados.data) {
      return falhar('Escolha a data da entrega ou da retirada.', 'data');
    }

    if (dados.entrega === 'entrega') {
      if (!dados.rua || !dados.rua.trim()) {
        return falhar('Informe o nome da rua.', 'rua');
      }
      if (!dados.numero || !dados.numero.trim()) {
        return falhar('Informe o número da casa.', 'numero');
      }
      if (!dados.bairro || !dados.bairro.trim()) {
        return falhar('Informe o bairro.', 'bairro');
      }
    }

    // Um único texto para o ticket, a mensagem e a planilha — o resto do
    // código sempre trabalhou com `dados.endereco` como string pronta.
    dados.endereco = dados.entrega === 'entrega' ? montarEndereco(dados) : '';

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

    reforcarCorrespondencia(dados.telefone);

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
    montarBanners();
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

    document.getElementById('abrir-info-loja').addEventListener('click', abrirInfoLoja);
    document.getElementById('folha').addEventListener('click', (evento) => {
      if (evento.target.id === 'folha') fecharFolha();
    });

    document.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape') return;
      if (!document.getElementById('folha').hidden) fecharFolha();
      else fecharModal();
    });

    buscarEsgotados();
    buscarStatusLoja();
    buscarHorarioExtra();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
