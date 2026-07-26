/*
 * Cardápio digital — Brunão Costela no Bafo
 *
 * Monta a página a partir de `js/menu-data.js`, controla o carrinho
 * e gera a mensagem do pedido para o WhatsApp.
 *
 * Não precisa editar este arquivo para mudar itens ou preços.
 */

(function () {
  'use strict';

  const CHAVE_STORAGE = 'brunao:carrinho';
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  /** Carrinho: { [nomeDoItem]: quantidade } */
  let carrinho = carregarCarrinho();

  // ---------------------------------------------------------------- utilidades

  /** 5990 -> "R$ 59,90" */
  function precoBR(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** Todos os itens do cardápio numa lista só, para busca por nome. */
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

  // ---------------------------------------------------------- horário da loja

  /** Minutos desde a meia-noite. "18:30" -> 1110 */
  function emMinutos(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function estadoDaLoja(agora = new Date()) {
    const faixa = LOJA.horarios[agora.getDay()];
    if (!faixa) return { aberta: false, faixa: null };

    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
    const aberta = minutosAgora >= emMinutos(faixa.abre) && minutosAgora < emMinutos(faixa.fecha);
    return { aberta, faixa };
  }

  /** "Sexta: 18:00 às 23:59" para cada dia que abre. */
  function horariosEmTexto() {
    return Object.entries(LOJA.horarios)
      .filter(([, faixa]) => faixa)
      .map(([dia, faixa]) => {
        const nome = DIAS[Number(dia)];
        return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}: ${faixa.abre} às ${faixa.fecha}`;
      })
      .join(' · ');
  }

  // ------------------------------------------------------------- contas

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

  function taxaAtual() {
    return ehEntrega() ? LOJA.taxaEntrega : 0;
  }

  // ------------------------------------------------------------- renderização

  function montarTopo() {
    document.getElementById('loja-nome').textContent = LOJA.nome;
    document.getElementById('loja-tagline').textContent = LOJA.tagline;

    const { aberta, faixa } = estadoDaLoja();
    const status = document.getElementById('status-loja');
    status.hidden = false;
    status.classList.add(aberta ? 'topo__status--aberto' : 'topo__status--fechado');
    status.querySelector('.status__texto').textContent = aberta
      ? `Aberto até ${faixa.fecha}`
      : 'Fechado agora';

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

  function montarCardapio() {
    const alvo = document.getElementById('cardapio');
    alvo.innerHTML = '';

    const { aberta } = estadoDaLoja();
    if (!aberta) {
      const aviso = document.createElement('div');
      aviso.className = 'aviso-fechado';
      aviso.innerHTML =
        '<span>🕒</span><span><strong>Estamos fechados agora.</strong> ' +
        'Você pode montar seu pedido e enviar — respondemos assim que abrirmos.</span>';
      alvo.appendChild(aviso);
    }

    for (const categoria of CARDAPIO) {
      const secao = document.createElement('section');
      secao.className = 'categoria';
      secao.id = `cat-${categoria.id}`;

      const titulo = document.createElement('h2');
      titulo.className = 'categoria__titulo';
      titulo.textContent = `${categoria.emoji || ''} ${categoria.nome}`.trim();
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

    const texto = document.createElement('div');
    texto.className = 'item__texto';

    const nome = document.createElement('h3');
    nome.className = 'item__nome';
    nome.textContent = item.nome;
    if (item.destaque && !esgotado) {
      const selo = document.createElement('span');
      selo.className = 'item__selo';
      selo.textContent = 'Mais pedido';
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
      texto.innerHTML =
        `<div class="linha-pedido__nome"></div><div class="linha-pedido__preco"></div>`;
      texto.querySelector('.linha-pedido__nome').textContent = item.nome;
      texto.querySelector('.linha-pedido__preco').textContent =
        `${precoBR(item.preco)} · subtotal ${precoBR(item.preco * qtd)}`;
      linha.appendChild(texto);

      const contador = document.createElement('div');
      contador.className = 'contador';
      contador.appendChild(botaoContador('−', `Remover uma unidade de ${item.nome}`, () =>
        alterarQuantidade(nome, -1)
      ));

      const valor = document.createElement('span');
      valor.className = 'contador__valor';
      valor.textContent = String(qtd);
      contador.appendChild(valor);

      contador.appendChild(botaoContador('+', `Adicionar uma unidade de ${item.nome}`, () =>
        alterarQuantidade(nome, 1)
      ));

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
    if (ehEntrega()) {
      linhas.push(['Taxa de entrega', taxa === 0 ? 'Grátis' : precoBR(taxa)]);
    } else {
      linhas.push(['Retirada no local', 'Sem taxa']);
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

  // ------------------------------------------------------------------ modal

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

  // --------------------------------------------------------------- WhatsApp

  function montarMensagem(dados) {
    const linhas = [`*Novo pedido — ${LOJA.nome}*`, ''];

    for (const [nome, qtd] of Object.entries(carrinho)) {
      const item = acharItem(nome);
      if (!item) continue;
      linhas.push(`${qtd}x ${item.nome} — ${precoBR(item.preco * qtd)}`);
    }

    const sub = subtotal();
    const taxa = taxaAtual();

    linhas.push('', `Subtotal: ${precoBR(sub)}`);
    if (dados.entrega === 'entrega') {
      linhas.push(`Taxa de entrega: ${taxa === 0 ? 'Grátis' : precoBR(taxa)}`);
    }
    linhas.push(`*Total: ${precoBR(sub + taxa)}*`, '');

    linhas.push(`*Cliente:* ${dados.nome}`);
    if (dados.entrega === 'entrega') {
      linhas.push(`*Entrega em:* ${dados.endereco}`);
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
      if (campo) form.elements[campo].focus();
    }

    if (quantidadeTotal() === 0) return falhar('Adicione pelo menos um item ao pedido.');

    if (!dados.nome || !dados.nome.trim()) {
      return falhar('Precisamos do seu nome para identificar o pedido.', 'nome');
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

  // ------------------------------------------------------------------ início

  function montarRodape() {
    document.getElementById('rodape-horarios').textContent = horariosEmTexto();
    document.getElementById('rodape-endereco').textContent = LOJA.endereco;
  }

  function montarFormulario() {
    const select = document.getElementById('select-pagamento');
    for (const forma of LOJA.formasPagamento) {
      const opcao = document.createElement('option');
      opcao.value = forma;
      opcao.textContent = forma;
      select.appendChild(opcao);
    }

    // Troco só aparece quando o pagamento é em dinheiro.
    select.addEventListener('change', () => {
      document.getElementById('campo-troco').hidden = select.value !== 'Dinheiro';
    });

    // Endereço só faz sentido na entrega; a taxa muda junto.
    for (const radio of document.querySelectorAll('input[name="entrega"]')) {
      radio.addEventListener('change', () => {
        const entrega = ehEntrega();
        document.getElementById('campo-endereco').hidden = !entrega;
        montarResumo();
      });
    }
  }

  function iniciar() {
    montarTopo();
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
