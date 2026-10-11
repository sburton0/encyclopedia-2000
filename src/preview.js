(() => {
  const $ = (id) => document.getElementById(id);
  let embedEl = $('pdf');
  const busy = $('busy');
  const status = $('status');
  let opts = {};
  let token = 0;

  async function render(change = {}) {
    const my = ++token;
    busy.hidden = false;
    status.textContent = 'Preparing the preview…';
    try {
      const res = await window.e2k.print.render(change);
      if (my !== token) return;
      opts = res.opts;
      // A fresh element makes the PDF viewer reload cleanly; toolbar=0 hides its own controls.
      const next = embedEl.cloneNode();
      next.src = `${res.url}#toolbar=0&navpanes=0&view=Fit`;
      embedEl.replaceWith(next);
      embedEl = next;
      $('tt').textContent = res.title ? `Print Preview: ${res.title}` : 'Print Preview';
      document.title = $('tt').textContent;
      status.textContent = 'Ready';
    } catch (err) {
      status.textContent = 'The preview couldn’t be prepared. ' + (err && err.message ? err.message : '');
    }
    sync();
    busy.hidden = true;
  }

  function sync() {
    $('paper').value = opts.pageSize || 'Letter';
    $('portrait').classList.toggle('on', !opts.landscape);
    $('landscape').classList.toggle('on', !!opts.landscape);
    $('images').checked = opts.images !== false;
    $('setup').textContent = `${opts.pageSize || 'Letter'} · ${opts.landscape ? 'Landscape' : 'Portrait'}${opts.images === false ? ' · No pictures' : ''}`;
  }

  $('paper').addEventListener('change', (e) => render({ pageSize: e.target.value }));
  $('portrait').addEventListener('click', () => render({ landscape: false }));
  $('landscape').addEventListener('click', () => render({ landscape: true }));
  $('images').addEventListener('change', (e) => render({ images: e.target.checked }));
  $('print').addEventListener('click', async () => {
    status.textContent = 'Choose a printer in the Print dialog…';
    const res = await window.e2k.print.print();
    status.textContent = res.ok ? 'Sent to the printer' : res.reason === 'cancelled' ? 'Printing canceled' : 'Printing didn’t finish' + (res.reason ? ` (${res.reason})` : '');
  });
  $('save').addEventListener('click', async () => {
    const res = await window.e2k.print.save();
    status.textContent = res.saved ? `Saved ${res.filePath}` : 'Ready';
  });
  $('close').addEventListener('click', () => window.e2k.win('close'));
  document.querySelectorAll('[data-win]').forEach((b) => b.addEventListener('click', () => window.e2k.win(b.dataset.win)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.e2k.win('close');
    if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); $('print').click(); }
  });

  render();
})();
