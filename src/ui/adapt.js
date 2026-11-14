// "Make it yours" panel: the player describes a comfortable movement (optional) and Gemini
// sets the control mapping and a practice drill from their recent throws.
const CSS = `
  .adapt { display: grid; gap: 10px; border: 2px solid #1b2238; background: #fffaf0; padding: 12px; }
  .adapt h2 { font: 400 22px Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif; text-transform: uppercase; margin: 0; }
  .adapt p, .adapt ul { margin: 0; }
  .adapt label { font-size: 13px; }
  .adapt textarea { width: 100%; margin-top: 4px; padding: 8px; border: 2px solid #1b2238; background: #fff; color: #1b2238; font: 14px Georgia, serif; resize: vertical; }
  .adapt .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .adapt button { border: 2px solid #1b2238; background: #d23b2a; color: #fffaf0; padding: 8px 14px; cursor: pointer;
    font: 400 17px Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif; text-transform: uppercase; box-shadow: 3px 3px 0 #1b2238; }
  .adapt button[data-reset] { background: #f2e8d5; color: #1b2238; }
  .adapt button:disabled { opacity: .5; box-shadow: none; cursor: default; }
  .adapt button:focus-visible, .adapt textarea:focus-visible { outline: 3px solid #1b2238; outline-offset: 3px; }
  .adapt [data-status] { font: 700 12px "Courier New", ui-monospace, monospace; }
  .adapt [data-settings] { font: 700 13px "Courier New", ui-monospace, monospace; border-top: 2px dashed #1b2238; padding-top: 8px; }
  .adapt [data-result] { display: grid; gap: 8px; }
  .adapt [data-result][hidden] { display: none; }
  .adapt ul { padding-left: 18px; font-size: 13px; }
  .adapt [data-drill] { border-left: 4px solid #e0a526; padding-left: 8px; }
`;

/** handlers.adapt(requestText) resolves to an adaptation (see validAdaptation) or rejects with a readable Error; handlers.reset() restores defaults. */
export function createAdapt(root, handlers) {
  root.innerHTML = `<style>${CSS}</style><div class="adapt">
    <h2>Make it yours</h2>
    <p>Throw a few times using any movement that is comfortable. Gemini then fits the controls to you and sets a drill for your pattern.</p>
    <label>What movement suits you? (optional)
      <textarea rows="2" maxlength="300" placeholder="e.g. I can only twist my wrist a little"></textarea></label>
    <div class="row"><button type="button" data-go>Adapt controls to me</button><button type="button" data-reset>Reset</button></div>
    <p data-status aria-live="polite">Standard controls: full arm swing.</p>
    <div data-result hidden>
      <p data-settings></p>
      <p data-rationale></p>
      <ul data-evidence></ul>
      <p data-drill></p>
    </div>
  </div>`;
  const find = name => root.querySelector(`[data-${name}]`);
  const text = root.querySelector('textarea');
  find('go').addEventListener('click', async () => {
    find('go').disabled = true;
    find('status').textContent = 'Gemini is studying your movements…';
    try {
      const a = await handlers.adapt(text.value);
      find('settings').textContent = `${a.mapping.mode === 'gentle' ? 'Small-movement mode' : 'Full-swing mode'} · power ×${a.mapping.gain.toFixed(1)} · twist ×${a.mapping.twistGain.toFixed(1)}`;
      find('rationale').textContent = a.rationale;
      find('evidence').replaceChildren(...a.evidence.map(line => Object.assign(document.createElement('li'), { textContent: line })));
      find('drill').textContent = `Drill: ${a.drill.title}. ${a.drill.instruction}`;
      find('result').hidden = false;
      find('status').textContent = a.source === 'gemini' ? 'Controls set by Gemini from your throws.' : 'Gemini was unavailable; controls set by a simple local rule.';
    } catch (error) { find('status').textContent = error.message || 'Could not adapt the controls. Try again.'; }
    find('go').disabled = false;
  });
  find('reset').addEventListener('click', () => {
    try { handlers.reset(); } catch (error) { find('status').textContent = error.message; return; }
    find('result').hidden = true;
    find('status').textContent = 'Standard controls: full arm swing.';
  });
}
