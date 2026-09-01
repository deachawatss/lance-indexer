// viz plugin: walk — "การเดิน" (แรงบันดาลใจ: panel การเดินของ psi-memory)
// จากก้อนที่เลือก เดิน greedy ตามเส้นที่แข็งสุดโดยไม่ย้อน 8 ก้าว — beam ทองไล่ลำดับ + panel คะแนนต่อก้าว
// ไม่เลือก = เริ่มจาก hub ใหญ่สุด · คลิกก้อนไหน = เริ่มเดินใหม่จากตรงนั้น
(() => {
  let raf = 0, cv, ctx, host, G, adj;
  let ox = 0, oy = 0, zoom = 1, drag = null, hoverIdx = -1, selIdx = -1, extIdx = -1, spin = true, sang = 0;
  let path = [];      // [{i, d}] ตามลำดับก้าว
  let panel = null;
  const proj = [];
  let ro = null;
  const handlers = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); handlers.push([el, ev, fn]); };
  const hue = (s) => { let h = 0; for (const c of s) h = (h*31 + c.charCodeAt(0)) & 0xffff; return h % 360; };

  // edge lookup: "a:b" → d
  let edgeD = new Map();
  function buildWalk(start) {
    path = [{ i: start, d: 0 }];
    const seen = new Set([start]);
    let cur = start;
    for (let step = 0; step < 8; step++) {
      let best = -1, bd = Infinity;
      for (const nb of adj.get(cur) ?? []) {
        if (seen.has(nb)) continue;
        const d = edgeD.get(cur < nb ? `${cur}:${nb}` : `${nb}:${cur}`) ?? 1;
        if (d < bd) { bd = d; best = nb; }
      }
      if (best < 0) break;   // ทางตัน — ก้อนรอบตัวถูกเยี่ยมหมดแล้ว
      path.push({ i: best, d: bd });
      seen.add(best); cur = best;
    }
    renderPanel();
  }
  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = `<div class="wh">🚶 การเดิน — ${path.length} ก้าว (ตามเส้นแข็งสุด ไม่ย้อน)</div>` +
      path.map((p, k) => {
        const nd = G.nodes[p.i];
        return `<div class="ws" data-i="${p.i}">
          <span class="wn">${k === 0 ? 'เริ่ม' : `ก้าว ${k}`}</span>
          <div class="wt">${host.esc(nd.title.slice(0, 70))}</div>
          <div class="wm">${k > 0 ? `<b>คะแนน ${(1 - p.d).toFixed(3)}</b> · ` : ''}${host.esc(nd.session.slice(0, 20))}#${nd.line}</div>
        </div>`;
      }).join('');
    panel.querySelectorAll('.ws').forEach((el) => {
      const i = Number(el.dataset.i);
      el.onmouseenter = () => { extIdx = i; };
      el.onmouseleave = () => { extIdx = -1; };
      el.onclick = () => host.select(i);
    });
  }
  function resize() {
    const w = host.stage.clientWidth, h = host.stage.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const w = host.stage.clientWidth, h = host.stage.clientHeight;
    const time = host.reduce ? 0 : t / 1000;
    const S = Math.min(w, h) * 0.42 * zoom;
    if (spin) sang += 0.0010;   // หมุนช้าแบบลูกโลก
    const ca = Math.cos(sang), sa = Math.sin(sang);
    // yaw รอบแกนตั้ง (x-z หมุน, y นิ่ง) = ลูกโลกจริง
    const P = (i) => { const nd = G.nodes[i]; return [w/2 + ox + (nd.x*ca - (nd.z ?? 0)*sa) * S, h/2 + oy - nd.y * S]; };
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    const onPath = new Set(path.map((p) => p.i));
    // พื้นหลัง: เส้น kNN จาง
    for (const ed of G.edges) {
      const pa = P(ed.s), pb = P(ed.t);
      ctx.strokeStyle = `rgba(120,160,220,${0.03 + (1 - ed.d) * 0.04})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    }
    // beam การเดิน: ทองไล่จางตามลำดับ + spark วิ่ง
    for (let k = 1; k < path.length; k++) {
      const pa = P(path[k-1].i), pb = P(path[k].i);
      const a = 0.9 - k * 0.07;
      ctx.strokeStyle = `rgba(240,196,116,${a})`;
      ctx.lineWidth = Math.max(1.5, 5 - k * 0.4);
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      if (!host.reduce) {
        const tt = (time * 0.4 + k * 0.13) % 1;
        ctx.fillStyle = 'rgba(255,230,180,.9)';
        ctx.beginPath(); ctx.arc(pa[0] + (pb[0]-pa[0])*tt, pa[1] + (pb[1]-pa[1])*tt, 2, 0, 7); ctx.fill();
      }
    }
    for (let i = 0; i < G.nodes.length; i++) {
      const nd = G.nodes[i];
      const [sx, sy] = P(i);
      const r = 2.2 + Math.min(nd.degree, 6) * 0.5;
      proj[i] = [sx, sy, r];
      const active = i === selIdx || i === hoverIdx || i === extIdx;
      const inPath = onPath.has(i);
      ctx.globalAlpha = active ? 1 : inPath ? 0.95 : 0.22;
      ctx.fillStyle = inPath ? '#f0c474' : `hsl(${hue(nd.session)},55%,60%)`;
      ctx.beginPath(); ctx.arc(sx, sy, active || inPath ? r*1.6 : r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    cv.style.cursor = drag ? 'grabbing' : hoverIdx >= 0 ? 'pointer' : 'grab';
  }
  function pick(px, py) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < proj.length; i++) {
      const [sx, sy, r] = proj[i];
      const d = Math.hypot(sx-px, sy-py);
      if (d <= Math.max(r*2.5, 13) && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  registerViz({
    id: 'walk', name: '🚶 Walk',
    init(h) {
      host = h; G = h.G; adj = h.adj; selIdx = h.selIdx;
      spin = !host.reduce;   // reduce-motion เริ่มนิ่ง แต่ปุ่ม หมุนต่อ (เจตนาตรง) ปลุกได้เสมอ
      ox = 0; oy = 0; zoom = 1;
      edgeD = new Map();
      for (const e of G.edges) edgeD.set(e.s < e.t ? `${e.s}:${e.t}` : `${e.t}:${e.s}`, e.d);
      cv = document.createElement('canvas');
      host.root.appendChild(cv);
      ctx = cv.getContext('2d');
      panel = document.createElement('div');
      panel.style.cssText = `position:absolute;left:14px;bottom:14px;width:min(360px,80vw);
        max-height:46vh;overflow-y:auto;background:#0c1017ee;border:1px solid #2a3342;
        border-radius:10px;padding:10px 12px;font-size:12px;z-index:2`;
      panel.innerHTML = '';
      host.root.appendChild(panel);
      const st = document.createElement('style');
      st.textContent = `.wh{color:#e8b04b;font-size:11px;letter-spacing:.08em;margin-bottom:6px}
        .ws{padding:5px 6px;border-top:1px solid #1c2430;cursor:pointer}
        .ws:hover{background:#e8b04b14}
        .wn{color:#5d6572;font-size:10px}
        .wt{color:#c9d0da}
        .wm{color:#7d8794;font-size:11px}.wm b{color:#f0c474;font-weight:500}`;
      panel.appendChild(st);
      const start = selIdx >= 0 ? selIdx
        : G.nodes.reduce((m, nd, i) => (nd.degree > G.nodes[m].degree ? i : m), 0);
      buildWalk(start);
      ro = new ResizeObserver(resize); ro.observe(host.stage); resize();
      on(cv, "pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
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
      on(cv, 'click', () => { if (hoverIdx >= 0) { host.select(hoverIdx); } });
      raf = requestAnimationFrame(frame);
    },
    setState() {},
    setSelected(i) { selIdx = i; if (i >= 0) buildWalk(i); },
    setHighlight(i) { extIdx = i; },
    setSpin(v) { if (typeof spin !== "undefined") spin = v; },
    destroy() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      for (const [el, ev, fn] of handlers.splice(0)) el.removeEventListener(ev, fn);
      proj.length = 0; path = [];
    },
  });
})();
