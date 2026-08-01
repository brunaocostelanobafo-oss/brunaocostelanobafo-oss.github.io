/*
 * Painel administrativo — camada de dados e contas
 * ------------------------------------------------
 * Guarda tudo no localStorage do navegador e faz os cálculos do período.
 *
 * IMPORTANTE: os dados ficam NESTE navegador, neste computador. Não há
 * servidor. Use "Backup" para exportar o arquivo e levar para outro
 * aparelho — e faça isso com frequência.
 *
 * Todo valor em dinheiro é guardado em CENTAVOS (inteiro).
 */

const Store = (function () {
  'use strict';

  const CHAVE = 'brunao:admin';
  const VERSAO = 1;

  /* Categorias de saída marcadas com estoque:true são compra de mercadoria.
     Elas saem do caixa, mas NÃO entram como despesa operacional no
     resultado — o custo da mercadoria chega ao resultado pelo CMV,
     na hora em que o produto é vendido. Contar nos dois lugares
     dobraria o custo. */
  const CATEGORIAS_SAIDA = [
    { nome: 'Insumos / Mercadoria', estoque: true },
    { nome: 'Gás e lenha', estoque: false },
    { nome: 'Embalagem', estoque: false },
    { nome: 'Combustível / Entrega', estoque: false },
    { nome: 'Marketing', estoque: false },
    { nome: 'Taxas e impostos', estoque: false },
    { nome: 'Aluguel e contas', estoque: false },
    { nome: 'Salários e ajudantes', estoque: false },
    { nome: 'Retirada do dono', estoque: false },
    { nome: 'Outros', estoque: false },
  ];

  const CATEGORIAS_ENTRADA = ['Saldo inicial', 'Aporte do dono', 'Empréstimo', 'Outros'];

  const VAZIO = {
    versao: VERSAO,
    clientes: [],
    vendas: [],
    lancamentos: [],
    insumos: [],
    movimentos: [],
    custos: {}, // { 'Nome do produto': custoEmCentavos } — usado quando não há ficha

    /* Ficha técnica: o que entra em cada produto.
       { 'Costela no Bafo — 1kg': {
           componentes: [{ insumoId, quantidade, aplicarRendimento }],
           extras: [{ nome, valor }],
       } } */
    fichas: {},

    config: {
      /* Entre a carne crua e o que chega ao cliente se perde peso: água
         no forno, osso, aparas e gordura. Para entregar 1kg pronto são
         precisos 2kg de carne crua — número fechado com a produção real
         de julho de 2026, não estimado.

         O componente marcado com `aplicarRendimento` é multiplicado por
         este fator, tanto no custo quanto na baixa de estoque. Vale para
         qualquer corte. */
      rendimento: 2.0,
    },
  };

  let dados = carregar();

  /* A migração só vale se ficar gravada. Sem isto ela se repetiria a
     cada abertura e, no dia seguinte, marcaria como entregue um pedido
     atrasado que ainda estava na fila. */
  if (dados._precisaSalvar) {
    delete dados._precisaSalvar;
    salvar();
  }

  // ------------------------------------------------------------ persistência

  function carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return estruturaNova();
      const salvo = JSON.parse(bruto);
      return migrar(Object.assign(estruturaNova(), salvo));
    } catch {
      return estruturaNova();
    }
  }

  /**
   * Conserta dados gravados por versões anteriores.
   *
   * As primeiras importações jogavam "Pago pelo site" e o link do
   * comprovante dentro das observações, que hoje guardam só o que o
   * cliente escreveu. Sem isso, vendas antigas continuariam imprimindo
   * esse texto no ticket de expedição para sempre.
   */
  function migrar(base) {
    /* Pedido entregue passou a ser marcado à mão, mas o histórico já
       tinha 42 vendas de julho. Sem esta passada única, todas elas
       apareceriam na fila de "a entregar" para sempre.
       Roda uma vez só: depois disso, um pedido de ontem que ficou para
       trás continua na fila, que é onde ele tem que estar. */
    if (!base.config.migrouEntregues) {
      const hoje = hojeISO();
      for (const venda of base.vendas) {
        if (venda.entregue === undefined) venda.entregue = dataDeEntrega(venda) < hoje;
      }
      base.config.migrouEntregues = true;
      base._precisaSalvar = true;
    }

    /* A primeira versão da fila lia a data errada nas vendas do site e
       deu por entregues pedidos que ainda nem tinham saído. Esta passada
       devolve à fila o que tem entrega marcada para hoje ou depois.
       `entregueEm` só existe em quem foi marcado à mão, então quem você
       mesma deu por entregue não é mexido. */
    if (!base.config.corrigiuFilaEntrega) {
      const hoje = hojeISO();
      for (const venda of base.vendas) {
        if (venda.entregue && !venda.entregueEm && dataDeEntrega(venda) >= hoje) {
          venda.entregue = false;
        }
      }
      base.config.corrigiuFilaEntrega = true;
      base._precisaSalvar = true;
    }

    for (const venda of base.vendas) {
      if (!venda.obs) continue;

      const link = venda.obs.match(/https?:\/\/\S+/);
      if (link && !venda.recibo) venda.recibo = link[0];

      const limpo = venda.obs
        .replace(/https?:\/\/\S+/g, '')
        .replace(/comprovante:/gi, '')
        .replace(/pago pelo site/gi, '')
        .replace(/\s*·\s*/g, ' · ')
        .replace(/^[\s·]+|[\s·]+$/g, '')
        .trim();

      venda.obs = limpo;
    }
    return base;
  }

  function estruturaNova() {
    return JSON.parse(JSON.stringify(VAZIO));
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(dados));
      return true;
    } catch (erro) {
      console.error('Não foi possível salvar:', erro);
      return false;
    }
  }

  /* ------------------------------------------------------------------
   * Painel aberto em mais de uma aba
   *
   * Cada aba carregava os dados na abertura e guardava a própria cópia.
   * A última a gravar escrevia tudo por cima — e o que a outra tinha
   * lançado desaparecia. Foi assim que vendas sumiram do painel mesmo
   * continuando na planilha.
   *
   * O navegador avisa as OUTRAS abas quando o armazenamento muda. Ao
   * receber esse aviso, a aba recarrega em vez de seguir com a cópia
   * velha, e a tela é redesenhada.
   * ---------------------------------------------------------------- */
  let aoMudarEmOutraAba = null;

  window.addEventListener('storage', (evento) => {
    if (evento.key !== CHAVE || evento.newValue === null) return;

    dados = carregar();
    delete dados._precisaSalvar;   // quem gravou já cuidou disso
    if (aoMudarEmOutraAba) aoMudarEmOutraAba();
  });

  function observarOutrasAbas(callback) {
    aoMudarEmOutraAba = callback;
  }

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ------------------------------------------------------------------ datas

  function hojeISO() {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  /** Lista de datas ISO do período, da mais antiga para a mais nova. */
  function diasDoPeriodo(periodo) {
    const fim = new Date();
    const dias = { hoje: 1, '7': 7, '30': 30, '90': 90 }[periodo];
    if (!dias) return null; // 'tudo'

    const lista = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() - i);
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const dia = String(d.getDate()).padStart(2, '0');
      lista.push(`${d.getFullYear()}-${mes}-${dia}`);
    }
    return lista;
  }

  function dentroDoPeriodo(dataISO, periodo) {
    const dias = diasDoPeriodo(periodo);
    if (!dias) return true;
    return dataISO >= dias[0] && dataISO <= dias[dias.length - 1];
  }

  // ----------------------------------------------------------------- vendas

  /** Total de uma venda: itens + taxa de entrega − desconto. */
  function totalVenda(venda) {
    const itens = venda.itens.reduce((s, i) => s + i.preco * i.qtd, 0);
    return itens + (venda.taxaEntrega || 0) - (venda.desconto || 0);
  }

  /**
   * Custo do item dentro de uma venda.
   *
   * A venda guarda o custo do produto no momento em que foi lançada — é
   * assim que se preserva o histórico quando o preço do insumo muda depois.
   *
   * Mas quem lança a venda antes de cadastrar o custo grava zero, e esse
   * zero congelaria o CMV daquela venda para sempre. Então, quando não há
   * custo gravado, vale o custo cadastrado hoje.
   */
  function custoDoItem(item) {
    return item.custo || custoDe(item.nome);
  }

  /** Custo da mercadoria daquela venda. */
  function custoVenda(venda) {
    return venda.itens.reduce((s, i) => s + custoDoItem(i) * i.qtd, 0);
  }

  function addVenda(venda) {
    venda.id = id();
    dados.vendas.push(venda);
    baixarEstoquePorVenda(venda);
    salvar();
    return venda;
  }

  function removerVenda(idVenda) {
    devolverEstoqueDaVenda(idVenda);
    dados.vendas = dados.vendas.filter((v) => v.id !== idVenda);
    salvar();
  }

  /**
   * Substitui uma venda pelos dados corrigidos.
   *
   * O estoque é desfeito e refeito: devolve o que a versão antiga tinha
   * baixado e baixa de novo pela nova lista de itens. Sem isso, corrigir
   * um pedido deixaria a despensa torta — tirando duas vezes o que só
   * saiu uma.
   *
   * O que veio do site (número do pedido, origem, comprovante) é
   * preservado: você está corrigindo o pedido, não criando outro.
   */
  function atualizarVenda(idVenda, campos) {
    const indice = dados.vendas.findIndex((v) => v.id === idVenda);
    if (indice === -1) return null;

    const antiga = dados.vendas[indice];
    devolverEstoqueDaVenda(idVenda);

    const nova = {
      ...antiga,
      ...campos,
      id: antiga.id,
      orderNsu: antiga.orderNsu,
      origem: antiga.origem,
      recibo: antiga.recibo,
      editadaEm: new Date().toISOString(),
    };

    dados.vendas[indice] = nova;
    baixarEstoquePorVenda(nova);
    salvar();
    return nova;
  }

  /**
   * O pedido pago pelo site já foi trazido para cá?
   *
   * O número do pedido (order_nsu) é gerado uma vez e nunca se repete,
   * então é ele que impede a mesma venda de entrar duas vezes quando
   * você aperta "Puxar vendas" de novo.
   */
  /**
   * A data que manda na fila é a da ENTREGA, nunca a do pedido.
   *
   * As vendas trazidas do site antes de existir o campo de data guardam
   * a entrega só por extenso ("domingo, 02/08"). Cair direto na data do
   * pedido fazia um pedido de sexta para entregar no domingo parecer
   * vencido — e a fila o escondia como se já tivesse saído.
   */
  function dataDeEntrega(venda) {
    if (venda.entregaISO) return venda.entregaISO;

    /* A expressão fica aqui dentro de propósito: esta função é chamada
       pela migração, que roda enquanto o módulo ainda está carregando.
       Uma constante declarada mais abaixo no arquivo ainda não existe
       nesse momento, e a leitura inteira falhava — o painel abria vazio. */
    const m = String(venda.entregaTexto || '').match(/(\d{2})\/(\d{2})/);
    if (m && venda.data) {
      const [, dia, mes] = m;
      let ano = Number(String(venda.data).slice(0, 4));
      // Pedido em dezembro para entregar em janeiro vira o ano.
      if (mes < String(venda.data).slice(5, 7)) ano++;
      return `${ano}-${mes}-${dia}`;
    }

    return venda.data;
  }

  function marcarEntregue(idVenda, entregue) {
    const v = dados.vendas.find((x) => x.id === idVenda);
    if (!v) return null;

    v.entregue = !!entregue;
    v.entregueEm = entregue ? hojeISO() : '';
    salvar();
    return v;
  }

  function vendaJaImportada(orderNsu) {
    if (!orderNsu) return false;
    return dados.vendas.some((v) => v.orderNsu === orderNsu);
  }

  // ------------------------------------------------------------- lançamentos

  function addLancamento(lanc) {
    lanc.id = id();
    dados.lancamentos.push(lanc);
    salvar();
    return lanc;
  }

  function removerLancamento(idLanc) {
    dados.lancamentos = dados.lancamentos.filter((l) => l.id !== idLanc);
    salvar();
  }

  function categoriaEhEstoque(nome) {
    const c = CATEGORIAS_SAIDA.find((x) => x.nome === nome);
    return c ? c.estoque : false;
  }

  // ---------------------------------------------------------------- clientes

  function addCliente(cliente) {
    cliente.id = id();
    cliente.criadoEm = hojeISO();
    dados.clientes.push(cliente);
    salvar();
    return cliente;
  }

  function atualizarCliente(idCliente, campos) {
    const c = dados.clientes.find((x) => x.id === idCliente);
    if (!c) return null;

    Object.assign(c, campos);

    /* A venda guarda o nome do cliente junto, para continuar legível se
       o cadastro for apagado. Corrigir o nome aqui sem corrigir lá
       deixaria a lista de vendas mostrando o nome antigo para sempre. */
    for (const venda of dados.vendas) {
      if (venda.clienteId === idCliente) venda.clienteNome = c.nome;
    }

    salvar();
    return c;
  }

  function removerCliente(idCliente) {
    dados.clientes = dados.clientes.filter((c) => c.id !== idCliente);
    // As vendas ficam, mas perdem o vínculo — o nome já está gravado nelas.
    for (const v of dados.vendas) if (v.clienteId === idCliente) v.clienteId = null;
    salvar();
  }

  /** Só dígitos, para comparar WhatsApp sem depender da formatação. */
  function normalizarTelefone(tel) {
    return (tel || '').replace(/\D/g, '');
  }

  function acharClientePorTelefone(tel) {
    const alvo = normalizarTelefone(tel);
    if (!alvo) return null;
    return dados.clientes.find((c) => normalizarTelefone(c.whatsapp) === alvo) || null;
  }

  /** Histórico consolidado de um cliente: quanto comprou, quando, quantas vezes. */
  function resumoCliente(idCliente) {
    const vendas = dados.vendas
      .filter((v) => v.clienteId === idCliente)
      .sort((a, b) => b.data.localeCompare(a.data));

    const total = vendas.reduce((s, v) => s + totalVenda(v), 0);
    return {
      pedidos: vendas.length,
      total,
      ticketMedio: vendas.length ? Math.round(total / vendas.length) : 0,
      ultimaCompra: vendas.length ? vendas[0].data : null,
      vendas,
    };
  }

  // ---------------------------------------------------------------- estoque

  function addInsumo(insumo) {
    insumo.id = id();
    insumo.quantidade = insumo.quantidade || 0;
    dados.insumos.push(insumo);
    salvar();
    return insumo;
  }

  function removerInsumo(idInsumo) {
    dados.insumos = dados.insumos.filter((i) => i.id !== idInsumo);
    dados.movimentos = dados.movimentos.filter((m) => m.insumoId !== idInsumo);
    salvar();
  }

  /**
   * Entrada soma no estoque, saída e consumo subtraem. O saldo nunca
   * fica negativo.
   *
   * 'consumo' é o que a casa comeu ou deu de cortesia. Sai do estoque
   * como qualquer saída, mas é marcado à parte porque o custo dele
   * precisa aparecer no resultado: é carne comprada que não virou
   * receita, e sem essa linha o lucro sairia inflado.
   */
  function movimentarEstoque(mov) {
    const insumo = dados.insumos.find((i) => i.id === mov.insumoId);
    if (!insumo) return null;

    mov.id = id();
    dados.movimentos.push(mov);

    const delta = mov.tipo === 'entrada' ? mov.quantidade : -mov.quantidade;
    insumo.quantidade = Math.max(0, Number((insumo.quantidade + delta).toFixed(3)));

    // A entrada com preço atualiza o custo unitário de referência.
    if (mov.tipo === 'entrada' && mov.custoUnitario) insumo.custoUnitario = mov.custoUnitario;

    salvar();
    return mov;
  }

  function insumosEmAlerta() {
    return dados.insumos.filter((i) => i.minimo > 0 && i.quantidade <= i.minimo);
  }

  function valorDoEstoque() {
    return dados.insumos.reduce((s, i) => s + Math.round(i.quantidade * (i.custoUnitario || 0)), 0);
  }

  // ------------------------------------------------------------------ custos

  function definirCusto(produto, custo) {
    dados.custos[produto] = custo;
    salvar();
  }

  /**
   * Quanto do insumo sai do estoque por unidade do produto.
   *
   * A ficha é escrita em peso PRONTO, que é o que o cliente recebe. Como
   * a carne perde peso ao assar, o componente marcado com
   * `aplicarRendimento` é multiplicado pelo fator — 1kg pronto consome
   * 1,7kg cru. Embalagem e tempero não perdem peso, então ficam de fora.
   */
  function quantidadeBruta(componente) {
    const fator = componente.aplicarRendimento ? (dados.config.rendimento || 1) : 1;
    return Number((componente.quantidade * fator).toFixed(4));
  }

  function temFicha(produto) {
    const f = dados.fichas[produto];
    return !!(f && ((f.componentes && f.componentes.length) || (f.extras && f.extras.length)));
  }

  /** Custo calculado pela ficha, ou null se o produto não tem ficha. */
  function custoDaFicha(produto) {
    if (!temFicha(produto)) return null;
    const ficha = dados.fichas[produto];
    let total = 0;

    for (const c of (ficha.componentes || [])) {
      const insumo = dados.insumos.find((i) => i.id === c.insumoId);
      if (!insumo) continue;
      total += Math.round(quantidadeBruta(c) * (insumo.custoUnitario || 0));
    }
    for (const e of (ficha.extras || [])) total += e.valor || 0;

    return total;
  }

  /**
   * A ficha manda quando existe. O valor digitado à mão continua valendo
   * para produto sem ficha, para não obrigar você a montar ficha de tudo
   * de uma vez.
   */
  function custoDe(produto) {
    const daFicha = custoDaFicha(produto);
    if (daFicha !== null && daFicha > 0) return daFicha;
    return dados.custos[produto] || 0;
  }

  function salvarFicha(produto, ficha) {
    dados.fichas[produto] = ficha;
    salvar();
  }

  function fichaDe(produto) {
    return dados.fichas[produto] || { componentes: [], extras: [] };
  }

  function definirRendimento(fator) {
    dados.config.rendimento = fator;
    salvar();
  }

  /** Quantos produtos do cardápio ainda estão sem custo — por ficha ou à mão. */
  function produtosSemCusto() {
    if (typeof CARDAPIO === 'undefined') return [];
    return CARDAPIO.flatMap((c) => c.itens)
      .filter((item) => !custoDe(item.nome))
      .map((item) => item.nome);
  }

  // ------------------------------------------- baixa de estoque pela venda

  /**
   * Tira do estoque o que a venda consumiu, seguindo a ficha de cada item.
   * Produto sem ficha não baixa nada — não há como adivinhar o que ele leva.
   */
  function baixarEstoquePorVenda(venda) {
    for (const item of venda.itens) {
      if (!temFicha(item.nome)) continue;

      for (const c of (dados.fichas[item.nome].componentes || [])) {
        const insumo = dados.insumos.find((i) => i.id === c.insumoId);
        if (!insumo) continue;

        const consumo = Number((quantidadeBruta(c) * item.qtd).toFixed(3));
        insumo.quantidade = Math.max(0, Number((insumo.quantidade - consumo).toFixed(3)));

        dados.movimentos.push({
          id: id(),
          data: venda.data,
          insumoId: insumo.id,
          tipo: 'saida',
          quantidade: consumo,
          custoUnitario: insumo.custoUnitario,
          obs: `Baixa automática — ${item.qtd}x ${item.nome}`,
          vendaId: venda.id,
        });
      }
    }
  }

  /** Excluir uma venda devolve ao estoque o que ela tinha baixado. */
  function devolverEstoqueDaVenda(idVenda) {
    const doVenda = dados.movimentos.filter((m) => m.vendaId === idVenda);

    for (const mov of doVenda) {
      const insumo = dados.insumos.find((i) => i.id === mov.insumoId);
      if (insumo) {
        insumo.quantidade = Number((insumo.quantidade + mov.quantidade).toFixed(3));
      }
    }
    dados.movimentos = dados.movimentos.filter((m) => m.vendaId !== idVenda);
  }

  // ---------------------------------------------------------------- relatório

  /**
   * Resultado do período.
   *
   * Resultado (DRE):
   *   Receita − CMV = Lucro bruto
   *   Lucro bruto − Despesas operacionais = Lucro líquido
   *
   * Caixa (dinheiro que entrou e saiu de fato):
   *   Entradas (vendas + aportes) − Saídas (todas, inclusive mercadoria)
   *
   * A compra de mercadoria aparece só no caixa; no resultado ela chega
   * pelo CMV, quando o produto é vendido.
   */
  function relatorio(periodo) {
    const vendas = dados.vendas.filter((v) => dentroDoPeriodo(v.data, periodo));
    const lancamentos = dados.lancamentos.filter((l) => dentroDoPeriodo(l.data, periodo));

    const receita = vendas.reduce((s, v) => s + totalVenda(v), 0);
    const cmv = vendas.reduce((s, v) => s + custoVenda(v), 0);
    const lucroBruto = receita - cmv;

    const saidas = lancamentos.filter((l) => l.tipo === 'saida');
    const despesasOperacionais = saidas
      .filter((l) => !categoriaEhEstoque(l.categoria))
      .reduce((s, l) => s + l.valor, 0);
    const compraMercadoria = saidas
      .filter((l) => categoriaEhEstoque(l.categoria))
      .reduce((s, l) => s + l.valor, 0);

    const outrasEntradas = lancamentos
      .filter((l) => l.tipo === 'entrada')
      .reduce((s, l) => s + l.valor, 0);

    /* Consumo próprio e cortesias: carne que saiu do estoque sem virar
       receita. O dinheiro já saiu na compra, então não entra no caixa de
       novo — mas o custo precisa aparecer no resultado, senão o lucro
       fica maior do que foi. */
    const consumoProprio = dados.movimentos
      .filter((m) => m.tipo === 'consumo' && dentroDoPeriodo(m.data, periodo))
      .reduce((s, m) => s + Math.round(m.quantidade * (m.custoUnitario || 0)), 0);

    const lucroLiquido = lucroBruto - despesasOperacionais - consumoProprio;
    const totalSaidas = saidas.reduce((s, l) => s + l.valor, 0);

    return {
      periodo,
      vendas,
      lancamentos,
      receita,
      cmv,
      cmvPercent: receita ? (cmv / receita) * 100 : 0,
      lucroBruto,
      margemBruta: receita ? (lucroBruto / receita) * 100 : 0,
      despesasOperacionais,
      compraMercadoria,
      consumoProprio,
      lucroLiquido,
      margemLiquida: receita ? (lucroLiquido / receita) * 100 : 0,
      pedidos: vendas.length,
      ticketMedio: vendas.length ? Math.round(receita / vendas.length) : 0,
      caixaEntradas: receita + outrasEntradas,
      caixaSaidas: totalSaidas,
      caixaSaldo: receita + outrasEntradas - totalSaidas,
    };
  }

  /**
   * A segunda-feira da semana de uma data — a chave que agrupa a
   * operação. Uma operação é a semana inteira: as compras e o preparo de
   * segunda a sexta e as entregas do fim de semana. Agrupar só pelo dia
   * da entrega jogaria a carne comprada na quinta para fora da conta que
   * ela pagou.
   */
  function segundaDaSemana(iso) {
    const [a, m, d] = String(iso).split('-').map(Number);
    if (!a || !m || !d) return '';

    const data = new Date(a, m - 1, d);
    const recuo = data.getDay() === 0 ? 6 : data.getDay() - 1;
    data.setDate(data.getDate() - recuo);

    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
  }

  /** Resultado fechado de cada operação, da mais recente para a mais antiga. */
  function relatorioPorOperacao() {
    const semanas = new Map();

    const daSemana = (chave) => {
      if (!semanas.has(chave)) {
        semanas.set(chave, {
          semana: chave, receita: 0, cmv: 0, despesas: 0,
          consumoProprio: 0, pedidos: 0, itens: 0, datasEntrega: new Set(),
        });
      }
      return semanas.get(chave);
    };

    for (const venda of dados.vendas) {
      const entrega = dataDeEntrega(venda);
      const s = daSemana(segundaDaSemana(entrega));
      s.receita += totalVenda(venda);
      s.cmv += custoVenda(venda);
      s.pedidos++;
      s.itens += venda.itens.reduce((soma, i) => soma + i.qtd, 0);
      s.datasEntrega.add(entrega);
    }

    for (const l of dados.lancamentos) {
      if (l.tipo !== 'saida' || categoriaEhEstoque(l.categoria)) continue;
      daSemana(segundaDaSemana(l.data)).despesas += l.valor;
    }

    for (const mov of dados.movimentos) {
      if (mov.tipo !== 'consumo') continue;
      daSemana(segundaDaSemana(mov.data)).consumoProprio +=
        Math.round(mov.quantidade * (mov.custoUnitario || 0));
    }

    return [...semanas.values()]
      .map((s) => {
        const lucroBruto = s.receita - s.cmv;
        const lucroLiquido = lucroBruto - s.despesas - s.consumoProprio;
        return {
          ...s,
          datasEntrega: [...s.datasEntrega].sort(),
          lucroBruto,
          lucroLiquido,
          margem: s.receita ? (lucroLiquido / s.receita) * 100 : 0,
          ticketMedio: s.pedidos ? Math.round(s.receita / s.pedidos) : 0,
        };
      })
      .sort((a, b) => b.semana.localeCompare(a.semana));
  }

  /** Receita por dia do período — alimenta o gráfico de barras. */
  function receitaPorDia(periodo) {
    const dias = diasDoPeriodo(periodo);
    const vendas = dados.vendas.filter((v) => dentroDoPeriodo(v.data, periodo));

    if (!dias) {
      const mapa = new Map();
      for (const v of vendas) mapa.set(v.data, (mapa.get(v.data) || 0) + totalVenda(v));
      return [...mapa.entries()].sort().map(([data, valor]) => ({ data, valor }));
    }

    return dias.map((data) => ({
      data,
      valor: vendas.filter((v) => v.data === data).reduce((s, v) => s + totalVenda(v), 0),
    }));
  }

  /** Produtos ordenados por receita — alimenta o gráfico de mix. */
  function rankingProdutos(periodo) {
    const vendas = dados.vendas.filter((v) => dentroDoPeriodo(v.data, periodo));
    const mapa = new Map();

    for (const venda of vendas) {
      for (const item of venda.itens) {
        const atual = mapa.get(item.nome) || { nome: item.nome, qtd: 0, receita: 0, custo: 0 };
        atual.qtd += item.qtd;
        atual.receita += item.preco * item.qtd;
        atual.custo += custoDoItem(item) * item.qtd;
        mapa.set(item.nome, atual);
      }
    }

    return [...mapa.values()].sort((a, b) => b.receita - a.receita);
  }

  /** Clientes ordenados por quanto já compraram. */
  function rankingClientes() {
    return dados.clientes
      .map((c) => ({ ...c, ...resumoCliente(c.id) }))
      .sort((a, b) => b.total - a.total);
  }

  // ------------------------------------------------------------------ backup

  function exportar() {
    return JSON.stringify({ ...dados, exportadoEm: new Date().toISOString() }, null, 2);
  }

  function importar(texto) {
    const novo = JSON.parse(texto);
    if (!novo || typeof novo !== 'object' || !Array.isArray(novo.vendas)) {
      throw new Error('Arquivo não parece um backup do painel.');
    }
    dados = Object.assign(estruturaNova(), novo);
    salvar();
    return dados;
  }

  function apagarTudo() {
    dados = estruturaNova();
    salvar();
  }

  // ------------------------------------------------------------------ público

  return {
    CATEGORIAS_SAIDA,
    CATEGORIAS_ENTRADA,
    get dados() { return dados; },
    hojeISO,
    totalVenda,
    custoVenda,
    addVenda, removerVenda, atualizarVenda, vendaJaImportada,
    marcarEntregue, dataDeEntrega, observarOutrasAbas,
    addLancamento, removerLancamento, categoriaEhEstoque,
    addCliente, atualizarCliente, removerCliente,
    acharClientePorTelefone, resumoCliente, normalizarTelefone,
    addInsumo, removerInsumo, movimentarEstoque, insumosEmAlerta, valorDoEstoque,
    definirCusto, custoDe, produtosSemCusto,
    temFicha, custoDaFicha, salvarFicha, fichaDe, quantidadeBruta, definirRendimento,
    relatorio, receitaPorDia, rankingProdutos, rankingClientes,
    relatorioPorOperacao, segundaDaSemana,
    exportar, importar, apagarTudo,
  };
})();
