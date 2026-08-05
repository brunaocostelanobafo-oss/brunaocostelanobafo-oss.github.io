/*
 * Painel administrativo — interface
 * Depende de: menu-data.js (CARDAPIO) e admin-store.js (Store).
 */

(function () {
  'use strict';

  /* Paleta dos gráficos. Validada para o fundo escuro do painel:
     banda de luminosidade, piso de croma, separação para daltonismo
     (pior par ΔE 9.4) e contraste ≥ 3:1 — todos aprovados. */
  const COR = {
    receita: '#3987e5', // azul
    cmv: '#d95926', // laranja
    lucro: '#199e70', // verde-água
    eixo: '#383835',
    grade: '#2c2c2a',
    muted: '#898781',
    bom: '#0ca30c',
    atencao: '#fab219',
    critico: '#d03b3b',
  };

  const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  let periodoAtual = '30';

  // ------------------------------------------------------------ formatação

  function reais(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function reaisCurto(centavos) {
    const v = centavos / 100;
    if (Math.abs(v) >= 1000) return 'R$ ' + (v / 1000).toFixed(1).replace('.', ',') + 'k';
    return 'R$ ' + v.toFixed(0);
  }

  function pct(n) {
    return n.toFixed(1).replace('.', ',') + '%';
  }

  /** "12,50" ou "12.50" ou "1.234,56" -> 1250 centavos */
  function paraCentavos(texto) {
    if (!texto) return 0;
    const limpo = String(texto).trim().replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = parseFloat(limpo);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function paraNumero(texto) {
    if (!texto) return 0;
    const n = parseFloat(String(texto).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function dataBR(iso) {
    if (!iso) return '—';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a.slice(2)}`;
  }

  function diaSemana(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return DIAS_CURTOS[new Date(a, m - 1, d).getDay()];
  }

  const DIAS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  /**
   * Conserta data e hora que chegaram como carimbo ISO.
   *
   * O Google Sheets convertia "Domingo, 02/08" e "11:30" em data e hora
   * de verdade ao gravar, e o valor voltava como 2026-08-02T03:00:00Z e
   * 1899-12-30T14:36:28Z — aquele 1899 é a data-zero que planilhas usam
   * para guardar hora pura. A origem já foi corrigida; isto recupera os
   * pedidos que entraram antes.
   */
  const FUSO = 'America/Sao_Paulo';
  const ehCarimbo = (v) => /^\d{4}-\d{2}-\d{2}T/.test(String(v || ''));

  /** "2026-08-02" -> "Domingo, 02/08" */
  function rotuloEntrega(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
    const [a, m, d] = iso.split('-').map(Number);
    const data = new Date(a, m - 1, d);
    return `${DIAS_PT[data.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  }

  function textoEntrega(valor) {
    const bruto = String(valor || '');
    if (!ehCarimbo(bruto)) return bruto;

    const d = new Date(bruto);
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO, weekday: 'long', day: '2-digit', month: '2-digit',
    }).formatToParts(d);
    const pegar = (t) => (partes.find((p) => p.type === t) || {}).value || '';
    const dia = pegar('weekday');
    return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${pegar('day')}/${pegar('month')}`;
  }

  /**
   * "Domingo, 02/08" -> "2026-08-02", para o filtro da expedição do dia.
   * A mensagem não traz o ano, então vale o do pedido — e se a entrega
   * cair no ano seguinte (pedido em dezembro, entrega em janeiro), o ano
   * avança.
   */
  function entregaParaISO(entrega, dataPedido) {
    if (ehCarimbo(entrega)) return String(entrega).slice(0, 10);

    const m = String(entrega || '').match(/(\d{2})\/(\d{2})/);
    if (!m || !dataPedido) return '';

    const [dia, mes] = [m[1], m[2]];
    let ano = Number(String(dataPedido).slice(0, 4));
    if (mes < String(dataPedido).slice(5, 7)) ano++;
    return `${ano}-${mes}-${dia}`;
  }

  function textoHora(valor) {
    const bruto = String(valor || '');
    if (!ehCarimbo(bruto)) return bruto;

    /* Subtrair 3h na mão erra por 6 minutos: a data-zero das planilhas
       é 1899, quando São Paulo usava −3h06min28s. O navegador conhece
       esse histórico de fusos e devolve o horário que o cliente marcou. */
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(bruto));
  }

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function svgEl(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  }

  // ------------------------------------------------------------- tooltip

  let tooltip;
  function mostrarTooltip(evento, html) {
    if (!tooltip) {
      tooltip = el('div', 'tooltip');
      document.body.appendChild(tooltip);
    }
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    const r = tooltip.getBoundingClientRect();
    let x = evento.clientX + 14;
    if (x + r.width > window.innerWidth - 8) x = evento.clientX - r.width - 14;
    tooltip.style.left = x + 'px';
    tooltip.style.top = Math.max(8, evento.clientY - r.height - 10) + 'px';
  }

  function esconderTooltip() {
    if (tooltip) tooltip.style.display = 'none';
  }

  // -------------------------------------------------------------- gráficos

  /** Barras verticais — receita por dia. Série única, sem legenda. */
  function graficoReceitaPorDia(container, dados) {
    container.innerHTML = '';
    if (!dados.length || dados.every((d) => d.valor === 0)) {
      container.appendChild(el('p', 'grafico__vazio', 'Sem vendas lançadas neste período.'));
      return;
    }

    const L = container.clientWidth || 600;
    const A = 220;
    const margem = { topo: 14, dir: 8, base: 26, esq: 52 };
    const larguraPlot = L - margem.esq - margem.dir;
    const alturaPlot = A - margem.topo - margem.base;
    const maximo = Math.max(...dados.map((d) => d.valor));

    const svg = svgEl('svg', { viewBox: `0 0 ${L} ${A}`, width: '100%', height: A, role: 'img' });
    svg.setAttribute('aria-label', 'Receita por dia');

    // Grade e rótulos do eixo de valor
    for (let i = 0; i <= 3; i++) {
      const v = (maximo / 3) * i;
      const y = margem.topo + alturaPlot - (v / maximo) * alturaPlot;
      svg.appendChild(svgEl('line', {
        x1: margem.esq, x2: L - margem.dir, y1: y, y2: y,
        stroke: i === 0 ? COR.eixo : COR.grade, 'stroke-width': 1,
      }));
      const t = svgEl('text', { x: margem.esq - 8, y: y + 4, 'text-anchor': 'end', fill: COR.muted, 'font-size': 10 });
      t.textContent = reaisCurto(v);
      svg.appendChild(t);
    }

    const passo = larguraPlot / dados.length;
    const largura = Math.max(2, passo - 2); // 2px de respiro entre as barras

    dados.forEach((d, i) => {
      const x = margem.esq + i * passo + (passo - largura) / 2;
      const alturaBarra = d.valor === 0 ? 0 : Math.max(3, (d.valor / maximo) * alturaPlot);
      const y = margem.topo + alturaPlot - alturaBarra;

      if (alturaBarra > 0) {
        svg.appendChild(svgEl('rect', {
          x, y, width: largura, height: alturaBarra,
          rx: Math.min(4, largura / 2), fill: COR.receita,
        }));
      }

      // Área de captura maior que a barra, para o hover ficar fácil
      const alvo = svgEl('rect', {
        x: margem.esq + i * passo, y: margem.topo,
        width: passo, height: alturaPlot, fill: 'transparent',
      });
      alvo.style.cursor = 'pointer';
      alvo.addEventListener('mousemove', (ev) =>
        mostrarTooltip(ev, `<strong>${diaSemana(d.data)}, ${dataBR(d.data)}</strong><br>${reais(d.valor)}`)
      );
      alvo.addEventListener('mouseleave', esconderTooltip);
      svg.appendChild(alvo);
    });

    // Só as pontas e o meio recebem rótulo, para não colidir
    const marcas = dados.length <= 8 ? dados.map((_, i) => i)
      : [0, Math.floor(dados.length / 2), dados.length - 1];
    for (const i of marcas) {
      const t = svgEl('text', {
        x: margem.esq + i * passo + passo / 2, y: A - 8,
        'text-anchor': 'middle', fill: COR.muted, 'font-size': 10,
      });
      t.textContent = dataBR(dados[i].data).slice(0, 5);
      svg.appendChild(t);
    }

    container.appendChild(svg);
  }

  /** Barra empilhada — como a receita se reparte. */
  function graficoComposicao(container, legenda, rel) {
    container.innerHTML = '';
    legenda.innerHTML = '';

    if (rel.receita <= 0) {
      container.appendChild(el('p', 'grafico__vazio', 'Sem receita no período.'));
      return;
    }

    const lucro = Math.max(0, rel.lucroLiquido);
    const partes = [
      { rotulo: 'Custo da mercadoria', valor: rel.cmv, cor: COR.cmv },
      { rotulo: 'Despesas', valor: rel.despesasOperacionais, cor: COR.receita },
      { rotulo: 'Sobra', valor: lucro, cor: COR.lucro },
    ].filter((p) => p.valor > 0);

    const total = partes.reduce((s, p) => s + p.valor, 0);

    for (const p of partes) {
      const chip = el('span', 'legenda-item');
      const bolinha = el('span', 'legenda-cor');
      bolinha.style.background = p.cor;
      chip.appendChild(bolinha);
      chip.appendChild(el('span', null, `${p.rotulo} · ${reais(p.valor)}`));
      legenda.appendChild(chip);
    }

    const L = container.clientWidth || 600;
    const A = 76;
    const alturaBarra = 34;
    const svg = svgEl('svg', { viewBox: `0 0 ${L} ${A}`, width: '100%', height: A, role: 'img' });
    svg.setAttribute('aria-label', 'Composição da receita');

    let x = 0;
    for (const p of partes) {
      const w = (p.valor / total) * L;
      const largura = Math.max(1, w - 2); // respiro de 2px entre segmentos
      svg.appendChild(svgEl('rect', { x, y: 0, width: largura, height: alturaBarra, rx: 4, fill: p.cor }));

      // Rótulo direto só quando o segmento tem espaço para ele
      if (w > 62) {
        const t = svgEl('text', {
          x: x + largura / 2, y: alturaBarra + 18,
          'text-anchor': 'middle', fill: COR.muted, 'font-size': 11,
        });
        t.textContent = pct((p.valor / total) * 100);
        svg.appendChild(t);
      }

      const alvo = svgEl('rect', { x, y: 0, width: largura, height: alturaBarra, fill: 'transparent' });
      alvo.style.cursor = 'pointer';
      alvo.addEventListener('mousemove', (ev) =>
        mostrarTooltip(ev, `<strong>${p.rotulo}</strong><br>${reais(p.valor)} · ${pct((p.valor / total) * 100)}`)
      );
      alvo.addEventListener('mouseleave', esconderTooltip);
      svg.appendChild(alvo);

      x += w;
    }

    container.appendChild(svg);

    if (rel.lucroLiquido < 0) {
      const p = el('p', 'grafico__nota', `Prejuízo de ${reais(Math.abs(rel.lucroLiquido))} — as saídas passaram da receita.`);
      container.appendChild(p);
    }
  }

  /** Barras horizontais — produtos por receita. Série única, rótulo direto. */
  function graficoProdutos(container, ranking) {
    container.innerHTML = '';
    if (!ranking.length) {
      container.appendChild(el('p', 'grafico__vazio', 'Nenhum produto vendido no período.'));
      return;
    }

    const lista = ranking.slice(0, 8);
    const L = container.clientWidth || 600;
    const alturaLinha = 34;
    const A = lista.length * alturaLinha + 8;
    const maximo = Math.max(...lista.map((p) => p.receita));
    const larguraBarra = Math.max(120, L * 0.52);
    const inicio = L - larguraBarra;

    const svg = svgEl('svg', { viewBox: `0 0 ${L} ${A}`, width: '100%', height: A, role: 'img' });
    svg.setAttribute('aria-label', 'Produtos que mais faturam');

    lista.forEach((p, i) => {
      const y = i * alturaLinha;
      const w = Math.max(2, (p.receita / maximo) * (larguraBarra - 90));

      const nome = svgEl('text', { x: 0, y: y + 20, fill: '#f3ead9', 'font-size': 12.5 });
      nome.textContent = p.nome.length > 30 ? p.nome.slice(0, 29) + '…' : p.nome;
      svg.appendChild(nome);

      svg.appendChild(svgEl('rect', {
        x: inicio, y: y + 8, width: w, height: 16, rx: 4, fill: COR.receita,
      }));

      const valor = svgEl('text', { x: inicio + w + 8, y: y + 21, fill: COR.muted, 'font-size': 11.5 });
      valor.textContent = `${reais(p.receita)} · ${p.qtd}un`;
      svg.appendChild(valor);

      const alvo = svgEl('rect', { x: 0, y, width: L, height: alturaLinha, fill: 'transparent' });
      alvo.style.cursor = 'pointer';
      const margem = p.receita ? ((p.receita - p.custo) / p.receita) * 100 : 0;
      alvo.addEventListener('mousemove', (ev) =>
        mostrarTooltip(ev,
          `<strong>${p.nome}</strong><br>${p.qtd} unidades · ${reais(p.receita)}` +
          (p.custo ? `<br>Custo ${reais(p.custo)} · margem ${pct(margem)}` : '<br>Custo não cadastrado'))
      );
      alvo.addEventListener('mouseleave', esconderTooltip);
      svg.appendChild(alvo);
    });

    container.appendChild(svg);
  }

  // ---------------------------------------------------------------- painel

  function tile(rotulo, valor, apoio, tom) {
    const t = el('div', 'tile' + (tom ? ` tile--${tom}` : ''));
    t.appendChild(el('span', 'tile__rotulo', rotulo));
    t.appendChild(el('strong', 'tile__valor', valor));
    if (apoio) t.appendChild(el('span', 'tile__apoio', apoio));
    return t;
  }

  function renderPainel() {
    const rel = Store.relatorio(periodoAtual);

    // Alertas
    const alertas = document.getElementById('alertas');
    alertas.innerHTML = '';

    const semCusto = Store.produtosSemCusto();
    if (semCusto.length) {
      const a = el('div', 'alerta alerta--atencao');
      a.innerHTML = `<strong>⚠ ${semCusto.length} produto(s) sem custo cadastrado.</strong> ` +
        `Enquanto isso, o CMV e o lucro saem inflados. Preencha em <em>Custos</em>.`;
      alertas.appendChild(a);
    }

    const repor = Store.insumosEmAlerta();
    if (repor.length) {
      const a = el('div', 'alerta alerta--critico');
      a.innerHTML = `<strong>⛔ Repor estoque:</strong> ` +
        repor.map((i) => `${i.nome} (${i.quantidade}${i.unidade})`).join(', ');
      alertas.appendChild(a);
    }

    // Tiles
    const tiles = document.getElementById('tiles');
    tiles.innerHTML = '';
    tiles.appendChild(tile('Receita', reais(rel.receita), `${rel.pedidos} pedido(s)`));
    tiles.appendChild(tile('Ticket médio', reais(rel.ticketMedio)));
    tiles.appendChild(tile('CMV', reais(rel.cmv), rel.receita ? pct(rel.cmvPercent) + ' da receita' : null));
    tiles.appendChild(tile('Lucro bruto', reais(rel.lucroBruto), rel.receita ? pct(rel.margemBruta) + ' de margem' : null));
    tiles.appendChild(tile('Despesas', reais(rel.despesasOperacionais)));
    if (rel.consumoProprio) {
      tiles.appendChild(tile('Consumo e cortesias', reais(rel.consumoProprio),
        'saiu do estoque sem virar venda'));
    }
    tiles.appendChild(tile(
      'Lucro líquido', reais(rel.lucroLiquido),
      rel.receita ? pct(rel.margemLiquida) + ' de margem' : null,
      rel.lucroLiquido < 0 ? 'ruim' : 'bom'
    ));
    tiles.appendChild(tile('Saldo de caixa', reais(rel.caixaSaldo),
      `entrou ${reaisCurto(rel.caixaEntradas)} · saiu ${reaisCurto(rel.caixaSaidas)}`,
      rel.caixaSaldo < 0 ? 'ruim' : null));
    tiles.appendChild(tile('Valor em estoque', reais(Store.valorDoEstoque()),
      `${Store.dados.insumos.length} insumo(s)`));

    // Gráficos
    const porDia = Store.receitaPorDia(periodoAtual);
    document.getElementById('legenda-receita').textContent =
      periodoAtual === 'tudo' ? 'Todos os dias com venda lançada.' : `Últimos ${periodoAtual === 'hoje' ? 1 : periodoAtual} dias.`;
    graficoReceitaPorDia(document.getElementById('gr-receita'), porDia);
    graficoComposicao(document.getElementById('gr-composicao'), document.getElementById('leg-composicao'), rel);

    const ranking = Store.rankingProdutos(periodoAtual);
    document.getElementById('legenda-produtos').textContent =
      ranking.length ? 'Ordenados por receita no período.' : '';
    graficoProdutos(document.getElementById('gr-produtos'), ranking);

    // Independe do filtro de período: cada operação é um fechamento próprio.
    renderPorOperacao();

    // Tabela alternativa (mesmos números, para quem prefere ler)
    const tabela = document.getElementById('tabela-painel');
    tabela.innerHTML = '';
    tabela.appendChild(montarTabela(
      ['Indicador', 'Valor'],
      [
        ['Receita', reais(rel.receita)],
        ['Pedidos', String(rel.pedidos)],
        ['Ticket médio', reais(rel.ticketMedio)],
        ['CMV', `${reais(rel.cmv)} (${pct(rel.cmvPercent)})`],
        ['Lucro bruto', `${reais(rel.lucroBruto)} (${pct(rel.margemBruta)})`],
        ['Despesas operacionais', reais(rel.despesasOperacionais)],
        ['Consumo próprio e cortesias', reais(rel.consumoProprio)],
        ['Compra de mercadoria', reais(rel.compraMercadoria)],
        ['Lucro líquido', `${reais(rel.lucroLiquido)} (${pct(rel.margemLiquida)})`],
        ['Caixa — entradas', reais(rel.caixaEntradas)],
        ['Caixa — saídas', reais(rel.caixaSaidas)],
        ['Caixa — saldo', reais(rel.caixaSaldo)],
      ]
    ));
  }

  /** "2026-07-27" + entregas -> "Sáb 01/08 e Dom 02/08" */
  function rotuloOperacao(op) {
    if (!op.datasEntrega.length) return 'sem entrega';

    const curto = (iso) => {
      const [, m, d] = iso.split('-');
      const dia = new Date(...iso.split('-').map((n, i) => (i === 1 ? n - 1 : Number(n))));
      return `${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dia.getDay()]} ${d}/${m}`;
    };

    const datas = op.datasEntrega.map(curto);
    if (datas.length === 1) return datas[0];
    if (datas.length === 2) return `${datas[0]} e ${datas[1]}`;
    return `${datas[0]} a ${datas[datas.length - 1]}`;
  }

  function renderPorOperacao() {
    const alvo = document.getElementById('por-operacao');
    alvo.innerHTML = '';

    const operacoes = Store.relatorioPorOperacao().slice(0, 12);
    if (!operacoes.length) {
      alvo.appendChild(vazio('Nenhuma operação fechada ainda.'));
      return;
    }

    for (const op of operacoes) {
      const cartao = el('div', 'operacao' + (op.lucroLiquido < 0 ? ' operacao--prejuizo' : ''));

      const topo = el('div', 'operacao__topo');
      const titulo = el('div');
      titulo.appendChild(el('strong', 'operacao__periodo', rotuloOperacao(op)));
      titulo.appendChild(el('span', 'operacao__pedidos',
        `${op.pedidos} pedido(s) · ${op.itens} item(ns) · ticket ${reais(op.ticketMedio)}`));
      topo.appendChild(titulo);

      const resultado = el('div', 'operacao__resultado');
      resultado.appendChild(el('strong', null, reais(op.lucroLiquido)));
      resultado.appendChild(el('span', null, `${pct(op.margem)} de margem`));
      topo.appendChild(resultado);
      cartao.appendChild(topo);

      const linhas = el('dl', 'operacao__contas');
      const linha = (rotulo, valor, classe) => {
        linhas.appendChild(el('dt', classe, rotulo));
        linhas.appendChild(el('dd', classe, valor));
      };
      linha('Faturamento', reais(op.receita));
      linha('Custo da mercadoria', '− ' + reais(op.cmv));
      linha('Lucro bruto', reais(op.lucroBruto), 'operacao__bruto');
      if (op.despesas) linha('Despesas', '− ' + reais(op.despesas));
      if (op.consumoProprio) linha('Consumo e cortesias', '− ' + reais(op.consumoProprio));
      cartao.appendChild(linhas);

      alvo.appendChild(cartao);
    }
  }

  function montarTabela(cabecalho, linhas) {
    const t = el('table', 'tabela');
    const thead = el('thead');
    const trh = el('tr');
    for (const c of cabecalho) trh.appendChild(el('th', null, c));
    thead.appendChild(trh);
    t.appendChild(thead);

    const tbody = el('tbody');
    for (const linha of linhas) {
      const tr = el('tr');
      for (const celula of linha) tr.appendChild(el('td', null, celula));
      tbody.appendChild(tr);
    }
    t.appendChild(tbody);
    return t;
  }

  function vazio(texto) {
    return el('p', 'vazio', texto);
  }

  // ---------------------------------------------------------------- vendas

  function montarItensVenda() {
    const alvo = document.getElementById('itens-venda');
    alvo.innerHTML = '';
    alvo.appendChild(el('span', 'itens-venda__titulo', 'Itens'));

    for (const categoria of CARDAPIO) {
      for (const item of categoria.itens) {
        const linha = el('div', 'item-venda');
        linha.appendChild(el('span', 'item-venda__nome', item.nome));
        linha.appendChild(el('span', 'item-venda__preco', reais(item.preco)));

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.value = '0';
        input.className = 'item-venda__qtd';
        input.dataset.produto = item.nome;
        input.dataset.preco = item.preco;
        input.setAttribute('aria-label', `Quantidade de ${item.nome}`);
        input.addEventListener('input', atualizarTotalVenda);
        linha.appendChild(input);

        alvo.appendChild(linha);
      }
    }
  }

  function itensSelecionados() {
    return [...document.querySelectorAll('.item-venda__qtd')]
      .map((i) => ({
        nome: i.dataset.produto,
        preco: Number(i.dataset.preco),
        custo: Store.custoDe(i.dataset.produto),
        qtd: parseInt(i.value, 10) || 0,
      }))
      .filter((i) => i.qtd > 0);
  }

  function atualizarTotalVenda() {
    const form = document.getElementById('form-venda');
    const itens = itensSelecionados();
    const total = itens.reduce((s, i) => s + i.preco * i.qtd, 0)
      + paraCentavos(form.elements.taxaEntrega.value)
      - paraCentavos(form.elements.desconto.value);
    document.getElementById('venda-total').textContent = 'Total: ' + reais(total);
  }

  function renderClientesNoSelect() {
    const select = document.getElementById('venda-cliente');
    const atual = select.value;
    select.innerHTML = '';
    select.appendChild(new Option('Sem cliente identificado', ''));
    for (const c of Store.dados.clientes) {
      select.appendChild(new Option(`${c.nome}${c.whatsapp ? ' · ' + c.whatsapp : ''}`, c.id));
    }
    select.value = atual;
  }

  /* Id da venda em edição, ou null quando o formulário está criando uma
     nova. É isto que decide se o botão grava ou substitui. */
  let editando = null;

  /** Joga a venda no formulário para correção. */
  function editarVenda(venda) {
    const form = document.getElementById('form-venda');
    editando = venda.id;

    form.elements.data.value = venda.data;
    form.elements.dataEntrega.value = venda.entregaISO || '';
    form.elements.horaAgendada.value = textoHora(venda.horaAgendada);
    form.elements.retirada.checked = !!venda.retirada;
    form.elements.clienteId.value = venda.clienteId || '';
    form.elements.taxaEntrega.value = venda.taxaEntrega ? (venda.taxaEntrega / 100).toFixed(2).replace('.', ',') : '';
    form.elements.desconto.value = venda.desconto ? (venda.desconto / 100).toFixed(2).replace('.', ',') : '';
    form.elements.pagamento.value = venda.pagamento || 'Pix';
    form.elements.situacao.value = venda.pago === false ? 'receber' : 'pago';
    form.elements.pagador.value = venda.pagador || '';
    form.elements.obs.value = venda.obs || '';

    document.querySelectorAll('.item-venda__qtd').forEach((campo) => {
      const item = venda.itens.find((i) => i.nome === campo.dataset.produto);
      campo.value = item ? String(item.qtd) : '0';
    });

    // Item que não está mais no cardápio não tem campo — avisa em vez de sumir.
    const orfaos = venda.itens.filter(
      (i) => !document.querySelector(`.item-venda__qtd[data-produto="${CSS.escape(i.nome)}"]`)
    );

    atualizarTotalVenda();
    mostrarModoEdicao(venda, orfaos);
    document.getElementById('form-venda').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function mostrarModoEdicao(venda, orfaos) {
    const aviso = document.getElementById('editando-venda');
    aviso.innerHTML = '';
    aviso.hidden = false;

    const texto = el('div');
    texto.appendChild(el('strong', null, `✏️ Corrigindo o pedido de ${venda.clienteNome || 'sem cliente'}`));
    texto.appendChild(el('div', 'editando__sub', `${dataBR(venda.data)} · ${reais(Store.totalVenda(venda))}`));
    if (orfaos.length) {
      texto.appendChild(el('div', 'editando__alerta',
        `⚠ ${orfaos.map((o) => o.nome).join(', ')} saiu do cardápio e será perdido se você salvar.`));
    }
    aviso.appendChild(texto);

    const cancelar = el('button', 'botao botao--secundario', 'Cancelar');
    cancelar.type = 'button';
    cancelar.addEventListener('click', sairDaEdicao);
    aviso.appendChild(cancelar);

    document.getElementById('botao-lancar').textContent = 'Salvar alterações';
  }

  function sairDaEdicao() {
    editando = null;
    const form = document.getElementById('form-venda');
    form.reset();
    form.elements.data.value = Store.hojeISO();
    document.querySelectorAll('.item-venda__qtd').forEach((i) => { i.value = '0'; });
    document.getElementById('editando-venda').hidden = true;
    document.getElementById('botao-lancar').textContent = 'Lançar venda';
    limparErro('erro-venda');
    atualizarTotalVenda();
  }

  function renderVendas() {
    const alvo = document.getElementById('lista-vendas');
    alvo.innerHTML = '';

    if (!Store.dados.vendas.length) {
      alvo.appendChild(vazio('Nenhuma venda lançada ainda.'));
      return;
    }

    const chave = (v) => String(Store.dataDeEntrega(v));

    /* A fila sai na ordem em que as coisas saem para a rua: sábado antes
       de domingo. Assim o próximo a entregar está sempre no topo, e
       pedido novo de sábado entra acima dos de domingo sozinho. */
    const fila = Store.dados.vendas
      .filter((v) => !v.entregue)
      .sort((a, b) => chave(a).localeCompare(chave(b)));

    const entregues = Store.dados.vendas
      .filter((v) => v.entregue)
      .sort((a, b) => chave(b).localeCompare(chave(a)))
      .slice(0, 40);

    if (fila.length) {
      alvo.appendChild(cabecalhoLista(`A entregar · ${fila.length}`, 'fila'));
      montarLinhas(alvo, fila);
    }

    if (entregues.length) {
      const detalhes = document.createElement('details');
      detalhes.className = 'entregues';
      const resumo = document.createElement('summary');
      resumo.textContent = `Entregues · ${Store.dados.vendas.filter((v) => v.entregue).length}`;
      detalhes.appendChild(resumo);
      const corpo = el('div');
      montarLinhas(corpo, entregues);
      detalhes.appendChild(corpo);
      alvo.appendChild(detalhes);
    }
  }

  function cabecalhoLista(texto, tom) {
    return el('div', `lista-cabecalho lista-cabecalho--${tom}`, texto);
  }

  function montarLinhas(alvo, vendas) {
    const hoje = Store.hojeISO();

    for (const v of vendas) {
      const atrasado = !v.entregue && String(Store.dataDeEntrega(v)) < hoje;
      const linha = el('div', 'registro' + (v.entregue ? ' registro--entregue' : '') +
        (atrasado ? ' registro--atrasado' : ''));
      const texto = el('div', 'registro__texto');

      const cliente = v.clienteNome || 'Sem cliente';
      texto.appendChild(el('div', 'registro__titulo', `${dataBR(v.data)} · ${cliente}`));

      /* Quando entregar é o que decide a rota do dia, então precisa
         estar à vista. Antes só aparecia abrindo a impressão do ticket.
         Nas vendas antigas a data do pedido já é a da entrega, e aí a
         linha só repetiria — por isso ela só sai quando há data própria. */
      const entrega = textoEntrega(v.entregaTexto) || rotuloEntrega(v.entregaISO);
      if (entrega) {
        const hora = textoHora(v.horaAgendada);
        const linhaEntrega = el('div', 'registro__entrega');
        linhaEntrega.textContent = (v.retirada
          ? `📦 Retirada — ${entrega}`
          : `🚚 Entrega ${entrega}${hora ? ` · ${hora}` : ''}`)
          + (atrasado ? '  ⚠ atrasado' : '');
        texto.appendChild(linhaEntrega);
      }
      const detalhe = v.itens.map((i) => `${i.qtd}x ${i.nome}`).join(', ');
      const infoLinha = el('div', 'registro__detalhe', `${detalhe} · ${v.pagamento}`);
      if (v.pago === false) {
        infoLinha.appendChild(document.createTextNode(' · '));
        infoLinha.appendChild(el('strong', 'registro__receber', 'A RECEBER'));
      }
      if (v.pagador && v.pagador.toLowerCase() !== String(v.clienteNome || '').toLowerCase()) {
        infoLinha.appendChild(document.createTextNode(` · pago por ${v.pagador}`));
      }
      if (v.recibo) {
        infoLinha.appendChild(document.createTextNode(' · '));
        const link = el('a', 'registro__recibo', 'comprovante');
        link.href = v.recibo;
        link.target = '_blank';
        link.rel = 'noopener';
        infoLinha.appendChild(link);
      }
      texto.appendChild(infoLinha);
      linha.appendChild(texto);

      linha.appendChild(el('strong', 'registro__valor', reais(Store.totalVenda(v))));

      const concluir = el('button',
        'registro__entregue' + (v.entregue ? ' registro__entregue--feito' : ''),
        v.entregue ? '↩' : '✓');
      concluir.type = 'button';
      concluir.title = v.entregue ? 'Devolver para a fila' : 'Marcar como entregue';
      concluir.setAttribute('aria-label',
        `${v.entregue ? 'Devolver para a fila' : 'Marcar como entregue'} — ${v.clienteNome || 'venda'}`);
      concluir.addEventListener('click', () => {
        Store.marcarEntregue(v.id, !v.entregue);
        renderTudo();
      });
      linha.appendChild(concluir);

      const editar = el('button', 'registro__imprimir', '✏️');
      editar.type = 'button';
      editar.title = 'Corrigir este pedido';
      editar.setAttribute('aria-label', `Corrigir pedido de ${v.clienteNome || 'venda'}`);
      editar.addEventListener('click', () => editarVenda(v));
      linha.appendChild(editar);

      const imprimir = el('button', 'registro__imprimir', '🖨');
      imprimir.type = 'button';
      imprimir.title = 'Imprimir ticket de expedição';
      imprimir.setAttribute('aria-label', `Imprimir ticket de ${v.clienteNome || 'venda'}`);
      imprimir.addEventListener('click', () => imprimirVendas([v]));
      linha.appendChild(imprimir);

      const botao = el('button', 'registro__excluir', '×');
      botao.type = 'button';
      botao.title = 'Excluir venda';
      botao.setAttribute('aria-label', `Excluir venda de ${dataBR(v.data)}`);
      botao.addEventListener('click', () => {
        if (!confirm(`Excluir a venda de ${dataBR(v.data)} (${reais(Store.totalVenda(v))})?`)) return;
        Store.removerVenda(v.id);
        renderTudo();
      });
      linha.appendChild(botao);

      alvo.appendChild(linha);
    }
  }

  // -------------------------------------------------------------- clientes

  /** Id do cliente em edição, ou null quando o formulário está cadastrando. */
  let editandoCliente = null;

  function editarCliente(cliente) {
    const form = document.getElementById('form-cliente');
    editandoCliente = cliente.id;

    form.elements.nome.value = cliente.nome || '';
    form.elements.whatsapp.value = cliente.whatsapp || '';
    form.elements.endereco.value = cliente.endereco || '';
    form.elements.obs.value = cliente.obs || '';

    const resumo = Store.resumoCliente(cliente.id);
    const aviso = document.getElementById('editando-cliente');
    aviso.innerHTML = '';
    aviso.hidden = false;

    const texto = el('div');
    texto.appendChild(el('strong', null, `✏️ Corrigindo o cadastro de ${cliente.nome}`));
    texto.appendChild(el('div', 'editando__sub',
      `${resumo.pedidos} pedido(s) · ${reais(resumo.total)} · última em ${dataBR(resumo.ultimaCompra)}`));
    aviso.appendChild(texto);

    const cancelar = el('button', 'botao botao--secundario', 'Cancelar');
    cancelar.type = 'button';
    cancelar.addEventListener('click', sairDaEdicaoCliente);
    aviso.appendChild(cancelar);

    document.getElementById('botao-cadastrar-cliente').textContent = 'Salvar alterações';
    document.getElementById('titulo-cliente').textContent = 'Corrigir cliente';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function sairDaEdicaoCliente() {
    editandoCliente = null;
    document.getElementById('form-cliente').reset();
    document.getElementById('editando-cliente').hidden = true;
    document.getElementById('botao-cadastrar-cliente').textContent = 'Cadastrar';
    document.getElementById('titulo-cliente').textContent = 'Cadastrar cliente';
    limparErro('erro-cliente');
  }

  function renderClientes() {
    const alvo = document.getElementById('lista-clientes');
    const busca = (document.getElementById('busca-cliente').value || '').toLowerCase().trim();
    alvo.innerHTML = '';

    let lista = Store.rankingClientes();
    if (busca) {
      lista = lista.filter((c) =>
        [c.nome, c.whatsapp, c.endereco].filter(Boolean).join(' ').toLowerCase().includes(busca)
      );
    }

    if (!lista.length) {
      alvo.appendChild(vazio(busca ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'));
      return;
    }

    for (const c of lista) {
      const cartao = el('div', 'cliente');

      const topo = el('div', 'cliente__topo');
      const nome = el('div');
      nome.appendChild(el('strong', 'cliente__nome', c.nome));
      if (c.whatsapp) {
        const link = el('a', 'cliente__zap', c.whatsapp);
        link.href = `https://wa.me/${zapInternacional(c.whatsapp)}`;
        link.target = '_blank';
        link.rel = 'noopener';
        nome.appendChild(link);
      }
      topo.appendChild(nome);

      const acoes = el('div', 'cliente__acoes');

      const editar = el('button', 'registro__imprimir', '✏️');
      editar.type = 'button';
      editar.title = 'Corrigir cadastro';
      editar.setAttribute('aria-label', `Corrigir cadastro de ${c.nome}`);
      editar.addEventListener('click', () => editarCliente(c));
      acoes.appendChild(editar);

      const excluir = el('button', 'registro__excluir', '×');
      excluir.type = 'button';
      excluir.setAttribute('aria-label', `Excluir ${c.nome}`);
      excluir.addEventListener('click', () => {
        if (!confirm(`Excluir ${c.nome}? As vendas dele continuam registradas.`)) return;
        if (editandoCliente === c.id) sairDaEdicaoCliente();
        Store.removerCliente(c.id);
        renderTudo();
      });
      acoes.appendChild(excluir);
      topo.appendChild(acoes);
      cartao.appendChild(topo);

      if (c.endereco) cartao.appendChild(el('div', 'cliente__linha', '📍 ' + c.endereco));
      if (c.obs) cartao.appendChild(el('div', 'cliente__linha', '📝 ' + c.obs));

      const stats = el('div', 'cliente__stats');
      stats.appendChild(el('span', null, `${c.pedidos} pedido(s)`));
      stats.appendChild(el('span', null, `Total ${reais(c.total)}`));
      stats.appendChild(el('span', null, `Ticket ${reais(c.ticketMedio)}`));
      stats.appendChild(el('span', null, `Última: ${dataBR(c.ultimaCompra)}`));
      cartao.appendChild(stats);

      alvo.appendChild(cartao);
    }
  }

  /** Deixa o telefone no formato do wa.me (55 + DDD + número). */
  function zapInternacional(tel) {
    const so = Store.normalizarTelefone(tel);
    return so.startsWith('55') ? so : '55' + so;
  }

  // ----------------------------------------------------------------- caixa

  function renderCategorias() {
    const tipo = document.getElementById('lanc-tipo').value;
    const select = document.getElementById('lanc-categoria');
    select.innerHTML = '';

    const lista = tipo === 'saida'
      ? Store.CATEGORIAS_SAIDA.map((c) => c.nome)
      : Store.CATEGORIAS_ENTRADA;

    for (const nome of lista) select.appendChild(new Option(nome, nome));
    atualizarDicaCategoria();
  }

  function atualizarDicaCategoria() {
    const categoria = document.getElementById('lanc-categoria').value;
    const dica = document.getElementById('dica-categoria');
    dica.textContent = Store.categoriaEhEstoque(categoria)
      ? 'Compra de mercadoria: sai do caixa agora, vira custo no resultado quando vender.'
      : '';
  }

  function renderLancamentos() {
    const alvo = document.getElementById('lista-lancamentos');
    alvo.innerHTML = '';

    const lista = [...Store.dados.lancamentos].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 60);
    if (!lista.length) {
      alvo.appendChild(vazio('Nenhum movimento lançado ainda.'));
      return;
    }

    for (const l of lista) {
      const linha = el('div', 'registro');
      const texto = el('div', 'registro__texto');
      texto.appendChild(el('div', 'registro__titulo', `${dataBR(l.data)} · ${l.categoria}`));
      if (l.descricao) texto.appendChild(el('div', 'registro__detalhe', l.descricao));
      linha.appendChild(texto);

      const valor = el('strong', 'registro__valor', (l.tipo === 'saida' ? '− ' : '+ ') + reais(l.valor));
      valor.classList.add(l.tipo === 'saida' ? 'registro__valor--saida' : 'registro__valor--entrada');
      linha.appendChild(valor);

      const botao = el('button', 'registro__excluir', '×');
      botao.type = 'button';
      botao.setAttribute('aria-label', 'Excluir movimento');
      botao.addEventListener('click', () => {
        if (!confirm(`Excluir ${l.categoria} de ${reais(l.valor)}?`)) return;
        Store.removerLancamento(l.id);
        renderTudo();
      });
      linha.appendChild(botao);

      alvo.appendChild(linha);
    }
  }

  // --------------------------------------------------------------- estoque

  function renderInsumos() {
    const alvo = document.getElementById('lista-insumos');
    alvo.innerHTML = '';

    if (!Store.dados.insumos.length) {
      alvo.appendChild(vazio('Nenhum insumo cadastrado ainda.'));
      return;
    }

    for (const i of Store.dados.insumos) {
      const emAlerta = i.minimo > 0 && i.quantidade <= i.minimo;
      const cartao = el('div', 'insumo' + (emAlerta ? ' insumo--alerta' : ''));

      const topo = el('div', 'insumo__topo');
      const nome = el('div');
      nome.appendChild(el('strong', null, i.nome));
      nome.appendChild(el('span', 'insumo__saldo',
        `${i.quantidade}${i.unidade}` +
        (i.minimo ? ` · mínimo ${i.minimo}${i.unidade}` : '') +
        (i.custoUnitario ? ` · ${reais(i.custoUnitario)}/${i.unidade}` : '')
      ));
      topo.appendChild(nome);

      const excluir = el('button', 'registro__excluir', '×');
      excluir.type = 'button';
      excluir.setAttribute('aria-label', `Excluir ${i.nome}`);
      excluir.addEventListener('click', () => {
        if (!confirm(`Excluir ${i.nome} e suas movimentações?`)) return;
        Store.removerInsumo(i.id);
        renderTudo();
      });
      topo.appendChild(excluir);
      cartao.appendChild(topo);

      if (emAlerta) cartao.appendChild(el('div', 'insumo__aviso', '⛔ Abaixo do mínimo — precisa repor.'));

      const acoes = el('div', 'insumo__acoes');
      const campo = document.createElement('input');
      campo.type = 'text';
      campo.inputMode = 'decimal';
      campo.placeholder = `Qtd em ${i.unidade}`;
      campo.className = 'insumo__campo';
      campo.setAttribute('aria-label', `Quantidade para movimentar ${i.nome}`);
      acoes.appendChild(campo);

      for (const [rotulo, tipo] of [
        ['+ Entrada', 'entrada'],
        ['− Saída', 'saida'],
        ['🎁 Cortesia', 'consumo'],
      ]) {
        const b = el('button', 'botao botao--pequeno', rotulo);
        b.type = 'button';
        b.addEventListener('click', () => {
          const q = paraNumero(campo.value);
          if (q <= 0) return alert('Informe uma quantidade maior que zero.');
          Store.movimentarEstoque({
            data: Store.hojeISO(), insumoId: i.id, tipo, quantidade: q,
            custoUnitario: i.custoUnitario,
            obs: tipo === 'consumo' ? 'Consumo próprio e cortesias' : '',
          });
          campo.value = '';
          renderTudo();
        });
        acoes.appendChild(b);
      }
      cartao.appendChild(acoes);
      alvo.appendChild(cartao);
    }
  }

  // ---------------------------------------------------------------- custos

  /* Itens esgotados. Vivem na planilha, não no aparelho: o cardápio é uma
     página estática e precisa ler isso de algum lugar que o painel
     alcance. */
  let esgotadosAtuais = [];

  function renderEsgotados() {
    const alvo = document.getElementById('lista-esgotados');
    alvo.innerHTML = '';

    for (const categoria of CARDAPIO) {
      for (const item of categoria.itens) {
        const marcado = esgotadosAtuais.some(
          (e) => e.toLowerCase() === item.nome.toLowerCase()
        );

        const linha = document.createElement('label');
        linha.className = 'esgotado' + (marcado ? ' esgotado--sim' : '');

        const marca = document.createElement('input');
        marca.type = 'checkbox';
        marca.checked = marcado;
        marca.addEventListener('change', () => {
          esgotadosAtuais = marca.checked
            ? [...esgotadosAtuais.filter((e) => e.toLowerCase() !== item.nome.toLowerCase()), item.nome]
            : esgotadosAtuais.filter((e) => e.toLowerCase() !== item.nome.toLowerCase());
          renderEsgotados();
        });

        linha.appendChild(marca);
        linha.appendChild(el('span', 'esgotado__nome', item.nome));
        linha.appendChild(el('span', 'esgotado__estado', marcado ? 'esgotado' : 'à venda'));
        alvo.appendChild(linha);
      }
    }
  }

  function buscarEsgotados() {
    const { url } = lerIntegracao();
    if (!url) {
      renderEsgotados();
      return;
    }

    fetch(`${url}?acao=esgotados`)
      .then((r) => r.text())
      .then((texto) => {
        if (!texto.trim().startsWith('{')) return;
        const r = JSON.parse(texto);
        if (r.ok && Array.isArray(r.esgotados)) esgotadosAtuais = r.esgotados;
      })
      .catch(() => { /* sem conexão: mostra a lista vazia */ })
      .finally(renderEsgotados);
  }

  function salvarEsgotados() {
    const alvo = document.getElementById('resultado-esgotados');
    const botao = document.getElementById('btn-salvar-esgotados');
    const { url, token } = lerIntegracao();

    alvo.innerHTML = '';
    if (!url || !token) {
      alvo.appendChild(el('p', 'erro-adm',
        'Configure a conexão na aba Vendas antes de mexer no cardápio.'));
      return;
    }

    botao.disabled = true;
    botao.textContent = 'Aplicando…';

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ acao: 'esgotar', token, esgotados: esgotadosAtuais }),
    })
      .then((r) => r.text())
      .then((texto) => {
        if (!texto.trim().startsWith('{')) {
          throw new Error('O Google não respondeu direito agora. Tente de novo.');
        }
        const r = JSON.parse(texto);
        if (!r.ok) throw new Error(r.erro || 'A planilha recusou.');

        const caixa = el('div', 'sinc__resultado');
        caixa.appendChild(el('strong', null, esgotadosAtuais.length
          ? `✓ ${esgotadosAtuais.length} item(ns) travado(s) no cardápio`
          : '✓ Tudo liberado no cardápio'));
        caixa.appendChild(el('p', 'sinc__linha',
          'Quem estiver com o cardápio aberto vê a mudança ao recarregar.'));
        alvo.appendChild(caixa);
      })
      .catch((erro) => {
        alvo.appendChild(el('p', 'erro-adm', `Não consegui aplicar: ${erro.message}`));
      })
      .finally(() => {
        botao.disabled = false;
        botao.textContent = 'Aplicar no cardápio';
      });
  }

  function renderCustos() {
    const campoRend = document.getElementById('campo-rendimento');
    if (campoRend && document.activeElement !== campoRend) {
      campoRend.value = String(Store.dados.config.rendimento).replace('.', ',');
    }

    document.getElementById('aviso-sem-insumo').hidden = Store.dados.insumos.length > 0;

    const alvo = document.getElementById('lista-custos');
    alvo.innerHTML = '';

    for (const categoria of CARDAPIO) {
      for (const item of categoria.itens) {
        alvo.appendChild(montarCartaoProduto(item));
      }
    }
  }

  function montarCartaoProduto(item) {
    const custo = Store.custoDe(item.nome);
    const daFicha = Store.custoDaFicha(item.nome);
    const margem = item.preco ? ((item.preco - custo) / item.preco) * 100 : 0;

    const cartao = el('div', 'produto-ficha');

    // Cabeçalho: preço, custo e margem
    const topo = el('div', 'produto-ficha__topo');
    const texto = el('div');
    texto.appendChild(el('div', 'custo__nome', item.nome));
    texto.appendChild(el('div', 'custo__detalhe',
      custo
        ? `Vende a ${reais(item.preco)} · custo ${reais(custo)} · margem ${pct(margem)}` +
          (daFicha !== null ? ' · pela ficha' : ' · valor digitado')
        : `Vende a ${reais(item.preco)} · sem custo cadastrado`
    ));
    topo.appendChild(texto);
    cartao.appendChild(topo);

    // Ficha técnica
    const detalhes = document.createElement('details');
    detalhes.className = 'ficha';
    if (daFicha !== null) detalhes.open = false;

    const resumo = document.createElement('summary');
    resumo.textContent = daFicha !== null ? 'Ver ficha técnica' : 'Montar ficha técnica';
    detalhes.appendChild(resumo);

    const ficha = Store.fichaDe(item.nome);
    const corpo = el('div', 'ficha__corpo');

    // Componentes já cadastrados
    if (ficha.componentes && ficha.componentes.length) {
      for (const [indice, c] of ficha.componentes.entries()) {
        corpo.appendChild(linhaComponente(item.nome, ficha, indice, c));
      }
    } else {
      corpo.appendChild(el('p', 'ficha__vazio', 'Nenhum insumo na ficha ainda.'));
    }

    corpo.appendChild(formNovoComponente(item.nome, ficha));

    // Produtos do cardápio (para combos: costela + acompanhamentos)
    corpo.appendChild(el('div', 'ficha__titulo', 'Produtos do cardápio (para combos)'));
    for (const [indice, p] of (ficha.produtos || []).entries()) {
      corpo.appendChild(linhaComponenteProduto(item.nome, ficha, indice, p));
    }
    corpo.appendChild(formNovoComponenteProduto(item.nome, ficha));

    // Custos extras (gás, lenha, rateios)
    corpo.appendChild(el('div', 'ficha__titulo', 'Outros custos por unidade'));
    for (const [indice, e] of (ficha.extras || []).entries()) {
      const linha = el('div', 'ficha__extra');
      linha.appendChild(el('span', null, e.nome));
      linha.appendChild(el('strong', null, reais(e.valor)));
      const x = el('button', 'registro__excluir', '×');
      x.type = 'button';
      x.setAttribute('aria-label', `Remover ${e.nome}`);
      x.addEventListener('click', () => {
        ficha.extras.splice(indice, 1);
        Store.salvarFicha(item.nome, ficha);
        renderTudo();
      });
      linha.appendChild(x);
      corpo.appendChild(linha);
    }
    corpo.appendChild(formNovoExtra(item.nome, ficha));

    if (daFicha !== null) {
      corpo.appendChild(el('div', 'ficha__total', `Custo pela ficha: ${reais(daFicha)}`));
    }

    // Valor digitado à mão, para quem ainda não montou ficha
    const manual = el('div', 'ficha__manual');
    manual.appendChild(el('span', null,
      daFicha !== null ? 'Valor manual (ignorado, a ficha manda)' : 'Ou informe o custo direto'));
    const campo = document.createElement('input');
    campo.type = 'text';
    campo.inputMode = 'decimal';
    campo.className = 'custo__campo';
    campo.value = Store.dados.custos[item.nome] ? (Store.dados.custos[item.nome] / 100).toFixed(2).replace('.', ',') : '';
    campo.placeholder = '0,00';
    campo.setAttribute('aria-label', `Custo manual de ${item.nome}`);
    campo.addEventListener('change', () => {
      Store.definirCusto(item.nome, paraCentavos(campo.value));
      renderTudo();
    });
    manual.appendChild(campo);
    corpo.appendChild(manual);

    detalhes.appendChild(corpo);
    cartao.appendChild(detalhes);
    return cartao;
  }

  function linhaComponente(produto, ficha, indice, c) {
    const insumo = Store.dados.insumos.find((i) => i.id === c.insumoId);
    const linha = el('div', 'ficha__linha');

    if (!insumo) {
      linha.appendChild(el('span', 'ficha__sumido', 'Insumo removido do estoque'));
    } else {
      const bruta = Store.quantidadeBruta(c);
      const custo = Math.round(bruta * (insumo.custoUnitario || 0));

      const desc = el('div', 'ficha__desc');
      desc.appendChild(el('strong', null, insumo.nome));
      desc.appendChild(el('span', null,
        c.aplicarRendimento
          ? `${c.quantidade}${insumo.unidade} prontos → ${bruta}${insumo.unidade} crus × ${reais(insumo.custoUnitario)}`
          : `${c.quantidade}${insumo.unidade} × ${reais(insumo.custoUnitario)}`
      ));
      linha.appendChild(desc);
      linha.appendChild(el('strong', 'ficha__valor', reais(custo)));
    }

    const x = el('button', 'registro__excluir', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Remover da ficha');
    x.addEventListener('click', () => {
      ficha.componentes.splice(indice, 1);
      Store.salvarFicha(produto, ficha);
      renderTudo();
    });
    linha.appendChild(x);
    return linha;
  }

  /** Uma linha "1x Costela no Bafo — 1kg — R$ 49,77" dentro da ficha de um combo. */
  function linhaComponenteProduto(produtoPai, ficha, indice, p) {
    const linha = el('div', 'ficha__linha');
    const custoUnit = Store.custoDe(p.nome);

    const desc = el('div', 'ficha__desc');
    desc.appendChild(el('strong', null, `${p.quantidade}x ${p.nome}`));
    desc.appendChild(el('span', null, custoUnit
      ? `${reais(custoUnit)} cada`
      : 'sem custo cadastrado ainda'));
    linha.appendChild(desc);
    linha.appendChild(el('strong', 'ficha__valor', reais(custoUnit * p.quantidade)));

    const x = el('button', 'registro__excluir', '×');
    x.type = 'button';
    x.setAttribute('aria-label', `Remover ${p.nome} do combo`);
    x.addEventListener('click', () => {
      ficha.produtos.splice(indice, 1);
      Store.salvarFicha(produtoPai, ficha);
      renderTudo();
    });
    linha.appendChild(x);
    return linha;
  }

  /**
   * Formulário para montar um combo a partir de outros produtos do
   * cardápio, em vez de repetir a ficha de carne e tempero de cada um.
   * O próprio produto fica de fora da lista, para não referenciar a si
   * mesmo.
   */
  function formNovoComponenteProduto(produtoPai, ficha) {
    const form = el('div', 'ficha__form');

    const select = document.createElement('select');
    select.className = 'ficha__select';
    select.setAttribute('aria-label', 'Produto do cardápio');
    select.appendChild(new Option('Escolha o produto…', ''));
    for (const categoria of CARDAPIO) {
      for (const i of categoria.itens) {
        if (i.nome === produtoPai) continue;
        select.appendChild(new Option(i.nome, i.nome));
      }
    }
    form.appendChild(select);

    const qtd = document.createElement('input');
    qtd.type = 'text';
    qtd.inputMode = 'decimal';
    qtd.className = 'ficha__qtd';
    qtd.placeholder = 'Qtd';
    qtd.value = '1';
    form.appendChild(qtd);

    const botao = el('button', 'botao botao--pequeno', 'Adicionar');
    botao.type = 'button';
    botao.addEventListener('click', () => {
      const q = paraNumero(qtd.value);
      if (!select.value) return alert('Escolha o produto.');
      if (q <= 0) return alert('Informe a quantidade.');

      ficha.produtos = ficha.produtos || [];
      ficha.produtos.push({ nome: select.value, quantidade: q });
      Store.salvarFicha(produtoPai, ficha);
      renderTudo();
    });
    form.appendChild(botao);

    return form;
  }

  function formNovoComponente(produto, ficha) {
    const form = el('div', 'ficha__form');

    const select = document.createElement('select');
    select.className = 'ficha__select';
    select.setAttribute('aria-label', 'Insumo');
    select.appendChild(new Option('Escolha o insumo…', ''));
    for (const i of Store.dados.insumos) {
      select.appendChild(new Option(`${i.nome} (${i.unidade})`, i.id));
    }
    form.appendChild(select);

    const qtd = document.createElement('input');
    qtd.type = 'text';
    qtd.inputMode = 'decimal';
    qtd.className = 'ficha__qtd';
    qtd.placeholder = 'Qtd';
    qtd.setAttribute('aria-label', 'Quantidade');
    form.appendChild(qtd);

    const marcaRotulo = document.createElement('label');
    marcaRotulo.className = 'ficha__rendimento';
    const marca = document.createElement('input');
    marca.type = 'checkbox';
    marca.checked = true;
    marcaRotulo.appendChild(marca);
    marcaRotulo.appendChild(el('span', null, `é carne (×${Store.dados.config.rendimento})`));
    form.appendChild(marcaRotulo);

    const botao = el('button', 'botao botao--pequeno', 'Adicionar');
    botao.type = 'button';
    botao.addEventListener('click', () => {
      const q = paraNumero(qtd.value);
      if (!select.value) return alert('Escolha o insumo.');
      if (q <= 0) return alert('Informe a quantidade.');

      ficha.componentes = ficha.componentes || [];
      ficha.componentes.push({
        insumoId: select.value,
        quantidade: q,
        aplicarRendimento: marca.checked,
      });
      Store.salvarFicha(produto, ficha);
      renderTudo();
    });
    form.appendChild(botao);

    return form;
  }

  function formNovoExtra(produto, ficha) {
    const form = el('div', 'ficha__form');

    const nome = document.createElement('input');
    nome.type = 'text';
    nome.className = 'ficha__select';
    nome.placeholder = 'Ex.: gás e lenha';
    nome.setAttribute('aria-label', 'Nome do custo');
    form.appendChild(nome);

    const valor = document.createElement('input');
    valor.type = 'text';
    valor.inputMode = 'decimal';
    valor.className = 'ficha__qtd';
    valor.placeholder = 'R$';
    valor.setAttribute('aria-label', 'Valor');
    form.appendChild(valor);

    const botao = el('button', 'botao botao--pequeno', 'Adicionar');
    botao.type = 'button';
    botao.addEventListener('click', () => {
      const v = paraCentavos(valor.value);
      if (!nome.value.trim()) return alert('Dê um nome ao custo.');
      if (v <= 0) return alert('Informe o valor.');

      ficha.extras = ficha.extras || [];
      ficha.extras.push({ nome: nome.value.trim(), valor: v });
      Store.salvarFicha(produto, ficha);
      renderTudo();
    });
    form.appendChild(botao);

    return form;
  }

  // ---------------------------------------------------------------- backup

  function configurarBackup() {
    document.getElementById('btn-exportar').addEventListener('click', () => {
      const blob = new Blob([Store.exportar()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-brunao-${Store.hojeISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('btn-importar').addEventListener('change', (ev) => {
      const arquivo = ev.target.files[0];
      if (!arquivo) return;
      if (!confirm('Restaurar substitui TODOS os dados atuais. Continuar?')) {
        ev.target.value = '';
        return;
      }
      const leitor = new FileReader();
      leitor.onload = () => {
        try {
          Store.importar(leitor.result);
          renderTudo();
          alert('Backup restaurado.');
        } catch (erro) {
          alert('Não foi possível restaurar: ' + erro.message);
        }
        ev.target.value = '';
      };
      leitor.readAsText(arquivo);
    });

    document.getElementById('btn-apagar').addEventListener('click', () => {
      if (!confirm('Apagar TODOS os dados do painel? Isso não tem volta.')) return;
      if (!confirm('Tem certeza mesmo? Baixe um backup antes se ainda não baixou.')) return;
      Store.apagarTudo();
      renderTudo();
    });
  }

  // ----------------------------------------------- ticket de expedição 80mm

  /**
   * Monta uma via do ticket para a impressora térmica.
   *
   * Feito para quem está separando o pedido, não para o cliente: o que
   * precisa saltar aos olhos é para onde vai, quando, e o que entra na
   * sacola. Por isso a data de entrega e o endereço vêm em destaque, e o
   * dinheiro fica embaixo.
   */
  function montarVia(venda) {
    const via = el('div', 'ticket__via');
    const cliente = venda.clienteId
      ? Store.dados.clientes.find((c) => c.id === venda.clienteId)
      : null;

    const regua = (forte) => el('div', forte ? 'ticket__regua--forte' : 'ticket__regua');
    const rotulo = (t) => el('div', 'ticket__rotulo', t);
    const linha = (esq, dir) => {
      const l = el('div', 'ticket__linha');
      l.appendChild(el('span', null, esq));
      l.appendChild(el('span', null, dir));
      return l;
    };

    const selo = document.createElement('img');
    selo.className = 'ticket__selo';
    selo.src = 'assets/selo-ticket.png';
    selo.alt = 'Brunão Costela no Bafo';
    via.appendChild(selo);

    via.appendChild(el('div', 'ticket__marca', 'BRUNÃO COSTELA NO BAFO'));
    via.appendChild(regua(true));

    if (venda.orderNsu) via.appendChild(el('div', null, 'PEDIDO ' + venda.orderNsu));
    via.appendChild(el('div', 'ticket__pequeno',
      'Impresso em ' + new Date().toLocaleString('pt-BR')));
    via.appendChild(regua());

    // O que o expedidor precisa ver primeiro
    const entrega = textoEntrega(venda.entregaTexto) || dataBR(venda.data);
    via.appendChild(rotulo(venda.retirada ? 'RETIRADA' : 'ENTREGA'));
    via.appendChild(el('div', 'ticket__destaque', entrega));

    const hora = textoHora(venda.horaAgendada);
    if (hora) {
      via.appendChild(el('div', 'ticket__destaque', 'HORÁRIO ' + hora));
    } else if (!venda.retirada) {
      const { abre, fecha } = LOJA.entrega.horario;
      via.appendChild(el('div', null, `Janela: ${abre} às ${fecha}`));
    }

    via.appendChild(regua());
    via.appendChild(rotulo('CLIENTE'));
    via.appendChild(el('div', null, venda.clienteNome || 'Não identificado'));
    if (cliente && cliente.whatsapp) via.appendChild(el('div', null, cliente.whatsapp));

    via.appendChild(regua());
    via.appendChild(rotulo(venda.retirada ? 'RETIRAR NO LOCAL' : 'ENDEREÇO'));
    const endereco = (cliente && cliente.endereco) || venda.enderecoTexto || '';
    via.appendChild(el('div', null, venda.retirada ? '—' : (endereco || 'Endereço não informado')));

    via.appendChild(regua());
    via.appendChild(rotulo('ITENS'));
    for (const item of venda.itens) {
      const bloco = el('div', 'ticket__item');
      bloco.appendChild(el('div', 'ticket__item-nome', `${item.qtd}x ${item.nome}`));
      bloco.appendChild(linha('', reais(item.preco * item.qtd)));
      via.appendChild(bloco);
    }

    via.appendChild(regua());
    const subtotal = venda.itens.reduce((s, i) => s + i.preco * i.qtd, 0);
    via.appendChild(linha('Subtotal', reais(subtotal)));
    if (venda.taxaEntrega) via.appendChild(linha('Entrega/agendamento', reais(venda.taxaEntrega)));
    if (venda.desconto) via.appendChild(linha('Desconto', '-' + reais(venda.desconto)));

    const total = el('div', 'ticket__total');
    total.appendChild(el('span', null, 'TOTAL'));
    total.appendChild(el('span', null, reais(Store.totalVenda(venda))));
    via.appendChild(total);
    via.appendChild(el('div', null, 'Forma: ' + (venda.pagamento || '—')));

    /* Situação do pagamento em caixa própria e grande. É o que decide se
       o entregador cobra ou não — errar aqui custa dinheiro, então não
       pode ficar disputando atenção no meio das observações.
       `pago` ausente conta como pago: as vendas antigas vieram todas do
       site, onde só entra o que já foi confirmado. */
    const aReceber = venda.pago === false;
    const situacao = el('div', 'ticket__situacao' + (aReceber ? ' ticket__situacao--receber' : ''));
    situacao.textContent = aReceber
      ? `RECEBER ${reais(Store.totalVenda(venda))}`
      : 'PAGO — NAO COBRAR';
    via.appendChild(situacao);

    // Só o que o cliente escreveu. Link de comprovante e "pago pelo site"
    // são controle interno: quem está separando o pedido não precisa
    // disso, e ocupava o espaço que importa.
    if (venda.obs && venda.obs.trim()) {
      const obs = el('div', 'ticket__obs');
      obs.appendChild(el('div', 'ticket__rotulo', 'OBSERVAÇÕES'));
      obs.appendChild(el('div', null, venda.obs.trim()));
      via.appendChild(obs);
    }

    via.appendChild(regua(true));
    const rodape = el('div', 'ticket__rodape');
    rodape.appendChild(el('div', null, 'Obrigado pela preferência!'));
    rodape.appendChild(el('div', null, LOJA.whatsappVisivel));
    via.appendChild(rodape);

    return via;
  }

  function imprimirVendas(vendas) {
    if (!vendas.length) {
      alert('Nenhuma venda para imprimir.');
      return;
    }
    const alvo = document.getElementById('ticket');
    alvo.innerHTML = '';
    for (const venda of vendas) alvo.appendChild(montarVia(venda));
    window.print();
  }

  /** Todas as vendas de uma data, para separar a rota de uma vez. */
  function imprimirDoDia() {
    const dia = document.getElementById('data-expedicao').value;
    if (!dia) return alert('Escolha a data.');

    const vendas = Store.dados.vendas.filter((v) => (v.entregaISO || v.data) === dia);
    if (!vendas.length) {
      return alert(`Nenhuma venda para ${dataBR(dia)}.`);
    }
    imprimirVendas(vendas);
  }

  // ------------------------------------ puxar vendas pagas pela InfinitePay

  const CHAVE_INTEGRACAO = 'brunao:integracao';

  /** Recado curto na barra do topo. Texto vazio esconde. */
  function avisoBarra(texto, tom) {
    const barra = document.getElementById('aviso-barra');
    if (!barra) return;
    barra.textContent = texto;
    barra.className = 'aviso-barra' + (tom ? ` aviso-barra--${tom}` : '');
    barra.hidden = !texto;
    if (texto && tom) setTimeout(() => { barra.hidden = true; }, 6000);
  }

  /**
   * A URL e o token ficam no navegador, nunca no código.
   *
   * O painel é uma página pública — qualquer um pode abrir o admin.html
   * do site. Se o token estivesse no código, estaria à vista de todos, e
   * ele é o que protege o faturamento.
   */
  function lerIntegracao() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_INTEGRACAO) || '{}');
    } catch {
      return {};
    }
  }

  function salvarIntegracao(url, token) {
    localStorage.setItem(CHAVE_INTEGRACAO, JSON.stringify({ url: url.trim(), token: token.trim() }));
  }

  /**
   * Converte a venda da planilha para o formato do painel.
   *
   * Taxa de entrega e agendamento chegam como itens porque o checkout da
   * InfinitePay só entende lista de itens. Aqui eles voltam a ser taxa,
   * senão apareceriam como produtos vendidos e sujariam o CMV e o
   * ranking de produtos.
   */
  function converterVendaDoSite(bruta) {
    const itens = [];
    let taxa = 0;

    for (const linha of (bruta.itens || [])) {
      const nome = String(linha.description || '').trim();
      const doCardapio = CARDAPIO.flatMap((c) => c.itens).find((i) => i.nome === nome);

      if (doCardapio) {
        itens.push({
          nome,
          qtd: linha.quantity,
          preco: linha.price,
          custo: Store.custoDe(nome),
        });
      } else {
        // Taxa de entrega, agendamento e qualquer outro acréscimo.
        taxa += (linha.price || 0) * (linha.quantity || 1);
      }
    }

    return { itens, taxa };
  }

  /**
   * @param {boolean} automatico Disparado sozinho ao abrir o painel.
   *   Nesse modo não reclama de configuração faltando (quem ainda não
   *   configurou não precisa levar erro na cara toda vez que abre) e
   *   avisa discretamente na barra em vez de ocupar a tela.
   */
  /**
   * Completa a data de entrega de um pedido que já está no painel.
   *
   * Os primeiros pedidos entraram antes de a planilha ganhar as colunas
   * de entrega, e ficaram sem esse dado. Como a sincronização só
   * acrescentava pedido novo, esses registros seguiam incompletos — e a
   * fila, sem data de entrega, caía na data do pedido e os escondia como
   * se já tivessem saído.
   *
   * Só preenche o que está faltando. Nada que você tenha corrigido à mão
   * é sobrescrito.
   */
  function completarEntrega(bruta) {
    const venda = Store.dados.vendas.find((v) => v.orderNsu === bruta.order_nsu);
    if (!venda) return false;

    const texto = textoEntrega(bruta.entrega_texto);
    const iso = entregaParaISO(bruta.entrega_texto, bruta.data);
    const hora = textoHora(bruta.hora_agendada);

    const campos = {};
    if (texto && !venda.entregaTexto) campos.entregaTexto = texto;
    if (iso && !venda.entregaISO) campos.entregaISO = iso;
    if (hora && !venda.horaAgendada) campos.horaAgendada = hora;
    if (bruta.recibo && !venda.recibo) campos.recibo = bruta.recibo;

    if (!Object.keys(campos).length) return false;

    Object.assign(venda, campos);

    /* Ganhou data de entrega para hoje ou depois: o pedido ainda não
       saiu, então volta para a fila — a menos que você já tenha dito
       que ele saiu, e nesse caso `entregueEm` está preenchido. */
    if (venda.entregue && !venda.entregueEm && Store.dataDeEntrega(venda) >= Store.hojeISO()) {
      venda.entregue = false;
    }

    Store.atualizarVenda(venda.id, venda);
    return true;
  }

  function sincronizarVendas(automatico) {
    const alvo = document.getElementById('resultado-sinc');
    const botao = document.getElementById('btn-sincronizar');
    const { url, token } = lerIntegracao();

    alvo.innerHTML = '';

    if (!url || !token) {
      if (automatico) return;
      alvo.appendChild(el('p', 'erro-adm', 'Preencha a URL e o token em "Configurar conexão".'));
      document.getElementById('config-integracao').open = true;
      return;
    }

    if (automatico) avisoBarra('Buscando vendas pagas…');

    botao.disabled = true;
    botao.textContent = 'Buscando…';

    const endereco = `${url}?acao=vendas&token=${encodeURIComponent(token)}`;

    fetch(endereco)
      .then((r) => r.text())
      .then((texto) => {
        /* De vez em quando o Google devolve uma página em vez dos dados,
           em vez de um erro limpo. Sem este tratamento a mensagem que
           chegava era "Unexpected token '<'", que não ajuda ninguém. */
        if (!texto.trim().startsWith('{')) {
          throw new Error('O Google não respondeu direito agora. Tente de novo em alguns segundos.');
        }
        return JSON.parse(texto);
      })
      .then((resposta) => {
        if (!resposta.ok) throw new Error(resposta.erro || 'A planilha recusou o pedido.');

        let novas = 0;
        let repetidas = 0;
        let clientesNovos = 0;

        let completadas = 0;

        for (const bruta of (resposta.vendas || [])) {
          if (Store.vendaJaImportada(bruta.order_nsu)) {
            repetidas++;
            if (completarEntrega(bruta)) completadas++;
            continue;
          }

          const { itens, taxa } = converterVendaDoSite(bruta);
          if (!itens.length && !taxa) continue;

          // Cliente: reaproveita o cadastro se já existir pelo nome.
          let cliente = Store.dados.clientes.find(
            (c) => c.nome.toLowerCase() === String(bruta.cliente || '').toLowerCase()
          );
          if (!cliente && bruta.cliente) {
            cliente = Store.addCliente({
              nome: bruta.cliente,
              whatsapp: bruta.telefone || '',
              endereco: bruta.endereco || '',
              obs: '',
            });
            clientesNovos++;
          }

          Store.addVenda({
            data: bruta.data,
            clienteId: cliente ? cliente.id : null,
            clienteNome: bruta.cliente || '',
            itens,
            taxaEntrega: taxa,
            desconto: 0,
            pagamento: bruta.metodo || 'Pix',
            // Observações guardam só o que o cliente escreveu. O
            // comprovante fica em campo próprio, para não poluir o
            // ticket de expedição.
            obs: bruta.observacoes || '',
            recibo: bruta.recibo || '',
            // Venda do site é sempre paga: o Apps Script só entrega as
            // que a InfinitePay confirmou.
            pago: true,
            orderNsu: bruta.order_nsu,
            origem: 'site',
            // Dados de expedição: para onde e quando, não quando compraram.
            entregaTexto: textoEntrega(bruta.entrega_texto),
            entregaISO: entregaParaISO(bruta.entrega_texto, bruta.data),
            horaAgendada: textoHora(bruta.hora_agendada),
            retirada: !!bruta.retirada,
            enderecoTexto: bruta.endereco || '',
          });
          novas++;
        }

        // Na busca automática, silêncio quando não há novidade — só o que
        // mudou merece interromper quem abriu o painel.
        if (automatico) {
          if (novas || completadas) {
            const partes = [];
            if (novas) partes.push(`${novas} venda(s) nova(s)`);
            if (completadas) partes.push(`${completadas} com data de entrega recuperada`);
            avisoBarra('✓ ' + partes.join(' · '), 'bom');
            renderTudo();
          } else {
            avisoBarra('');
          }
          return;
        }

        const caixa = el('div', 'sinc__resultado');
        if (novas) {
          caixa.appendChild(el('strong', null, `✓ ${novas} venda(s) nova(s) lançada(s)`));
          if (clientesNovos) {
            caixa.appendChild(el('p', 'sinc__linha', `${clientesNovos} cliente(s) cadastrado(s) junto.`));
          }
        } else {
          caixa.appendChild(el('strong', null, 'Nenhuma venda nova.'));
        }
        if (completadas) {
          caixa.appendChild(el('p', 'sinc__linha',
            `${completadas} pedido(s) tiveram a data de entrega recuperada da planilha.`));
        }
        if (repetidas) {
          caixa.appendChild(el('p', 'sinc__linha', `${repetidas} já estavam aqui e foram ignoradas.`));
        }
        alvo.appendChild(caixa);

        renderTudo();
      })
      .catch((erro) => {
        // Falha na automática não pode travar o painel: os lançamentos
        // que já estão aqui continuam valendo mesmo sem internet.
        if (automatico) {
          avisoBarra('Não consegui buscar as vendas do site agora.', 'ruim');
          return;
        }
        alvo.appendChild(el('p', 'erro-adm',
          `Não consegui buscar: ${erro.message} Confira a URL e o token em "Configurar conexão".`));
      })
      .finally(() => {
        botao.disabled = false;
        botao.textContent = 'Puxar vendas pagas';
      });
  }

  // ------------------------------------------------------ relatório de vendas

  /**
   * Escapa um campo para CSV: entre aspas se tiver o separador, aspas ou
   * quebra de linha, dobrando aspas internas — regra padrão do formato.
   */
  function csvCampo(valor) {
    const texto = String(valor ?? '');
    if (/[;"\n]/.test(texto)) return '"' + texto.replace(/"/g, '""') + '"';
    return texto;
  }

  /**
   * Uma linha por produto vendido, não por pedido — um pedido com 3
   * itens vira 3 linhas. Sem isso, "Valor" seria ambíguo (preço de qual
   * item, de quantos?). O período filtra pela DATA DE ENTREGA, a mesma
   * lógica do "Resultado por operação": o que aquela semana entregou,
   * não quando foi vendido.
   */
  function gerarLinhasRelatorio(de, ate) {
    const linhas = [];
    for (const venda of Store.dados.vendas) {
      const entrega = Store.dataDeEntrega(venda);
      if (entrega < de || entrega > ate) continue;

      const origem = venda.origem === 'site' ? 'Online' : 'Manual';
      for (const item of venda.itens) {
        linhas.push({
          dataPedido: dataBR(venda.data),
          dataEntrega: dataBR(entrega),
          origem,
          produto: item.nome,
          quantidade: item.qtd,
          valor: item.preco * item.qtd,
        });
      }
    }
    // Mais recente primeiro, igual à lista de vendas.
    return linhas.sort((a, b) => b.dataEntrega.localeCompare(a.dataEntrega));
  }

  function baixarRelatorioCSV() {
    const de = document.getElementById('relatorio-de').value;
    const ate = document.getElementById('relatorio-ate').value;
    const resumo = document.getElementById('relatorio-resumo');

    if (!de || !ate) {
      resumo.textContent = 'Escolha as duas datas.';
      return;
    }

    const linhas = gerarLinhasRelatorio(de, ate);
    if (!linhas.length) {
      resumo.textContent = 'Nenhuma venda com entrega nesse período.';
      return;
    }

    /* Ponto e vírgula como separador, não vírgula: é o que o Excel em
       português espera ao abrir um CSV com duplo clique — com vírgula,
       ele jogaria tudo numa coluna só. Valor sai com vírgula decimal
       (formato brasileiro) em vez de ponto, para abrir já pronto para
       somar, sem precisar trocar a configuração regional do Excel. */
    const cabecalho = ['Data pedido', 'Data entrega', 'Origem', 'Produto', 'Quantidade', 'Valor'];
    const corpo = linhas.map((l) => [
      l.dataPedido, l.dataEntrega, l.origem, l.produto, l.quantidade,
      (l.valor / 100).toFixed(2).replace('.', ','),
    ].map(csvCampo).join(';'));

    const csv = [cabecalho.join(';'), ...corpo].join('\r\n');

    // BOM no início: sem ele, o Excel no Windows lê acentos (ç, ã, é)
    // como caracteres errados, mesmo o arquivo estando em UTF-8 correto.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendas-${de}-a-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    const totalValor = linhas.reduce((s, l) => s + l.valor, 0);
    resumo.textContent = `${linhas.length} linha(s) · total ${reais(totalValor)}`;
  }

  function configurarRelatorio() {
    const hoje = new Date();
    const seteDiasAtras = new Date(hoje);
    seteDiasAtras.setDate(hoje.getDate() - 6);

    const paraISO = (d) => {
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const dia = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${mes}-${dia}`;
    };

    document.getElementById('relatorio-de').value = paraISO(seteDiasAtras);
    document.getElementById('relatorio-ate').value = paraISO(hoje);
    document.getElementById('btn-baixar-relatorio').addEventListener('click', baixarRelatorioCSV);
  }

  function configurarSincronizacao() {
    const { url, token } = lerIntegracao();
    document.getElementById('sinc-url').value = url || '';
    document.getElementById('sinc-token').value = token || '';

    // Sem configuração ainda: já abre o painel de conexão.
    if (!url || !token) document.getElementById('config-integracao').open = true;

    document.getElementById('btn-salvar-integracao').addEventListener('click', () => {
      salvarIntegracao(
        document.getElementById('sinc-url').value,
        document.getElementById('sinc-token').value
      );
      const alvo = document.getElementById('resultado-sinc');
      alvo.innerHTML = '';
      alvo.appendChild(el('p', 'sinc__ok', 'Conexão salva neste aparelho.'));
      document.getElementById('config-integracao').open = false;
    });

    document.getElementById('btn-sincronizar').addEventListener('click', () => sincronizarVendas(false));

    // Busca sozinho ao abrir, para você não depender de lembrar do botão.
    // Fora da renderização inicial: o painel abre na hora, e a venda nova
    // entra quando o Apps Script responder, uns segundos depois.
    if (url && token) setTimeout(() => sincronizarVendas(true), 400);
  }

  // ------------------------------------------------- ler pedido do WhatsApp

  /**
   * Interpreta a mensagem de pedido que o próprio cardápio gerou.
   *
   * Como o formato é escrito por nós (js/app.js), dá para ler com segurança.
   * Nada é gravado aqui: a função só devolve o que entendeu, e quem lança a
   * venda continua sendo você, conferindo no formulário.
   */
  function lerPedidoWhatsApp(texto) {
    const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    const pedido = { itens: [], avisos: [] };

    // "2x Costela no Bafo — 1,5kg — R$ 269,80"
    // O nome do produto também tem travessão, então o `.+` guloso garante
    // que a separação aconteça no último " — R$ " da linha.
    for (const linha of linhas) {
      const m = linha.match(/^(\d+)x\s+(.+)\s+—\s+R\$\s*([\d.,]+)$/);
      if (!m) continue;

      const qtd = parseInt(m[1], 10);
      const nome = m[2].trim();
      const totalLinha = paraCentavos(m[3]);

      const doCardapio = CARDAPIO.flatMap((c) => c.itens).find((i) => i.nome === nome);
      if (doCardapio) {
        pedido.itens.push({ nome, qtd, preco: doCardapio.preco, encontrado: true });
      } else {
        pedido.itens.push({
          nome, qtd, preco: qtd ? Math.round(totalLinha / qtd) : totalLinha, encontrado: false,
        });
        pedido.avisos.push(`"${nome}" não está no cardápio atual — confira o preço.`);
      }
    }

    const pegar = (regex) => {
      const m = texto.match(regex);
      return m ? m[1].trim() : '';
    };

    // Entrega grátis vem escrita por extenso; a taxa normal vem com valor.
    if (/Entrega:\s*\*?GRÁTIS/i.test(texto)) {
      pedido.taxaEntrega = 0;
    } else {
      pedido.taxaEntrega = paraCentavos(pegar(/Taxa de entrega:\s*R\$\s*([\d.,]+)/i));
    }

    pedido.cliente = pegar(/\*Cliente:\*\s*(.+)/);
    pedido.endereco = pegar(/\*Endereço:\*\s*(.+)/);
    pedido.pagamento = pegar(/\*Pagamento:\*\s*(.+)/);
    pedido.observacoes = pegar(/\*Observações:\*\s*(.+)/);
    pedido.troco = pegar(/\*Troco para:\*\s*R?\$?\s*(.+)/);
    pedido.retirada = /\*Retirada no local\*/i.test(texto);

    // "*Entregar em:* Domingo, 26/07 (hoje)" -> 2026-07-26
    const data = pegar(/\*(?:Entregar|Retirar) em:\*\s*(.+)/);
    const dm = data.match(/(\d{2})\/(\d{2})/);
    if (dm) {
      const hoje = new Date();
      let ano = hoje.getFullYear();
      const tentativa = new Date(ano, Number(dm[2]) - 1, Number(dm[1]));
      // Data muito no passado indica virada de ano na mensagem.
      if ((hoje - tentativa) / 86400000 > 180) ano++;
      pedido.data = `${ano}-${dm[2]}-${dm[1]}`;
    }

    if (!pedido.itens.length) pedido.avisos.push('Não encontrei nenhum item na mensagem.');
    if (!pedido.data) pedido.avisos.push('Não encontrei a data — vai usar hoje.');

    return pedido;
  }

  /** Joga o que foi lido dentro do formulário de venda, sem salvar nada. */
  function aplicarPedido(pedido) {
    const form = document.getElementById('form-venda');

    /* A data que vem na mensagem é a da ENTREGA, não a do pedido. Antes
       as duas eram tratadas como a mesma coisa e o ticket saía com a
       data errada. */
    form.elements.data.value = Store.hojeISO();
    form.elements.dataEntrega.value = pedido.data || '';
    form.elements.retirada.checked = !!pedido.retirada;

    const agendamento = pedido.itens.find((i) => /^Agendamento de horário/.test(i.nome));
    const hora = agendamento && agendamento.nome.match(/(\d{2}:\d{2})/);
    form.elements.horaAgendada.value = hora ? hora[1] : '';
    form.elements.taxaEntrega.value = pedido.taxaEntrega
      ? (pedido.taxaEntrega / 100).toFixed(2).replace('.', ',') : '';
    form.elements.obs.value = [pedido.observacoes, pedido.troco ? `Troco para R$ ${pedido.troco}` : '']
      .filter(Boolean).join(' · ');

    if (pedido.pagamento) {
      const opcao = [...form.elements.pagamento.options].find((o) => o.value === pedido.pagamento);
      if (opcao) form.elements.pagamento.value = pedido.pagamento;
    }

    document.querySelectorAll('.item-venda__qtd').forEach((i) => { i.value = '0'; });
    for (const item of pedido.itens) {
      const campo = document.querySelector(`.item-venda__qtd[data-produto="${CSS.escape(item.nome)}"]`);
      if (campo) campo.value = String(item.qtd);
    }

    // Cliente: liga no cadastro se já existir pelo nome.
    const existente = Store.dados.clientes.find(
      (c) => c.nome.toLowerCase() === (pedido.cliente || '').toLowerCase()
    );
    form.elements.clienteId.value = existente ? existente.id : '';

    atualizarTotalVenda();
    return existente;
  }

  function configurarColar() {
    const campo = document.getElementById('colar-pedido');
    const alvo = document.getElementById('resultado-colar');

    document.getElementById('btn-limpar-colar').addEventListener('click', () => {
      campo.value = '';
      alvo.innerHTML = '';
    });

    document.getElementById('btn-ler-pedido').addEventListener('click', () => {
      alvo.innerHTML = '';
      const texto = campo.value.trim();
      if (!texto) {
        alvo.appendChild(el('p', 'erro-adm', 'Cole a mensagem do pedido primeiro.'));
        return;
      }

      const pedido = lerPedidoWhatsApp(texto);
      const existente = aplicarPedido(pedido);

      const caixa = el('div', 'colar__resultado');
      caixa.appendChild(el('strong', null, '✓ Li o pedido e preenchi o formulário abaixo'));

      const lista = el('ul', 'colar__lista');
      for (const i of pedido.itens) {
        lista.appendChild(el('li', null, `${i.qtd}x ${i.nome} — ${reais(i.preco * i.qtd)}`));
      }
      if (pedido.taxaEntrega) lista.appendChild(el('li', null, `Taxa de entrega — ${reais(pedido.taxaEntrega)}`));
      if (pedido.retirada) lista.appendChild(el('li', null, 'Retirada no local'));
      if (pedido.data) lista.appendChild(el('li', null, `Data: ${dataBR(pedido.data)}`));
      if (pedido.pagamento) lista.appendChild(el('li', null, `Pagamento: ${pedido.pagamento}`));
      caixa.appendChild(lista);

      // Cliente novo: oferece cadastrar junto, com o endereço da mensagem.
      if (pedido.cliente && !existente) {
        const aviso = el('div', 'colar__cliente');
        const marca = document.createElement('input');
        marca.type = 'checkbox';
        marca.id = 'colar-cadastrar-cliente';
        marca.checked = true;
        const rotulo = document.createElement('label');
        rotulo.htmlFor = marca.id;
        rotulo.textContent = `Cadastrar "${pedido.cliente}" como cliente novo` +
          (pedido.endereco ? ` (com o endereço da mensagem)` : '');
        aviso.appendChild(marca);
        aviso.appendChild(rotulo);
        caixa.appendChild(aviso);

        caixa.dataset.clienteNovo = pedido.cliente;
        caixa.dataset.enderecoNovo = pedido.endereco || '';
      } else if (existente) {
        caixa.appendChild(el('p', 'colar__ok', `Cliente "${existente.nome}" já cadastrado — vinculado à venda.`));
      }

      for (const aviso of pedido.avisos) {
        caixa.appendChild(el('p', 'colar__aviso', '⚠ ' + aviso));
      }

      caixa.appendChild(el('p', 'colar__dica',
        'Confira os valores no formulário abaixo e clique em "Lançar venda" para salvar.'));

      alvo.appendChild(caixa);
      document.getElementById('form-venda').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /** Cadastra o cliente lido da mensagem, se você deixou a caixinha marcada. */
  function cadastrarClienteDaMensagem() {
    const caixa = document.querySelector('.colar__resultado');
    const marca = document.getElementById('colar-cadastrar-cliente');
    if (!caixa || !marca || !marca.checked || !caixa.dataset.clienteNovo) return null;

    const novo = Store.addCliente({
      nome: caixa.dataset.clienteNovo,
      whatsapp: '',
      endereco: caixa.dataset.enderecoNovo || '',
      obs: '',
    });
    return novo;
  }

  // ------------------------------------------------------------ formulários

  function erro(idCampo, mensagem) {
    const p = document.getElementById(idCampo);
    p.textContent = mensagem;
    p.hidden = false;
  }

  function limparErro(idCampo) {
    document.getElementById(idCampo).hidden = true;
  }

  function configurarFormularios() {
    // --- venda
    const formVenda = document.getElementById('form-venda');
    formVenda.elements.data.value = Store.hojeISO();
    formVenda.elements.taxaEntrega.addEventListener('input', atualizarTotalVenda);
    formVenda.elements.desconto.addEventListener('input', atualizarTotalVenda);

    formVenda.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const itens = itensSelecionados();
      if (!itens.length) return erro('erro-venda', 'Escolha pelo menos um item.');
      if (!formVenda.elements.data.value) return erro('erro-venda', 'Informe a data da venda.');
      limparErro('erro-venda');

      // Se o pedido veio colado do WhatsApp e trouxe cliente novo, cadastra
      // antes de gravar a venda para que ela já nasça vinculada a ele.
      // Sem data de entrega informada, vale a data do pedido.
      const entregaISO = formVenda.elements.dataEntrega.value || formVenda.elements.data.value;

      const recemCadastrado = cadastrarClienteDaMensagem();
      const clienteId = recemCadastrado ? recemCadastrado.id : (formVenda.elements.clienteId.value || null);
      const cliente = clienteId ? Store.dados.clientes.find((c) => c.id === clienteId) : null;

      const dadosVenda = {
        data: formVenda.elements.data.value,
        clienteId,
        clienteNome: cliente ? cliente.nome : '',
        itens,
        taxaEntrega: paraCentavos(formVenda.elements.taxaEntrega.value),
        desconto: paraCentavos(formVenda.elements.desconto.value),
        pagamento: formVenda.elements.pagamento.value,
        pago: formVenda.elements.situacao.value === 'pago',
        /* Quem paga nem sempre é quem pede — a InfinitePay mostra o
           titular da conta, e o painel mostra quem preencheu o pedido.
           Sem anotar isso, a conferência do extrato trava num nome que
           não existe em lugar nenhum. */
        pagador: formVenda.elements.pagador.value.trim(),
        obs: formVenda.elements.obs.value.trim(),
        /* Quando entregar, que é o que o ticket de expedição precisa.
           Sem isso ele caía na data do lançamento — que costuma ser
           dias antes da entrega. */
        entregaISO: entregaISO,
        entregaTexto: rotuloEntrega(entregaISO),
        horaAgendada: formVenda.elements.horaAgendada.value.trim(),
        retirada: formVenda.elements.retirada.checked,
      };

      if (editando) {
        Store.atualizarVenda(editando, dadosVenda);
        sairDaEdicao();
      } else {
        Store.addVenda(dadosVenda);
        formVenda.reset();
        formVenda.elements.data.value = Store.hojeISO();
        document.querySelectorAll('.item-venda__qtd').forEach((i) => { i.value = '0'; });
      }

      document.getElementById('colar-pedido').value = '';
      document.getElementById('resultado-colar').innerHTML = '';
      atualizarTotalVenda();
      renderTudo();
    });

    // --- cliente
    const formCliente = document.getElementById('form-cliente');
    formCliente.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const nome = formCliente.elements.nome.value.trim();
      const whatsapp = formCliente.elements.whatsapp.value.trim();
      if (!nome) return erro('erro-cliente', 'O nome é obrigatório.');

      // Ao corrigir, o próprio cadastro não conta como duplicata.
      const jaExiste = Store.acharClientePorTelefone(whatsapp);
      if (whatsapp && jaExiste && jaExiste.id !== editandoCliente) {
        return erro('erro-cliente', `Esse WhatsApp já está cadastrado em ${jaExiste.nome}.`);
      }
      limparErro('erro-cliente');

      const dados = {
        nome,
        whatsapp,
        endereco: formCliente.elements.endereco.value.trim(),
        obs: formCliente.elements.obs.value.trim(),
      };

      if (editandoCliente) {
        Store.atualizarCliente(editandoCliente, dados);
        sairDaEdicaoCliente();
      } else {
        Store.addCliente(dados);
        formCliente.reset();
      }

      renderTudo();
    });

    document.getElementById('busca-cliente').addEventListener('input', renderClientes);

    // --- lançamento de caixa
    const formLanc = document.getElementById('form-lancamento');
    formLanc.elements.data.value = Store.hojeISO();
    document.getElementById('lanc-tipo').addEventListener('change', renderCategorias);
    document.getElementById('lanc-categoria').addEventListener('change', atualizarDicaCategoria);

    formLanc.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const valor = paraCentavos(formLanc.elements.valor.value);
      if (valor <= 0) return erro('erro-lancamento', 'Informe um valor maior que zero.');
      if (!formLanc.elements.data.value) return erro('erro-lancamento', 'Informe a data.');
      limparErro('erro-lancamento');

      Store.addLancamento({
        data: formLanc.elements.data.value,
        tipo: formLanc.elements.tipo.value,
        categoria: formLanc.elements.categoria.value,
        valor,
        descricao: formLanc.elements.descricao.value.trim(),
      });

      formLanc.reset();
      formLanc.elements.data.value = Store.hojeISO();
      renderCategorias();
      renderTudo();
    });

    // --- insumo
    const formInsumo = document.getElementById('form-insumo');
    formInsumo.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const nome = formInsumo.elements.nome.value.trim();
      if (!nome) return erro('erro-insumo', 'O nome é obrigatório.');
      limparErro('erro-insumo');

      Store.addInsumo({
        nome,
        unidade: formInsumo.elements.unidade.value,
        custoUnitario: paraCentavos(formInsumo.elements.custoUnitario.value),
        minimo: paraNumero(formInsumo.elements.minimo.value),
        quantidade: 0,
      });

      formInsumo.reset();
      renderTudo();
    });
  }

  // ------------------------------------------------------------------ abas

  function configurarAbas() {
    for (const botao of document.querySelectorAll('.aba')) {
      botao.addEventListener('click', () => {
        document.querySelectorAll('.aba').forEach((b) => b.classList.remove('aba--ativa'));
        document.querySelectorAll('.secao').forEach((s) => s.classList.remove('secao--ativa'));
        botao.classList.add('aba--ativa');
        document.getElementById('secao-' + botao.dataset.aba).classList.add('secao--ativa');
        if (botao.dataset.aba === 'painel') renderPainel();
      });
    }
  }

  // ---------------------------------------------------------------- início

  function renderTudo() {
    renderPainel();
    renderClientesNoSelect();
    renderVendas();
    renderClientes();
    renderLancamentos();
    renderInsumos();
    renderCustos();
  }

  function iniciar() {
    montarItensVenda();
    renderCategorias();
    configurarAbas();
    configurarFormularios();
    configurarColar();
    configurarRelatorio();
    configurarSincronizacao();
    configurarBackup();

    /* Painel aberto em outra aba: em vez de seguir com a cópia velha e
       depois gravar por cima, esta aba recarrega e redesenha na hora. */
    Store.observarOutrasAbas(() => {
      renderTudo();
      avisoBarra('Os dados mudaram em outra aba do painel — esta tela foi atualizada.', 'bom');
    });

    document.getElementById('btn-salvar-esgotados').addEventListener('click', salvarEsgotados);
    buscarEsgotados();

    document.getElementById('data-expedicao').value = Store.hojeISO();
    document.getElementById('btn-imprimir-dia').addEventListener('click', imprimirDoDia);

    document.getElementById('campo-rendimento').addEventListener('change', (ev) => {
      const fator = paraNumero(ev.target.value);
      if (fator <= 0) {
        alert('O rendimento precisa ser maior que zero.');
        ev.target.value = String(Store.dados.config.rendimento).replace('.', ',');
        return;
      }
      Store.definirRendimento(fator);
      renderTudo();
    });

    document.getElementById('filtro-periodo').addEventListener('change', (ev) => {
      periodoAtual = ev.target.value;
      renderPainel();
    });

    let debounce;
    window.addEventListener('resize', () => {
      clearTimeout(debounce);
      debounce = setTimeout(renderPainel, 180);
    });

    renderTudo();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
