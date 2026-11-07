/* Motor 2,5D — Brunão fim de ano.
   As peças (fotos recortadas) ficam num palco preso à tela; a rolagem do bloco .filme (3 atos)
   decide onde cada peça está. Quadros-chave: [progresso, x, y, largura, giro, opacidade],
   com x e largura em fração da largura da tela e y em fração da altura.
   No Ato 2 as cumbucas giram em volta da costela (órbita) e param embaixo dela. */
(function () {
  const CFG = window.PAGINA || {};
  document.documentElement.classList.remove('sem-js');

  // p: 0 = início do Ato 1 · ~0,33 = Ato 2 no topo · ~0,85 = Ato 3 no topo · 1 = fim do Ato 3
  const BOWLS = ['arroz', 'mandioca', 'farofa', 'creme'];
  const ORBITA = { arroz: [.36, .45], mandioca: [.41, .50], farofa: [.46, .55], creme: [.51, .60] };
  const TEMPOS = [.40, .47, .54];
  const SEGURA = .72; // até aqui tudo parado no Ato 2 (tempo de leitura)

  function montar(cel) {
    const D = cel ? {
      costela: [[0, .56, .27, 1.20, -7, 1], [.16, .53, .27, 1.26, -4, 1], [.33, .50, .12, .54, 0, 1], [SEGURA, .50, .12, .54, 3, 1], [.83, .50, .15, .50, 0, 1], [.88, .50, .175, .50, 0, 1], [1, .50, .175, .50, 0, 1]],
      tabua: [[0, .5, 1.3, .90, 0, 0], [.74, .5, 1.3, .90, 0, 0], [.84, .5, .22, .90, 0, 1], [1, .5, .22, .90, 0, 1]],
      ato2: { arroz: [.13, .255, .21], mandioca: [.375, .275, .21], farofa: [.625, .275, .21], creme: [.87, .255, .20] },
      ato3: { arroz: [.19, .265, .18], mandioca: [.40, .285, .18], farofa: [.60, .285, .18], creme: [.81, .265, .17] },
    } : {
      costela: [[0, .79, .56, .58, -7, 1], [.16, .77, .55, .62, -4, 1], [.33, .27, .34, .40, 0, 1], [SEGURA, .27, .34, .40, 3, 1], [.83, .69, .47, .36, 0, 1], [.88, .69, .51, .36, 0, 1], [1, .69, .51, .36, 0, 1]],
      tabua: [[0, .69, 1.3, .58, 0, 0], [.74, .69, 1.3, .58, 0, 0], [.84, .69, .64, .58, 0, 1], [1, .69, .64, .58, 0, 1]],
      ato2: { arroz: [.085, .56, .155], mandioca: [.17, .77, .16], farofa: [.305, .80, .155], creme: [.42, .70, .145] },
      ato3: { arroz: [.495, .74, .12], mandioca: [.625, .78, .125], farofa: [.765, .78, .12], creme: [.89, .74, .115] },
    };
    BOWLS.forEach((n, i) => {
      const a = D.ato2[n], b = D.ato3[n], f = ORBITA[n][1];
      D[n] = [[f, a[0], a[1], a[2], 0, 1], [SEGURA, a[0], a[1], a[2], 0, 1], [.82 + i * .008, b[0], b[1] - .07, b[2], 0, 1], [.88, b[0], b[1], b[2], 0, 1], [1, b[0], b[1], b[2], 0, 1]];
    });
    return D;
  }
  const PC = montar(false);
  let CEL = montar(true);

  // ---------- celular: composição calculada pelo tamanho real do texto de cada ato ----------
  // As peças ficam logo acima da copy, com o mesmo respiro em todas as seções; o grupo (peças + texto)
  // fica centralizado na tela. Se não couber, as peças diminuem (nunca passam por cima do texto).
  const AR = { costela: .54, tabua: .40, bowl: .70 };
  function compor(vw, vh) {
    const atos = [...document.querySelectorAll('.ato')];
    const alto = (w, ar) => w * vw * ar / vh;               // altura (fração da tela) de uma peça de largura w
    const TOPO = 64 / vh, BASE = 24 / vh, GAP = 30 / vh;     // barra do topo, margem de baixo, respiro peça–texto
    const livre = 1 - TOPO - BASE;
    const res = [];
    atos.forEach((ato, i) => {
      const tx = ato.querySelector('.tx'), q = ato.querySelector('.quadro');
      q.style.paddingBottom = '0px';
      const th = tx.offsetHeight / vh;
      let objH, k = 1;
      const base = i === 0 ? { cw: 1.0 } : i === 1 ? { cw: .56, bw: .21 } : { tw: .88, cw: .50, bw: .18 };
      const altura = (k) => {
        if (i === 0) return alto(base.cw * k, AR.costela);
        if (i === 1) return alto(base.cw * k, AR.costela) + alto(base.bw * k, AR.bowl) * .92;
        const ch = alto(base.cw * k, AR.costela), tbh = alto(base.tw * k, AR.tabua), bh = alto(base.bw * k, AR.bowl);
        return ch / 2 + ch * .30 + tbh * .22 + bh / 2 + ch / 2;
      };
      objH = altura(1);
      if (objH + GAP + th > livre) { k = Math.max(.55, (livre - GAP - th) / objH); objH = altura(k); }
      const total = objH + GAP + th, topo = TOPO + Math.max(0, (livre - total) / 2);
      q.style.paddingBottom = Math.max(BASE, 1 - (topo + total)) * vh + 'px';
      res.push({ k, topo, base });
    });
    const [a1, a2, a3] = res, L = {};
    // Ato 1
    const c1w = a1.base.cw * a1.k; L.c1 = [.53, a1.topo + alto(c1w, AR.costela) / 2, c1w];
    // Ato 2
    const c2w = a2.base.cw * a2.k, b2w = a2.base.bw * a2.k, c2h = alto(c2w, AR.costela), b2h = alto(b2w, AR.bowl);
    L.c2 = [.50, a2.topo + c2h / 2, c2w];
    const y2 = a2.topo + c2h + b2h * .42;
    L.ato2 = { arroz: [.13, y2 - .008, b2w], mandioca: [.375, y2, b2w], farofa: [.625, y2, b2w], creme: [.87, y2 - .008, b2w * .96] };
    // Ato 3
    const c3w = a3.base.cw * a3.k, t3w = a3.base.tw * a3.k, b3w = a3.base.bw * a3.k;
    const c3h = alto(c3w, AR.costela), t3h = alto(t3w, AR.tabua);
    const c3y = a3.topo + c3h / 2, t3y = c3y + c3h * .30, y3 = t3y + t3h * .22;
    L.c3 = [.50, c3y, c3w]; L.t3 = [.50, t3y, t3w];
    L.ato3 = { arroz: [.5 - t3w * .36, y3 - .006, b3w], mandioca: [.5 - t3w * .12, y3 + .006, b3w], farofa: [.5 + t3w * .12, y3 + .006, b3w], creme: [.5 + t3w * .36, y3 - .006, b3w * .95] };
    return L;
  }
  function montarCel(L) {
    const D = {
      costela: [[0, L.c1[0] + .03, L.c1[1], L.c1[2], -7, 1], [.16, L.c1[0], L.c1[1], L.c1[2] * 1.04, -4, 1], [.33, L.c2[0], L.c2[1], L.c2[2], 0, 1], [SEGURA, L.c2[0], L.c2[1], L.c2[2], 3, 1], [.80, L.c3[0], L.c3[1] - .025, L.c3[2], 0, 1], [.84, L.c3[0], L.c3[1], L.c3[2], 0, 1], [1, L.c3[0], L.c3[1], L.c3[2], 0, 1]],
      tabua: [[0, .5, 1.3, L.t3[2], 0, 0], [.72, .5, 1.3, L.t3[2], 0, 0], [.81, .5, L.t3[1], L.t3[2], 0, 1], [1, .5, L.t3[1], L.t3[2], 0, 1]],
    };
    BOWLS.forEach((n, i) => {
      const a = L.ato2[n], b = L.ato3[n], f = ORBITA[n][1];
      D[n] = [[f, a[0], a[1], a[2], 0, 1], [SEGURA, a[0], a[1], a[2], 0, 1], [.79 + i * .006, b[0], b[1] - .05, b[2], 0, 1], [.84, b[0], b[1], b[2], 0, 1], [1, b[0], b[1], b[2], 0, 1]];
    });
    return D;
  }

  const suave = t => t * t * (3 - 2 * t);
  function quadro(kf, p) {
    if (p <= kf[0][0]) return kf[0];
    for (let i = 1; i < kf.length; i++) {
      const a = kf[i - 1], b = kf[i];
      if (p <= b[0]) { const t = suave((p - a[0]) / (b[0] - a[0] || 1)); return a.map((v, j) => j === 0 ? p : v + (b[j] - v) * t); }
    }
    return kf[kf.length - 1];
  }

  // ---------- palco ----------
  const filme = document.querySelector('.filme');
  const palco = document.querySelector('.palco');
  const pecas = {};
  palco.querySelectorAll('img[data-peca]').forEach(img => { pecas[img.dataset.peca] = img; });
  const sombra = palco.querySelector('.sombra');
  const tempos = document.querySelectorAll('.tempos div');
  const topo = document.querySelector('.topo');
  let vw = innerWidth, vh = innerHeight, cel = vw < 768, topoFilme = 0, alturaFilme = 1;

  let larguraMedida = 0;
  function medir(forcar) {
    const nvw = innerWidth;
    // no celular a barra do navegador some e volta na rolagem: só recompõe quando a largura muda
    if (!forcar && cel && nvw === larguraMedida) { topoFilme = filme.getBoundingClientRect().top + scrollY; alturaFilme = Math.max(1, filme.offsetHeight - vh); return; }
    larguraMedida = nvw; vw = nvw; vh = palco.clientHeight || innerHeight; cel = vw < 768;
    if (cel) CEL = montarCel(compor(vw, vh));
    else document.querySelectorAll('.ato .quadro').forEach(q => { q.style.paddingBottom = ''; });
    topoFilme = filme.getBoundingClientRect().top + scrollY; alturaFilme = Math.max(1, filme.offsetHeight - vh);
  }
  function colocar(img, x, y, w, giro, op, z) {
    const h = w * (img.naturalHeight / img.naturalWidth || .7);
    img.style.width = w + 'px';
    img.style.transform = `translate3d(${x - w / 2}px,${y - h / 2}px,0) rotate(${giro}deg)`;
    img.style.opacity = op;
    if (z !== undefined) img.style.zIndex = z;
    return { w, h, x, y };
  }
  let pedido = false;
  function desenhar() {
    pedido = false;
    const p = Math.min(1, Math.max(0, (scrollY - topoFilme) / alturaFilme));
    const K = cel ? CEL : PC;
    const qc = quadro(K.costela, p);
    const c = colocar(pecas.costela, qc[1] * vw, qc[2] * vh, qc[3] * vw, qc[4], qc[5], 3);
    const qt = quadro(K.tabua, p);
    colocar(pecas.tabua, qt[1] * vw, qt[2] * vh, qt[3] * vw, 0, qt[5], 1);
    BOWLS.forEach(n => {
      const img = pecas[n], [ini, fim] = ORBITA[n], alvo = K[n][0];
      if (p < fim) {
        // órbita: sai de trás da costela, dá quase uma volta em torno dela e para no lugar
        const t = Math.max(0, (p - ini) / (fim - ini)), e = suave(t);
        const fx = alvo[1] * vw - c.x, fy = alvo[2] * vh - c.y;
        const rf = Math.hypot(fx, fy), af = Math.atan2(fy, fx);
        const ang = af - (1 - e) * Math.PI * 1.7, r = rf * (.25 + .75 * e), achata = .55 + .45 * e;
        const x = c.x + Math.cos(ang) * r, y = c.y + Math.sin(ang) * r * achata;
        colocar(img, x, y, alvo[3] * vw * (.55 + .45 * e), (1 - e) * -25, Math.min(1, t * 5), Math.sin(ang) < 0 && e < .9 ? 2 : 4);
      } else {
        const q = quadro(K[n], p);
        colocar(img, q[1] * vw, q[2] * vh, q[3] * vw, q[4], q[5], 4);
      }
    });
    if (sombra) {
      sombra.style.width = c.w * .95 + 'px'; sombra.style.height = c.w * .16 + 'px';
      sombra.style.transform = `translate3d(${c.x - c.w * .475}px,${c.y + c.h * .28}px,0)`;
      sombra.style.opacity = p > .84 ? .35 : (p > .28 && p < .78 ? .3 : .85);
    }
    tempos.forEach((t, i) => t.classList.toggle('on', p >= TEMPOS[i] - .01));
    topo && topo.classList.toggle('claro', p > .25 && p < .8);
  }
  const pedir = () => { if (!pedido) { pedido = true; requestAnimationFrame(desenhar); } };
  addEventListener('scroll', pedir, { passive: true });
  addEventListener('resize', () => { medir(); pedir(); });
  Promise.all(Object.values(pecas).map(i => i.decode ? i.decode().catch(() => {}) : 0)).then(() => { medir(true); desenhar(); });
  medir(true); desenhar();
  document.fonts && document.fonts.ready.then(() => { medir(true); desenhar(); });

  // ---------- rolagem automática em ritmo constante ----------
  let guia = null;
  function parar() { if (guia) { cancelAnimationFrame(guia); guia = null; } }
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(e => addEventListener(e, parar, { passive: true }));
  function rolarAte(y1) {
    parar();
    const y0 = scrollY, dist = y1 - y0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { scrollTo(0, y1); return; }
    const ms = Math.abs(dist) / (innerHeight * .9) * 1000; // ~0,9 tela por segundo, sem acelerar
    const t0 = performance.now();
    const passo = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + dist * t); guia = t < 1 ? requestAnimationFrame(passo) : null; };
    setTimeout(() => { guia = requestAnimationFrame(passo); }, 30);
  }
  document.querySelectorAll('[data-rolar]').forEach(a => a.addEventListener('click', e => {
    const alvo = document.querySelector(a.getAttribute('href')); if (!alvo) return;
    e.preventDefault();
    rolarAte(alvo.getBoundingClientRect().top + scrollY);
  }));

  // ---------- luzes douradas desfocadas ----------
  function rnd(s) { return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
  document.querySelectorAll('.bokeh').forEach((b, i) => {
    const r = rnd(11 + i * 7), zona = b.dataset.zona || 'tudo', n = innerWidth < 768 ? 16 : 34;
    for (let k = 0; k < n; k++) {
      const s = 10 + r() * (innerWidth < 768 ? 44 : 96), e = document.createElement('i');
      let x = r() * 100, y = r() * 100;
      if (zona === 'direita') { x = 42 + r() * 58; y = r() * 80; }
      if (zona === 'baixo') { y = 52 + r() * 48; }
      e.style.cssText = `left:${x}%;top:${y}%;width:${s}px;height:${s}px;background:radial-gradient(circle,rgba(255,206,120,${.22 + r() * .45}) 0,rgba(255,180,80,${.1 + r() * .18}) 55%,rgba(255,170,70,0) 72%);filter:blur(${1 + r() * 3}px);--d:${7 + r() * 8}s;--x:${(r() - .5) * 30}px;--y:${(r() - .5) * 30}px`;
      b.appendChild(e);
    }
  });

  // ---------- entrada das partes ----------
  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('visto'); io.unobserve(en.target); } }), { threshold: .2 });
  document.querySelectorAll('.sobe').forEach(el => { el.style.transitionDelay = (el.dataset.atraso || 0) + 'ms'; io.observe(el); });

  // ---------- calculadora ----------
  const PRECO = { completo: { osso: 159.90, desossada: 184.90 }, casal: { osso: 109.90, desossada: 129.40 } };
  const f = document.querySelector('#calc'); if (!f) return;
  const $ = s => document.querySelector(s);
  const real = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  let pessoas = 0;
  const MAX = 300;
  function combos(n, corte) {
    if (!n) return { completo: 0, casal: 0, total: 0 };
    let completo = Math.floor(n / 3), casal = 0;
    if (n % 3) { if (PRECO.casal[corte] <= PRECO.completo[corte]) casal = 1; else completo++; }
    return { completo, casal, total: completo * PRECO.completo[corte] + casal * PRECO.casal[corte] };
  }
  const corteAtual = () => f.querySelector('input[name=corte]:checked').value;
  function atualizar() {
    const corte = corteAtual(), c = combos(pessoas, corte);
    $('#pessoas').textContent = pessoas;
    $('#total').textContent = real(c.total);
    const bt = $('#reservar');
    bt.href = CFG.encomendas + '?' + new URLSearchParams({ origem: CFG.origem, pessoas, completo: c.completo, casal: c.casal, corte }) + '#encomendas';
    bt.classList.toggle('travado', !pessoas); bt.toggleAttribute('aria-disabled', !pessoas);
    $('#menos').disabled = !pessoas;
  }
  $('#menos').addEventListener('click', () => { pessoas = Math.max(0, pessoas - 1); atualizar(); });
  $('#mais').addEventListener('click', () => { pessoas = Math.min(MAX, pessoas + 1); atualizar(); });
  f.addEventListener('change', atualizar);
  $('#reservar').addEventListener('click', e => {
    if (!pessoas) { e.preventDefault(); $('#mais').focus(); return; }
    if (window.fbq) fbq('track', 'Lead', { content_name: CFG.origem, value: combos(pessoas, corteAtual()).total, currency: 'BRL' });
  });
  atualizar();
})();
