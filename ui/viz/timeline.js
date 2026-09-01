// viz plugin: timeline — แกน x = เวลา, แกน y = PCA-1 (ความหมาย) — เห็นว่าคุยเรื่องไหนช่วงไหน
(() => {
  let raf = 0, cv, ctx, host, G, adj;
  let ox = 0, zoom = 1, drag = null, hoverIdx = -1, selIdx = -1, extIdx = -1;
  let t0 = 0, t1 = 1;
  const proj = [];
  let ro = null;
  const handlers = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); handlers.push([el, ev, fn]); };
  const hue = (s) => { let h = 0; for (const c of s) h = (h*31 + c.charCodeAt(0)) & 0xffff; return h % 360; };

  function resize() {
    const w = host.stage.clientWidth, h = host.stage.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    const w = host.stage.clientWidth, h = host.stage.clientHeight;
    const span = (t1 - t0) || 1;
    const X = (ms) => 60 + ox + ((ms - t0) / span) * (w - 120) * zoom;
    const Y = (nd) => h * 0.55 - nd.x * h * 0.32;   // PCA แกนแรก = ความหมายหลัก
    ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, w, h);

    // เส้นแบ่งวัน + ป้ายวันที่
    ctx.strokeStyle = '#1a2230'; ctx.fillStyle = '#5d6572'; ctx.font = '10px ui-monospace';
    const day0 = new Date(t0); day0.setHours(0, 0, 0, 0);
    for (let d = day0.getTime(); d <= t1 + 86400000; d += 86400000) {
      const x = X(d);
      if (x < -50 || x > w + 50) continue;
      ctx.beginPath(); ctx.moveTo(x, 90); ctx.lineTo(x, h - 20); ctx.stroke();
      ctx.fillText(new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }).slice(5), x + 4, h - 26);
    }

    const focused = selIdx >= 0;
    if (focused) for (const ed of G.edges) {
      if (ed.s !== selIdx && ed.t !== selIdx) continue;
      const a = G.nodes[ed.s], b = G.nodes[ed.t];
      if (!a.ms || !b.ms) continue;
      ctx.strokeStyle = `rgba(140,170,200,0.5)`;
      ctx.beginPath(); ctx.moveTo(X(a.ms), Y(a)); ctx.lineTo(X(b.ms), Y(b)); ctx.stroke();
    }
    for (let i = 0; i < G.nodes.length; i++) {
      const nd = G.nodes[i];
      if (!nd.ms) { proj[i] = [-99, -99, -1]; continue; }
      const sx = X(nd.ms), sy = Y(nd);
      const r = 2.5 + Math.min(nd.degree, 6) * 0.6;
      proj[i] = [sx, sy, r];
      if (sx < -20 || sx > w + 20) continue;
      const active = i === selIdx || i === hoverIdx || i === extIdx;
      const inFocus = !focused || i === selIdx || adj.get(selIdx)?.has(i);
      ctx.globalAlpha = active ? 1 : inFocus ? 0.8 : 0.2;
      ctx.fillStyle = `hsl(${hue(nd.session)},60%,${active ? 85 : 62}%)`;
      ctx.beginPath(); ctx.arc(sx, sy, active ? r*1.9 : r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    cv.style.cursor = drag ? 'grabbing' : hoverIdx >= 0 ? 'pointer' : 'grab';
  }
  function pick(px, py) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < proj.length; i++) {
      const [sx, sy, r] = proj[i];
      if (r <= 0) continue;
      const d = Math.hypot(sx-px, sy-py);
      if (d <= Math.max(r*2.5, 12) && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  registerViz({
    id: 'timeline', name: '⏳ Timeline',
    init(h) {
      host = h; G = h.G; adj = h.adj; selIdx = h.selIdx;
      ox = 0; zoom = 1;
      for (const nd of G.nodes) nd.ms = nd.ts ? Date.parse(nd.ts) || 0 : 0;
      const times = G.nodes.map((n) => n.ms).filter(Boolean);
      t0 = Math.min(...times); t1 = Math.max(...times);
      cv = document.createElement('canvas');
      host.root.appendChild(cv);
      ctx = cv.getContext('2d');
      ro = new ResizeObserver(resize); ro.observe(host.stage); resize();
      on(cv, 'pointerdown', (e) => { drag = { x: e.clientX }; cv.setPointerCapture(e.pointerId); });
      on(cv, 'pointerup', (e) => { drag = null; try { cv.releasePointerCapture(e.pointerId); } catch {} });
      on(window, 'pointerup', () => { drag = null; });
      on(cv, 'pointermove', (e) => {
        const rect = cv.getBoundingClientRect();
        hoverIdx = pick(e.clientX-rect.left, e.clientY-rect.top);
        host.hoverNode(hoverIdx !== selIdx ? hoverIdx : -1, proj[hoverIdx]?.[0] ?? 0, proj[hoverIdx]?.[1] ?? 0);
        if (!drag) return;
        ox += e.clientX - drag.x;
        drag = { x: e.clientX };
      });
      on(cv, 'pointerleave', () => { hoverIdx = -1; host.hoverEl.style.opacity = '0'; });
      on(cv, 'wheel', (e) => {
        e.preventDefault();
        const w = host.stage.clientWidth;
        const mx = e.clientX - cv.getBoundingClientRect().left;
        const z2 = Math.max(0.5, Math.min(40, zoom * (1 - e.deltaY * 0.0015)));
        ox = mx - ((mx - ox - 60) * (z2 / zoom) + 60);  // zoom เข้าที่ตำแหน่งเมาส์
        zoom = z2;
      }, { passive: false });
      on(cv, 'click', () => host.select(hoverIdx));
      raf = requestAnimationFrame(frame);
    },
    setState() {},
    setSelected(i) { selIdx = i; },
    setHighlight(i) { extIdx = i; },
    setSpin(v) { if (typeof spin !== "undefined") spin = v; },
    destroy() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      for (const [el, ev, fn] of handlers.splice(0)) el.removeEventListener(ev, fn);
      proj.length = 0;
    },
  });
})();
