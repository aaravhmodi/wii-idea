// Training plan panel: Gemini writes a plan from the player's throws and finished games, and
// rewrites it against its own previous plan, so coaching carries across games.
const KEY = 'motionplay.plan.v1';
const CSS = `
  .plan { display: grid; gap: 8px; border: 2px solid #1b2238; background: #fffaf0; padding: 12px; }
  .plan h2 { font: 400 22px Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif; text-transform: uppercase; margin: 0; }
  .plan p, .plan ol { margin: 0; }
  .plan ol { padding-left: 20px; display: grid; gap: 4px; }
  .plan button { justify-self: start; border: 2px solid #1b2238; background: #e0a526; color: #1b2238; padding: 8px 14px; cursor: pointer;
    font: 400 17px Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif; text-transform: uppercase; box-shadow: 3px 3px 0 #1b2238; }
  .plan button:disabled { opacity: .5; box-shadow: none; cursor: default; }
  .plan button:focus-visible { outline: 3px solid #d23b2a; outline-offset: 3px; }
  .plan [data-status], .plan [data-progress] { font: 700 12px "Courier New", ui-monospace, monospace; }
  .plan [data-focus] { border-left: 4px solid #d23b2a; padding-left: 8px; font-weight: 700; }
`;

function load() {
  try { const saved = JSON.parse(localStorage.getItem(KEY)); return saved && Array.isArray(saved.games) ? saved : { games: [], plan: null }; }
  catch { return { games: [], plan: null }; }
}

/** request({ games, previous }) resolves to { focus, steps, progress, source } or rejects with a readable Error. */
export function createPlan(root, request) {
  root.innerHTML = `<style>${CSS}</style><div class="plan">
    <h2>Training plan</h2>
    <button type="button">Write my training plan</button>
    <p data-status aria-live="polite">Throw a few times, then ask for a plan. It is rewritten after every finished game.</p>
    <p data-focus hidden></p><ol data-steps hidden></ol><p data-progress hidden></p>
  </div>`;
  const find = name => root.querySelector(`[data-${name}]`);
  const button = root.querySelector('button');
  let state = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* shown for this session only */ } };
  function draw() {
    const plan = state.plan;
    for (const name of ['focus', 'steps', 'progress']) find(name).hidden = !plan;
    if (!plan) return;
    find('focus').textContent = plan.focus;
    find('steps').replaceChildren(...plan.steps.map(step => Object.assign(document.createElement('li'), { textContent: step })));
    find('progress').textContent = plan.progress;
    find('status').textContent = `${plan.source === 'gemini' ? 'Written by Gemini' : 'Gemini was unavailable; simple local plan'} · ${state.games.length} finished game${state.games.length === 1 ? '' : 's'} on record`;
  }
  async function update() {
    button.disabled = true;
    find('status').textContent = 'Gemini is writing your plan…';
    try {
      const previous = state.plan ? [state.plan.focus, ...state.plan.steps].join(' ').slice(0, 1200) : '';
      state.plan = await request({ games: state.games, previous });
      save();
    } catch (error) { find('status').textContent = error.message || 'Could not write a plan. Try again.'; button.disabled = false; return; }
    button.disabled = false;
    draw();
  }
  button.addEventListener('click', update);
  draw();
  return {
    get current() { return state.plan; },
    gameFinished(score) { state.games = [...state.games, score].slice(-10); save(); return update(); },
  };
}
