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
  const secao = document.getElementById('eventos');
  if (!abaCardapio || !abaEventos || !secao || typeof EVENTOS === 'undefined') return;

  /* ---------- Abas ---------- */

  function mostrar(eventos, rolar) {
    document.body.classList.toggle('modo-eventos', eventos);
    secao.hidden = !eventos;
    abaCardapio.setAttribute('aria-selected', String(!eventos));
    abaEventos.setAttribute('aria-selected', String(eventos));
    const url = location.pathname + location.search + (eventos ? '#eventos' : '');
    history.replaceState(null, '', url);
    if (rolar) document.querySelector('.abas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  abaCardapio.addEventListener('click', () => mostrar(false, true));
  abaEventos.addEventListener('click', () => mostrar(true, true));
  // O site sempre abre no cardápio; só o link do anúncio de eventos abre direto nesta aba
  if (location.hash === '#eventos') mostrar(true, false);
  window.addEventListener('hashchange', () => { if (location.hash === '#eventos') mostrar(true, true); });

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
