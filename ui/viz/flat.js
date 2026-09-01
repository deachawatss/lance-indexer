// viz plugin: flat — scatter 2D (แกน PCA 1-2) pan/zoom — ตัวพิสูจน์ว่า visualizer สลับได้จริง
(() => {
  let raf = 0, cv, ctx, host, G, adj;
  let ox = 0, oy = 0, zoom = 1, drag = null, hoverIdx = -1, selIdx = -1, extIdx = -1, spin = true, sang = 0;
  let state = { mode: "map", names: true };
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
    const S = Math.min(w, h) * 0.4 * zoom;
    if (spin) sang += 0.0012;   // หมุนช้าแบบลูกโลก
    const ca = Math.cos(sang), sa = Math.sin(sang);
    // yaw รอบแกนตั้ง (x-z หมุน, y นิ่ง) = ลูกโลกจริง — ไม่ใช่ roll ในระนาบจอ
    const P = (nd) => [w/2 + ox + (nd.x*ca - (nd.z ?? 0)*sa) * S, h/2 + oy - nd.y * S];
    ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, w, h);

    const focused = selIdx >= 0;
    if (state.mode === 'web' || focused) {
      for (const ed of G.edges) {
        const mine = focused && (ed.s === selIdx || ed.t === selIdx);
        if (focused && !mine) continue;
        if (!focused && ed.kind === 'bridge') continue;
        const pa = P(G.nodes[ed.s]), pb = P(G.nodes[ed.t]);
        ctx.strokeStyle = `rgba(140,170,200,${mine ? 0.55 : Math.max(0.04, (1 - ed.d) * 0.2)})`;
        ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      }
    }
    for (let i = 0; i < G.nodes.length; i++) {
      const nd = G.nodes[i];
      const [sx, sy] = P(nd);
      const r = 2.5 + Math.min(nd.degree, 6) * 0.7 * zoom;
      proj[i] = [sx, sy, r];
      const active = i === selIdx || i === hoverIdx || i === extIdx;
      const inFocus = !focused || i === selIdx || adj.get(selIdx)?.has(i);
      ctx.globalAlpha = active ? 1 : inFocus ? 0.85 : 0.22;
      ctx.fillStyle = `hsl(${hue(nd.session)},60%,${active ? 85 : 62}%)`;
      ctx.beginPath(); ctx.arc(sx, sy, active ? r*1.8 : r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    cv.style.cursor = drag ? 'grabbing' : hoverIdx >= 0 ? 'pointer' : 'grab';
  }
  function pick(px, py) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < proj.length; i++) {
      const [sx, sy, r] = proj[i];
      const d = Math.hypot(sx-px, sy-py);
      if (d <= Math.max(r*2.5, 14) && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  registerViz({
    id: 'flat', name: '📈 Flat 2D',
    init(h) {
      host = h; G = h.G; adj = h.adj; selIdx = h.selIdx;
      spin = !host.reduce;   // reduce-motion เริ่มนิ่ง แต่ปุ่ม หมุนต่อ (เจตนาตรง) ปลุกได้เสมอ
      ox = 0; oy = 0; zoom = 1;
      cv = document.createElement('canvas');
      host.root.appendChild(cv);
      ctx = cv.getContext('2d');
      ro = new ResizeObserver(resize); ro.observe(host.stage); resize();
      on(cv, "pointerdown", (e) => { drag = {x:e.clientX, y:e.clientY}; cv.setPointerCapture(e.pointerId); });
      on(cv, 'pointerup', (e) => { drag = null; try { cv.releasePointerCapture(e.pointerId); } catch {} });
      on(window, 'pointerup', () => { drag = null; });
      on(cv, 'pointermove', (e) => {
        const rect = cv.getBoundingClientRect();
        hoverIdx = pick(e.clientX-rect.left, e.clientY-rect.top);
        host.hoverNode(hoverIdx !== selIdx ? hoverIdx : -1, proj[hoverIdx]?.[0] ?? 0, proj[hoverIdx]?.[1] ?? 0);
        if (!drag) return;
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 2) spin = false;   // ลากจริงถึงหยุด — คลิก(จิตเตอร์ 1-2px)ไม่นับ
        ox += e.clientX - drag.x; oy += e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
      });
      on(cv, 'pointerleave', () => { hoverIdx = -1; host.hoverEl.style.opacity = '0'; });
      on(cv, 'wheel', (e) => { e.preventDefault(); zoom = Math.max(0.3, Math.min(8, zoom * (1 - e.deltaY*0.0015))); }, { passive: false });
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
      proj.length = 0;
    },
  });
})();
