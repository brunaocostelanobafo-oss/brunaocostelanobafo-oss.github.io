/*
 * ABAS + FESTAS & EVENTOS
 * -----------------------
 * Troca entre o cardápio e a aba "Festas & Eventos" (pedido de orçamento).
 * O formulário monta a mensagem e abre o WhatsApp da loja; não passa
 * pelo servidor nem pelo pagamento.
 *
 * As abas aparecem sempre, mas o site abre no cardápio. Só o link
 * .../#eventos (anúncio de eventos) abre direto na aba de eventos.
 *
 * Depende de: menu-data.js (LOJA, EVENTOS).
 */
(function () {
  'use strict';

  const abaCardapio = document.getElementById('aba-cardapio');
  const abaEventos = document.getElementById('aba-eventos');
  const abasEnc = {
    natal: document.getElementById('aba-enc-natal'),
    confraternizacao: document.getElementById('aba-enc-confraternizacao'),
  };
  const secao = document.getElementById('eventos');
  const secaoEnc = document.getElementById('encomendas');
  const secaoPagina = document.getElementById('pagina-enc');
  const quadro = document.getElementById('pagina-enc-frame');
  const barraAbas = document.querySelector('.abas');
  if (!abaCardapio || !abaEventos || !secao || typeof EVENTOS === 'undefined') return;

  /* ---------- Abas ----------
     Modos:
       cardapio                      o cardápio de sempre
       eventos                       Festas & Eventos
       natal | confraternizacao      a PÁGINA DE VENDAS da campanha, dentro do cardápio
       reservar-natal | reservar-confraternizacao
                                     o passo do pedido (datas, sinal, pagamento),
                                     que a página abre pelo botão "Garantir minha reserva"
  */

  const HASH = {
    cardapio: '', eventos: '#eventos',
    natal: '#encomendas-natal', confraternizacao: '#encomendas-confraternizacao',
    'reservar-natal': '#reservar-natal', 'reservar-confraternizacao': '#reservar-confraternizacao',
  };
  const PAGINAS = { natal: 'natal/', confraternizacao: 'confraternizacao/' };
  const tipoDe = (qual) => qual.replace('reservar-', '');
  const ehPagina = (qual) => qual === 'natal' || qual === 'confraternizacao';
  const ehReserva = (qual) => qual === 'reservar-natal' || qual === 'reservar-confraternizacao';

  function ajustarAltura() {
    if (barraAbas) document.documentElement.style.setProperty('--h-abas', barraAbas.offsetHeight + 'px');
  }
  window.addEventListener('resize', ajustarAltura);

  function mostrar(qual, rolar) {
    if ((ehPagina(qual) || ehReserva(qual)) && !abasEnc[tipoDe(qual)]) qual = 'cardapio';
    const pagina = ehPagina(qual);
    const reserva = ehReserva(qual);
    const tipo = pagina || reserva ? tipoDe(qual) : null;

    document.body.classList.toggle('modo-eventos', qual === 'eventos');
    document.body.classList.toggle('modo-pagina', pagina);
    document.body.classList.toggle('modo-encomendas', reserva);
    if (tipo) document.body.dataset.enc = tipo; else delete document.body.dataset.enc;

    secao.hidden = qual !== 'eventos';
    if (secaoEnc) secaoEnc.hidden = !reserva;
    if (secaoPagina) secaoPagina.hidden = !pagina;
    abaCardapio.setAttribute('aria-selected', String(qual === 'cardapio'));
    abaEventos.setAttribute('aria-selected', String(qual === 'eventos'));
    for (const t of Object.keys(abasEnc)) {
      if (abasEnc[t]) abasEnc[t].setAttribute('aria-selected', String(t === tipo));
    }

    if (pagina && quadro) {
      ajustarAltura();
      const destino = PAGINAS[tipo];
      // Carrega a página uma vez (e de novo só se trocar de campanha)
      if (quadro.dataset.tipo !== tipo) {
        quadro.dataset.tipo = tipo;
        quadro.src = destino;
      }
      window.scrollTo(0, 0);
    }
    const voltar = document.getElementById('encomendas-voltar');
    if (voltar && tipo) voltar.href = HASH[tipo];

    /* Mantém os parâmetros da URL (origem, pessoas…) só no passo do pedido;
       nas outras abas a URL volta a ficar limpa. */
    const busca = reserva ? location.search : '';
    history.replaceState(null, '', location.pathname + busca + HASH[qual]);
    document.dispatchEvent(new CustomEvent('brunao:aba', { detail: qual }));
    if (rolar && !pagina) barraAbas.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  abaCardapio.addEventListener('click', () => mostrar('cardapio', true));
  abaEventos.addEventListener('click', () => mostrar('eventos', true));
  for (const t of Object.keys(abasEnc)) {
    if (abasEnc[t]) abasEnc[t].addEventListener('click', () => mostrar(t, true));
  }

  /* O site sempre abre no cardápio; só o link do anúncio abre direto na aba.
     O link antigo #encomendas (botão das páginas de vendas) leva ao passo do
     pedido, escolhendo a campanha pelo parâmetro ?origem=. */
  function inicial() {
    const h = location.hash;
    if (h === '#eventos') return 'eventos';
    if (h === '#encomendas-natal') return 'natal';
    if (h === '#encomendas-confraternizacao') return 'confraternizacao';
    if (h === '#reservar-natal') return 'reservar-natal';
    if (h === '#reservar-confraternizacao') return 'reservar-confraternizacao';
    if (h === '#encomendas') {
      return new URLSearchParams(location.search).get('origem') === 'confraternizacao' ? 'reservar-confraternizacao' : 'reservar-natal';
    }
    return null;
  }
  /* app.js (carregado antes) já escuta 'brunao:aba' e também lê a classe do
     body quando monta o cardápio, então a aba inicial vale nos dois casos. */
  if (inicial()) mostrar(inicial(), false);
  window.addEventListener('hashchange', () => { if (inicial() && inicial() !== atual()) mostrar(inicial(), true); });

  function atual() {
    if (document.body.classList.contains('modo-pagina')) return document.body.dataset.enc;
    if (document.body.classList.contains('modo-encomendas')) return 'reservar-' + document.body.dataset.enc;
    return document.body.classList.contains('modo-eventos') ? 'eventos' : 'cardapio';
  }

  /* ---------- Formulário ---------- */

  document.getElementById('eventos-titulo').textContent = EVENTOS.titulo;
  document.getElementById('eventos-descricao').textContent = EVENTOS.descricao;
  document.getElementById('eventos-aviso').textContent = EVENTOS.aviso;
  document.getElementById('eventos-outros').placeholder = EVENTOS.outrosExemplo;

  function preencherSelect(id, opcoes, primeira) {
    const select = document.getElementById(id);
    select.innerHTML = '';
    select.appendChild(new Option(primeira, ''));
    opcoes.forEach((o) => select.appendChild(new Option(o, o)));
  }
  preencherSelect('eventos-tipo', EVENTOS.tiposEvento, 'Escolha…');

  function preencherEscolhas(id, nome, itens) {
    const alvo = document.getElementById(id);
    itens.forEach((item) => {
      const rotulo = document.createElement('label');
      rotulo.className = 'escolha';
      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.name = nome;
      caixa.value = item;
      rotulo.appendChild(caixa);
      rotulo.appendChild(document.createTextNode(item));
      alvo.appendChild(rotulo);
    });
  }
  preencherEscolhas('eventos-carnes', 'carnes', EVENTOS.carnes);
  preencherEscolhas('eventos-acompanhamentos', 'acompanhamentos', EVENTOS.acompanhamentos);

  // Não deixa escolher data que já passou
  const hoje = new Date();
  const doisDigitos = (n) => String(n).padStart(2, '0');
  document.getElementById('eventos-data').min =
    `${hoje.getFullYear()}-${doisDigitos(hoje.getMonth() + 1)}-${doisDigitos(hoje.getDate())}`;

  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function dataBR(valor) {
    const [a, m, d] = valor.split('-').map(Number);
    return `${doisDigitos(d)}/${doisDigitos(m)}/${a} (${DIAS[new Date(a, m - 1, d).getDay()]})`;
  }

  const form = document.getElementById('form-eventos');
  const erro = document.getElementById('eventos-erro');
  form.addEventListener('input', () => { erro.hidden = true; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = new FormData(form);
    const campo = (nome) => String(dados.get(nome) || '').trim();
    const carnes = dados.getAll('carnes');
    const acompanhamentos = dados.getAll('acompanhamentos');

    const faltando = [];
    if (!campo('nome')) faltando.push('seu nome');
    if (!campo('tipo')) faltando.push('o tipo de evento');
    if (!campo('data')) faltando.push('a data');
    if (!campo('horario')) faltando.push('o horário');
    if (!(Number(campo('pessoas')) > 0)) faltando.push('o número de pessoas');
    if (!campo('cidade')) faltando.push('a cidade');
    if (!carnes.length && !campo('outros')) faltando.push('pelo menos uma carne ou outro item');
    if (faltando.length) {
      erro.textContent = 'Falta preencher: ' + faltando.join(', ') + '.';
      erro.hidden = false;
      erro.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    erro.hidden = true;

    const local = [campo('local'), campo('cidade')].filter(Boolean).join(' — ');
    const linhas = [
      '*Pedido de orçamento — Festas & Eventos*',
      '',
      `*Nome:* ${campo('nome')}`,
      `*Evento:* ${campo('tipo')}`,
      `*Data:* ${dataBR(campo('data'))}`,
      `*Horário:* ${campo('horario')}`,
      `*Pessoas:* ${campo('pessoas')}`,
      `*Local:* ${local}`,
      '',
      carnes.length && `*Carnes:* ${carnes.join(', ')}`,
      acompanhamentos.length && `*Acompanhamentos:* ${acompanhamentos.join(', ')}`,
      campo('outros') && `*Outros itens:* ${campo('outros')}`,
      '',
      'Aguardo o orçamento!',
    ].filter((l) => typeof l === 'string'); // tira os campos vazios; '' é linha em branco

    // Mede pedidos de orçamento no Meta Ads
    if (typeof window.fbq === 'function') window.fbq('track', 'Lead', { content_name: 'Festas & Eventos' });

    const texto = encodeURIComponent(linhas.join('\n').replace(/\n{3,}/g, '\n\n'));
    window.open(`https://wa.me/${LOJA.whatsapp}?text=${texto}`, '_blank', 'noopener');
  });
})();
