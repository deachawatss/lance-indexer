// viz plugin: radial — dandelion รอบก้อนที่เลือก (แรงบันดาลใจ: "2 มิติ วงกลม" ของ psi-memory)
// radius = ระยะความหมายจาก focus (ใกล้กลาง = คิดเรื่องเดียวกัน) · มุม = ทิศ PCA + hash กันซ้อน
// ไม่มี focus = จัดวงตาม degree (แกนกลาง = hub ของ corpus)
(() => {
  let raf = 0, cv, ctx, host, G, adj;
  let zoom = 1, drag = null, ox = 0, oy = 0, hoverIdx = -1, selIdx = -1, extIdx = -1, spin = true, sang = 0;
  let layout = [];   // [angle, radius] ต่อ node — คำนวณใหม่เมื่อ focus เปลี่ยน
  const proj = [];
  let ro = null;
  const handlers = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); handlers.push([el, ev, fn]); };
  const hue = (s) => { let h = 0; for (const c of s) h = (h*31 + c.charCodeAt(0)) & 0xffff; return h % 360; };
  const dist3 = (a, b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);

  function relayout() {
    const n = G.nodes.length;
    layout = new Array(n);
    if (selIdx >= 0) {
      const c = G.nodes[selIdx];
      let maxD = 0.001;
      for (const nd of G.nodes) maxD = Math.max(maxD, dist3(nd, c));
      G.nodes.forEach((nd, i) => {
        if (i === selIdx) { layout[i] = [0, 0]; return; }
        const ang = Math.atan2(nd.y - c.y, nd.x - c.x) + ((hue(nd.id) % 17) - 8) * 0.01;
        layout[i] = [ang, 0.12 + (dist3(nd, c) / maxD) * 0.85];  // ใกล้ความหมาย = วงใน
      });
    } else {
      const maxDeg = Math.max(...G.nodes.map((x) => x.degree), 1);
      G.nodes.forEach((nd, i) => {
        const ang = Math.atan2(nd.y, nd.x) + ((hue(nd.id) % 17) - 8) * 0.012;
        layout[i] = [ang, 0.15 + (1 - nd.degree / maxDeg) * 0.8];  // hub อยู่กลาง
      });
    }
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
    const R = Math.min(w, h) * 0.46 * zoom;
    const CX = w/2 + ox, CY = h/2 + oy;
    if (spin) sang += 0.0012;   // หมุนช้าแบบลูกโลก
    const P = (i) => [CX + Math.cos(layout[i][0] + sang) * layout[i][1] * R,
                      CY + Math.sin(layout[i][0] + sang) * layout[i][1] * R];
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, w, h);

    // วงแหวนระยะ — จางๆ บอกสเกลความหมาย
    ctx.strokeStyle = '#141c28';
    for (const rr of [0.3, 0.6, 0.9]) {
      ctx.beginPath(); ctx.arc(CX, CY, rr * R, 0, 7); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';

    const focused = selIdx >= 0;
    // เส้น: dandelion จากศูนย์กลาง (focus) หรือเส้น kNN ปกติ
    for (const ed of G.edges) {
      const mine = focused && (ed.s === selIdx || ed.t === selIdx);
      if (focused && !mine) continue;
      const pa = P(ed.s), pb = P(ed.t);
      if (mine) {
        const g = ctx.createLinearGradient(pa[0], pa[1], pb[0], pb[1]);
        g.addColorStop(0, 'rgba(240,196,116,0.8)');
        g.addColorStop(1, 'rgba(150,190,240,0.25)');
        ctx.strokeStyle = g; ctx.lineWidth = Math.max(0.8, (1 - ed.d) * 3);
      } else {
        ctx.strokeStyle = `rgba(120,160,220,${0.04 + (1 - ed.d) * 0.05})`; ctx.lineWidth = 0.6;
      }
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    }
    for (let i = 0; i < G.nodes.length; i++) {
      const nd = G.nodes[i];
      const [sx, sy] = P(i);
      const r = (i === selIdx ? 7 : 2.2 + Math.min(nd.degree, 6) * 0.5) * Math.sqrt(zoom);
      proj[i] = [sx, sy, r];
      const active = i === selIdx || i === hoverIdx || i === extIdx;
      const inFocus = !focused || i === selIdx || adj.get(selIdx)?.has(i);
      const breathe = host.reduce ? 1 : 0.85 + 0.15 * Math.sin(time * 1.4 + i);
      ctx.globalAlpha = (active ? 1 : inFocus ? 0.8 : 0.25) * breathe;
      ctx.fillStyle = `hsl(${hue(nd.session)},58%,${active ? 88 : 64}%)`;
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
      if (d <= Math.max(r*2.5, 13) && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  registerViz({
    id: 'radial', name: '🎯 Radial',
    init(h) {
      host = h; G = h.G; adj = h.adj; selIdx = h.selIdx;
      spin = !host.reduce;   // reduce-motion เริ่มนิ่ง แต่ปุ่ม หมุนต่อ (เจตนาตรง) ปลุกได้เสมอ
      ox = 0; oy = 0; zoom = 1;
      relayout();
      cv = document.createElement('canvas');
      host.root.appendChild(cv);
      ctx = cv.getContext('2d');
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
      on(cv, 'click', () => host.select(hoverIdx));
      raf = requestAnimationFrame(frame);
    },
    setState() {},
    setSelected(i) { selIdx = i; relayout(); },
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
