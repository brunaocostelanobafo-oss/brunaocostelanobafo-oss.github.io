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
        ['Compra de mercadoria', reais(rel.compraMercadoria)],
        ['Lucro líquido', `${reais(rel.lucroLiquido)} (${pct(rel.margemLiquida)})`],
        ['Caixa — entradas', reais(rel.caixaEntradas)],
        ['Caixa — saídas', reais(rel.caixaSaidas)],
        ['Caixa — saldo', reais(rel.caixaSaldo)],
      ]
    ));
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

  function renderVendas() {
    const alvo = document.getElementById('lista-vendas');
    alvo.innerHTML = '';

    const vendas = [...Store.dados.vendas].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 60);
    if (!vendas.length) {
      alvo.appendChild(vazio('Nenhuma venda lançada ainda.'));
      return;
    }

    for (const v of vendas) {
      const linha = el('div', 'registro');
      const texto = el('div', 'registro__texto');

      const cliente = v.clienteNome || 'Sem cliente';
      texto.appendChild(el('div', 'registro__titulo', `${dataBR(v.data)} · ${cliente}`));
      const detalhe = v.itens.map((i) => `${i.qtd}x ${i.nome}`).join(', ');
      texto.appendChild(el('div', 'registro__detalhe', `${detalhe} · ${v.pagamento}`));
      linha.appendChild(texto);

      linha.appendChild(el('strong', 'registro__valor', reais(Store.totalVenda(v))));

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

      const excluir = el('button', 'registro__excluir', '×');
      excluir.type = 'button';
      excluir.setAttribute('aria-label', `Excluir ${c.nome}`);
      excluir.addEventListener('click', () => {
        if (!confirm(`Excluir ${c.nome}? As vendas dele continuam registradas.`)) return;
        Store.removerCliente(c.id);
        renderTudo();
      });
      topo.appendChild(excluir);
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

      for (const [rotulo, tipo] of [['+ Entrada', 'entrada'], ['− Saída', 'saida']]) {
        const b = el('button', 'botao botao--pequeno', rotulo);
        b.type = 'button';
        b.addEventListener('click', () => {
          const q = paraNumero(campo.value);
          if (q <= 0) return alert('Informe uma quantidade maior que zero.');
          Store.movimentarEstoque({
            data: Store.hojeISO(), insumoId: i.id, tipo, quantidade: q,
            custoUnitario: i.custoUnitario,
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

  function renderCustos() {
    const alvo = document.getElementById('lista-custos');
    alvo.innerHTML = '';

    for (const categoria of CARDAPIO) {
      for (const item of categoria.itens) {
        const custo = Store.custoDe(item.nome);
        const margem = item.preco ? ((item.preco - custo) / item.preco) * 100 : 0;

        const linha = el('div', 'custo');
        const texto = el('div', 'custo__texto');
        texto.appendChild(el('div', 'custo__nome', item.nome));
        texto.appendChild(el('div', 'custo__detalhe',
          custo ? `Vende a ${reais(item.preco)} · margem ${pct(margem)}`
                : `Vende a ${reais(item.preco)} · custo não cadastrado`
        ));
        linha.appendChild(texto);

        const campo = document.createElement('input');
        campo.type = 'text';
        campo.inputMode = 'decimal';
        campo.className = 'custo__campo';
        campo.value = custo ? (custo / 100).toFixed(2).replace('.', ',') : '';
        campo.placeholder = '0,00';
        campo.setAttribute('aria-label', `Custo de ${item.nome}`);
        campo.addEventListener('change', () => {
          Store.definirCusto(item.nome, paraCentavos(campo.value));
          renderTudo();
        });
        linha.appendChild(campo);

        alvo.appendChild(linha);
      }
    }
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

      const clienteId = formVenda.elements.clienteId.value || null;
      const cliente = clienteId ? Store.dados.clientes.find((c) => c.id === clienteId) : null;

      Store.addVenda({
        data: formVenda.elements.data.value,
        clienteId,
        clienteNome: cliente ? cliente.nome : '',
        itens,
        taxaEntrega: paraCentavos(formVenda.elements.taxaEntrega.value),
        desconto: paraCentavos(formVenda.elements.desconto.value),
        pagamento: formVenda.elements.pagamento.value,
        obs: formVenda.elements.obs.value.trim(),
      });

      formVenda.reset();
      formVenda.elements.data.value = Store.hojeISO();
      document.querySelectorAll('.item-venda__qtd').forEach((i) => { i.value = '0'; });
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

      const jaExiste = Store.acharClientePorTelefone(whatsapp);
      if (whatsapp && jaExiste) {
        return erro('erro-cliente', `Esse WhatsApp já está cadastrado em ${jaExiste.nome}.`);
      }
      limparErro('erro-cliente');

      Store.addCliente({
        nome,
        whatsapp,
        endereco: formCliente.elements.endereco.value.trim(),
        obs: formCliente.elements.obs.value.trim(),
      });

      formCliente.reset();
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
    configurarBackup();

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
