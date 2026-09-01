// viz plugin: hologram — force-directed ตาม "การเชื่อมจริง" (แรงบันดาลใจ: สมองไซ·โฮโลแกรม ของ psi-memory)
// ตำแหน่งมาจาก edges kNN ไม่ใช่ PCA: ก้อนที่เชื่อมกันดึงกัน ก้อนอื่นผลักกัน — เห็น "โครง" ของ corpus
// label = กลุ่ม (session ใหญ่สุด) + count · สี = role (user ฟ้า / assistant ส้มทอง) เหมือนสองซีกของเขา
(() => {
  let raf = 0, cv, ctx, host, G, adj;
  let ox = 0, oy = 0, zoom = 1, drag = null, hoverIdx = -1, selIdx = -1, extIdx = -1;
  let pos = [], vel = [], iter = 0, labels = [], spin = true, ang = 0;
  const proj = [];
  let ro = null;
  const handlers = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); handlers.push([el, ev, fn]); };

  function resize() {
    const w = host.stage.clientWidth, h = host.stage.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // force ราคาถูก: spring บน edges + ผลักเฉพาะคู่ใกล้ (sample) — 600 จุดไหวสบายใน rAF
  function step() {
    if (iter > 260) return;
    iter++;
    const n = G.nodes.length;
    const K = 0.012, REP = 0.55, DAMP = 0.86;
    for (const e of G.edges) {
      const a = pos[e.s], b = pos[e.t];
      const dx = b[0]-a[0], dy = b[1]-a[1];
      const dl = Math.hypot(dx, dy) || 0.001;
      const want = 0.07 + e.d * 0.5;             // ใกล้ความหมาย = เส้นสั้น
      const f = K * (dl - want) / dl;
      vel[e.s][0] += dx*f; vel[e.s][1] += dy*f;
      vel[e.t][0] -= dx*f; vel[e.t][1] -= dy*f;
    }
    for (let i = 0; i < n; i++) {                 // ผลัก: สุ่มคู่ (Monte Carlo) พอให้ไม่ยุบรวม
      for (let s = 0; s < 6; s++) {
        const j = (Math.random() * n) | 0;
        if (j === i) continue;
        const dx = pos[i][0]-pos[j][0], dy = pos[i][1]-pos[j][1];
        const d2 = dx*dx + dy*dy + 0.0004;
        if (d2 > 0.25) continue;
        const f = REP * 0.0004 / d2;
        vel[i][0] += dx*f; vel[i][1] += dy*f;
      }
      vel[i][0] *= DAMP; vel[i][1] *= DAMP;
      pos[i][0] += vel[i][0]; pos[i][1] += vel[i][1];
    }
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!host.reduce || iter < 40) step();
    const w = host.stage.clientWidth, h = host.stage.clientHeight;
    const time = host.reduce ? 0 : t / 1000;
    const S = Math.min(w, h) * 0.85 * zoom;
    if (spin) ang += 0.0011;   // หมุนช้าแบบลูกโลก จนกว่าจะจับลาก
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // yaw: force ให้ x-y, ความลึกยืมจาก PCA-z — หมุนรอบแกนตั้งไม่ใช่ roll
    const P = (i) => [w/2 + ox + (pos[i][0]*ca - (G.nodes[i].z ?? 0)*0.5*sa)*S, h/2 + oy + pos[i][1]*S];
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    const focused = selIdx >= 0;
    // เส้นทั้งหมดจางเป็นหมอกโครงสร้าง — 14K เส้นของเขาอ่านเป็นหมอก ไม่ใช่ wire
    ctx.lineWidth = 0.6;
    for (const ed of G.edges) {
      const mine = focused && (ed.s === selIdx || ed.t === selIdx);
      const pa = P(ed.s), pb = P(ed.t);
      if (mine) {
        const g = ctx.createLinearGradient(pa[0], pa[1], pb[0], pb[1]);
        g.addColorStop(0, 'rgba(240,196,116,0.9)');
        g.addColorStop(1, 'rgba(123,178,245,0.55)');
        ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.2, (1 - ed.d) * 4);
      } else {
        ctx.strokeStyle = `rgba(120,160,220,${(focused ? 0.03 : 0.06) + (1 - ed.d) * 0.05})`;
        ctx.lineWidth = 0.6;
      }
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    }
    for (let i = 0; i < G.nodes.length; i++) {
      const [sx, sy] = P(i);
      const nd = G.nodes[i];
      const r = (2 + Math.min(nd.degree, 8) * 0.8) * Math.sqrt(zoom);
      proj[i] = [sx, sy, r];
      const active = i === selIdx || i === hoverIdx || i === extIdx;
      const inFocus = !focused || i === selIdx || adj.get(selIdx)?.has(i);
      const breathe = host.reduce ? 1 : 0.85 + 0.15 * Math.sin(time * 1.3 + i);
      // สองซีกแบบสมองเขา: user = ฟ้า, assistant/อื่น = ส้มอุ่น (จาก session hash เดิมจะลายเกิน)
      const warm = nd.session.charCodeAt(0) % 3 === 0;
      const [cr, cg, cb] = warm ? [255, 190, 140] : [140, 190, 255];
      const a = (active ? 1 : inFocus ? 0.75 : 0.16) * breathe;
      const rr = active ? r * 2 : r;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 2);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},${a * 0.8})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(sx, sy, rr * 2, 0, 7); ctx.fill();
    }
    // ป้ายกลุ่ม: session ใหญ่สุด 8 กลุ่ม วางที่ centroid — อ่านโครงก่อนใบ
    ctx.globalCompositeOperation = 'source-over';
    for (const L of labels) {
      let x = 0, y = 0;
      for (const i of L.members) { const p = P(i); x += p[0]; y += p[1]; }
      x /= L.members.length; y /= L.members.length;
      ctx.font = '10.5px ui-monospace';
      const txt = `${L.name} · ${L.members.length}`;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = '#05070cd0'; ctx.fillRect(x - tw/2 - 5, y - 8, tw + 10, 16);
      ctx.fillStyle = '#93a3b8'; ctx.fillText(txt, x - tw/2, y + 4);
    }
    cv.style.cursor = drag ? 'grabbing' : hoverIdx >= 0 ? 'pointer' : 'grab';
  }
  function pick(px, py) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < proj.length; i++) {
      const [sx, sy, r] = proj[i];
      const d = Math.hypot(sx-px, sy-py);
      if (d <= Math.max(r*2.4, 14) && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  registerViz({
    id: 'hologram', name: '🧠 Hologram',
    init(h) {
      host = h; G = h.G; adj = h.adj; selIdx = h.selIdx;
      spin = !host.reduce;   // reduce-motion เริ่มนิ่ง แต่ปุ่ม หมุนต่อ (เจตนาตรง) ปลุกได้เสมอ
      ox = 0; oy = 0; zoom = 1; iter = 0;
      // เริ่มจาก PCA (มีโครงอยู่แล้ว) แล้วให้ force ปรับตามเส้นจริง — converge เร็วกว่า random
      pos = G.nodes.map((nd) => [nd.x * 0.4, -nd.y * 0.4]);
      vel = G.nodes.map(() => [0, 0]);
      const bySess = new Map();
      G.nodes.forEach((nd, i) => {
        if (!bySess.has(nd.session)) bySess.set(nd.session, []);
        bySess.get(nd.session).push(i);
      });
      labels = [...bySess.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8)
        .map(([name, members]) => ({ name: name.slice(0, 18), members }));
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
      on(cv, 'wheel', (e) => { e.preventDefault(); zoom = Math.max(0.3, Math.min(10, zoom * (1 - e.deltaY*0.0015))); }, { passive: false });
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
