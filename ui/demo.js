(() => {
  const badge = document.createElement('aside');
  badge.textContent = 'STATIC FIXTURE · 720 synthetic blocks · no KV / D1 / storage';
  badge.setAttribute('aria-label', 'Static fixture demo: no persistence');
  Object.assign(badge.style, {
    position: 'fixed', right: '12px', bottom: '12px', zIndex: '9999',
    padding: '7px 10px', border: '1px solid #3d9f70', borderRadius: '7px',
    background: '#101713ee', color: '#a8e8bd', font: '11px ui-monospace, monospace',
    boxShadow: '0 8px 24px #0008',
  });
  document.body.append(badge);
})();
