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

  /** As próximas datas em que a loja entrega, a partir de hoje. */
  function proximasDatasDeEntrega(quantas = 6, hoje = new Date()) {
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

    if (modo === 'reserva' && temFreteGratis()) {
      aviso.innerHTML =
        '<span class="aviso__icone">🎁</span>' +
        '<span><strong>Reserva confirmada hoje ganha entrega grátis.</strong> ' +
        `Escolha a data e receba entre ${abre} e ${fecha}.</span>`;
    } else if (modo === 'reserva') {
      aviso.innerHTML =
        '<span class="aviso__icone">📅</span>' +
        '<span><strong>Reservas abertas.</strong> ' +
        `A entrega acontece aos sábados, domingos e feriados, das ${abre} às ${fecha}.</span>`;
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
    alvo.appendChild(aviso);

    const regra = document.createElement('div');
    regra.className = 'aviso aviso--regra';
    regra.innerHTML =
      '<span class="aviso__icone">🛵</span>' +
      `<span>Delivery <strong>sábados, domingos e feriados</strong>, das ${abre} às ${fecha}. ` +
      'Reservas de <strong>segunda a sexta</strong> ganham a entrega.</span>';
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

      const lista = document.createElement('div');
      lista.className = 'itens';
      for (const item of categoria.itens) {
        lista.appendChild(montarItem(item));
      }
      secao.appendChild(lista);
      alvo.appendChild(secao);
    }
  }

  function montarItem(item) {
    const esgotado = item.disponivel === false;

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
    salvarCarrinho();
    atualizarBarra();
    if (!document.getElementById('modal-pedido').hidden) montarModal();
  }

  function atualizarBarra() {
    const barra = document.getElementById('barra-carrinho');
    const qtd = quantidadeTotal();
    barra.hidden = qtd === 0;
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

    resumo.innerHTML = '';
    for (const [rotulo, valor] of linhas) {
      resumo.appendChild(criarLinhaResumo(rotulo, valor, false));
    }
    resumo.appendChild(criarLinhaResumo('Total', precoBR(sub + taxa), true));
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
  }

  function fecharModal() {
    document.getElementById('modal-pedido').hidden = true;
    document.body.style.overflow = '';
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

    if (!dados.nome || !dados.nome.trim()) {
      return falhar('Precisamos do seu nome para identificar o pedido.', 'nome');
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

    erro.hidden = true;

    const texto = encodeURIComponent(montarMensagem(dados));
    window.open(`https://wa.me/${LOJA.whatsapp}?text=${texto}`, '_blank', 'noopener');
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

    // Endereço só faz sentido na entrega; a taxa muda junto.
    for (const radio of document.querySelectorAll('input[name="entrega"]')) {
      radio.addEventListener('change', () => {
        document.getElementById('campo-endereco').hidden = !ehEntrega();
        document.getElementById('label-data').textContent = ehEntrega()
          ? 'Data da entrega'
          : 'Data da retirada';
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

    document.getElementById('barra-carrinho').addEventListener('click', abrirModal);
    document.getElementById('form-pedido').addEventListener('submit', enviarPedido);

    for (const alvo of document.querySelectorAll('[data-fechar-modal]')) {
      alvo.addEventListener('click', fecharModal);
    }

    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') fecharModal();
    });
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
