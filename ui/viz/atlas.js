// viz plugin: atlas — soma glow 3D (PCA rotate/zoom/focus) — ตัววาดหลักเดิม ย้ายมาเป็น module
// contract: registerViz({id, name, init(host), setState, setSelected, destroy})
(() => {
  let raf = 0, cv, ctx, host, G, adj;
  let rot = { x: 0.2, y: 0.5 }, dist = 3.6, drag = null, spin = true, extIdx = -1;
  let hoverIdx = -1, selIdx = -1, labels = [], state = { mode: 'map', names: true };
  const proj = [];
  const spriteCache = new Map();
  let ro = null, dust = [];

  function sprite(hue) {
    const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    grad.addColorStop(0, `hsla(${hue},60%,92%,1)`);
    grad.addColorStop(0.25, `hsla(${hue},60%,70%,.85)`);
    grad.addColorStop(1, `hsla(${hue},60%,60%,0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    return c;
  }
  function nodeSprite(session) {
    let h = 0; for (const ch of session) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
    const hue = h % 360;
    if (!spriteCache.has(hue)) spriteCache.set(hue, sprite(hue));
    return spriteCache.get(hue);
  }
  function resize() {
    const w = host.stage.clientWidth, h = host.stage.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function view(p, cam) {
    const [cy, sy, cx, sx] = cam;
    const x1 = p[0]*cy - p[2]*sy, z1 = p[0]*sy + p[2]*cy;
    const y2 = p[1]*cx - z1*sx,  z2 = p[1]*sx + z1*cx;
    return [x1, y2, z2 + dist];
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const w = host.stage.clientWidth, h = host.stage.clientHeight;
    const time = host.reduce ? 0 : t / 1000;
    if (spin) rot.y += 0.0016;
    const cam = [Math.cos(rot.y), Math.sin(rot.y), Math.cos(rot.x), Math.sin(rot.x)];
    const scale = h / (2 * Math.tan(25 * Math.PI / 180));
    const P = (v) => [w/2 + v[0]/v[2]*scale, h/2 - v[1]/v[2]*scale];

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    const dcam = [Math.cos(rot.y*0.85), Math.sin(rot.y*0.85), Math.cos(rot.x), Math.sin(rot.x)];
    ctx.fillStyle = 'rgba(159,184,200,.35)';
    for (const p of dust) {
      const v = view(p, dcam); if (v[2] <= 0.2) continue;
      const [sx, sy] = P(v); const r = 0.9/v[2]*2.2;
      ctx.fillRect(sx, sy, r, r);
    }

    const edgesOn = state.mode === 'web';
    const faint = edgesOn ? 1 : 0.4;
    const focused = selIdx >= 0;
    for (let e = 0; e < G.edges.length; e++) {
      const ed = G.edges[e];
      const mine = focused && (ed.s === selIdx || ed.t === selIdx);
      if (focused && !mine) continue;
      if (!focused && !edgesOn && ed.kind === 'bridge') continue;
      const a = G.nodes[ed.s], b = G.nodes[ed.t];
      const va = view([a.x*1.5, a.y*1.5, a.z*1.5], cam), vb = view([b.x*1.5, b.y*1.5, b.z*1.5], cam);
      if (va[2] <= 0.2 || vb[2] <= 0.2) continue;
      const pa = P(va), pb = P(vb);
      const mx = (pa[0]+pb[0])/2, my = (pa[1]+pb[1])/2;
      const dx = mx - w/2, dy = my - h/2, dl = Math.hypot(dx, dy) || 1;
      const span = Math.hypot(pb[0]-pa[0], pb[1]-pa[1]);
      const bow = span * 0.18;
      const alpha = mine ? Math.max(0.35, (1 - ed.d) * 0.9)
        : (ed.kind === 'bridge' ? 0.08 : Math.max(0.05, (1 - ed.d) * 0.28)) * faint;
      ctx.strokeStyle = `rgba(140,170,200,${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]);
      ctx.quadraticCurveTo(mx + dx/dl*bow, my + dy/dl*bow, pb[0], pb[1]);
      ctx.stroke();
      if (edgesOn && !host.reduce) {
        const tt = (time * 0.24 + e * 0.37) % 1;
        const qx = (1-tt)*(1-tt)*pa[0] + 2*(1-tt)*tt*(mx+dx/dl*bow) + tt*tt*pb[0];
        const qy = (1-tt)*(1-tt)*pa[1] + 2*(1-tt)*tt*(my+dy/dl*bow) + tt*tt*pb[1];
        ctx.fillStyle = 'rgba(160,205,225,.5)';
        ctx.beginPath(); ctx.arc(qx, qy, 1.4, 0, 7); ctx.fill();
      }
    }

    const order = [];
    for (let i = 0; i < G.nodes.length; i++) {
      const nd = G.nodes[i];
      const v = view([nd.x*1.5, nd.y*1.5, nd.z*1.5], cam);
      const [sx, sy] = P(v);
      const depth = Math.min(Math.max((v[2]-1)/5, 0), 1);
      const breathe = host.reduce ? 1 : 0.88 + 0.12*Math.sin(time*1.4 + i*0.7);
      const base = 5 + Math.min(nd.degree, 6) * 0.9;
      const r = v[2] > 0.2 ? base/v[2]*2.6*breathe : -1;
      proj[i] = [sx, sy, r, depth];
      if (r > 0) order.push(i);
    }
    order.sort((a, b) => proj[b][3] - proj[a][3]);
    for (const i of order) {
      const [sx, sy, r, depth] = proj[i];
      const active = i === selIdx || i === hoverIdx || i === extIdx;
      const inFocus = !focused || i === selIdx || adj.get(selIdx)?.has(i);
      const fade = active ? 1 : (1 - depth*0.75) * (inFocus ? 1 : 0.22);
      const rr = r * (active ? 1.7 : 1);
      ctx.globalAlpha = fade;
      ctx.drawImage(nodeSprite(G.nodes[i].session), sx-rr, sy-rr, rr*2, rr*2);
    }
    ctx.globalAlpha = 1;

    if (state.names) for (const L of labels) {
      const [sx, sy, r] = proj[L.i] ?? [0,0,-1];
      if (r <= 0) { L.el.style.opacity = '0'; continue; }
      L.el.style.transform = `translate(${Math.round(sx + r + 5)}px,${Math.round(sy - 8)}px)`;
      const inFocus = !focused || L.i === selIdx || adj.get(selIdx)?.has(L.i);
      L.el.style.opacity = (L.i === hoverIdx || L.i === selIdx || L.i === extIdx) ? "1" : inFocus ? "0.5" : "0.18";
    } else for (const L of labels) L.el.style.opacity = '0';

    cv.style.cursor = drag ? 'grabbing' : hoverIdx >= 0 ? 'pointer' : 'grab';
  }
  function pick(px, py) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < proj.length; i++) {
      const [sx, sy, r] = proj[i];
      if (r <= 0) continue;
      const d = Math.hypot(sx-px, sy-py);
      if (d <= Math.max(r*2.2, 16) && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  const handlers = [];
  function on(el, ev, fn, opt) { el.addEventListener(ev, fn, opt); handlers.push([el, ev, fn]); }

  registerViz({
    id: 'atlas', name: '🌌 Atlas 3D',
    init(h) {
      host = h; G = h.G; adj = h.adj; selIdx = h.selIdx;
      spin = !host.reduce;   // reduce-motion เริ่มนิ่ง แต่ปุ่ม หมุนต่อ (เจตนาตรง) ปลุกได้เสมอ
      cv = document.createElement('canvas');
      host.root.appendChild(cv);
      ctx = cv.getContext('2d');
      // ฝุ่น parallax
      dust = []; let s = 7;
      const rnd = () => { s = (s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
      for (let i = 0; i < 420; i++) {
        const th = rnd()*Math.PI*2, ph = Math.acos(2*rnd()-1), rad = 2.2 + rnd()*3.4;
        dust.push([rad*Math.sin(ph)*Math.cos(th), rad*Math.sin(ph)*Math.sin(th), rad*Math.cos(ph)]);
      }
      // labels: top 20 ตาม degree
      labels = [...G.nodes.keys()].sort((a,b) => G.nodes[b].degree - G.nodes[a].degree).slice(0, 20)
        .map((i) => {
          const el = document.createElement('div');
          el.className = 'label'; el.textContent = G.nodes[i].title.slice(0, 60);
          host.root.appendChild(el);
          return { i, el };
        });
      ro = new ResizeObserver(resize); ro.observe(host.stage); resize();
      on(cv, 'pointerdown', (e) => { drag = {x:e.clientX, y:e.clientY}; cv.setPointerCapture(e.pointerId); });
      on(cv, 'pointerup', (e) => { drag = null; try { cv.releasePointerCapture(e.pointerId); } catch {} });
      on(window, 'pointerup', () => { drag = null; });
      on(cv, 'pointermove', (e) => {
        const rect = cv.getBoundingClientRect();
        hoverIdx = pick(e.clientX-rect.left, e.clientY-rect.top);
        host.hoverNode(hoverIdx !== selIdx ? hoverIdx : -1, proj[hoverIdx]?.[0] ?? 0, proj[hoverIdx]?.[1] ?? 0);
        if (!drag) return;
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 2) spin = false;   // ลากจริงถึงหยุด — คลิก(จิตเตอร์ 1-2px)ไม่นับ
        rot.y += (e.clientX - drag.x) * 0.006;
        rot.x = Math.max(-1.4, Math.min(1.4, rot.x + (e.clientY - drag.y) * 0.006));
        drag = { x: e.clientX, y: e.clientY };
      });
      on(cv, 'pointerleave', () => { hoverIdx = -1; host.hoverEl.style.opacity = '0'; });
      on(cv, 'wheel', (e) => { e.preventDefault(); dist = Math.max(1.3, Math.min(10, dist + e.deltaY*0.003)); }, { passive: false });
      on(cv, 'click', () => host.select(hoverIdx));
      raf = requestAnimationFrame(frame);
    },
    setState(s) { state = { ...s }; },
    setSelected(i) { selIdx = i; },
    setHighlight(i) { extIdx = i; },
    setSpin(v) { if (typeof spin !== "undefined") spin = v; },
    destroy() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      for (const [el, ev, fn] of handlers.splice(0)) el.removeEventListener(ev, fn);
      labels = []; proj.length = 0;
    },
  });
})();
