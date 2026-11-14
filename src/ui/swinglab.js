const STYLES = `
  .swing-lab { display:grid; gap:14px; color:#1b2238; font-family:Georgia,serif; }
  .swing-lab h2,.swing-lab h3,.swing-lab p { margin:0; }
  .swing-lab h2,.swing-lab h3 { font-family:Impact,"Arial Narrow Bold",Haettenschweiler,sans-serif; font-weight:400; text-transform:uppercase; }
  .swing-lab h2 { font-size:26px; }
  .swing-lab h3 { font-size:20px; }
  .swing-lab .sl-muted { color:#54545b; font-size:12px; }
  .swing-lab .sl-heading { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .swing-lab > .sl-heading { padding-bottom:8px; border-bottom:4px double #1b2238; }
  .swing-lab .sl-card { padding:14px; background:#fffaf0; border:2px solid #1b2238; border-radius:0; }
  .swing-lab .sl-chart { display:block; box-sizing:border-box; width:100%; height:178px; margin:12px 0 8px; background:#f2e8d5; border:2px solid #1b2238; }
  .swing-lab .sl-legend { display:flex; flex-wrap:wrap; gap:10px; font-size:12px; color:#1b2238; }
  .swing-lab .sl-legend span::before { content:''; display:inline-block; width:14px; height:0; border-top:3px solid var(--line); vertical-align:middle; margin-right:5px; }
  .swing-lab .sl-legend span:last-child::before { border-top-style:dashed; }
  .swing-lab .sl-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0; border:2px solid #1b2238; background:#fffaf0; }
  .swing-lab .sl-stat { padding:12px 8px; min-width:0; border-radius:0; }
  .swing-lab .sl-stat + .sl-stat { border-left:2px solid #1b2238; }
  .swing-lab .sl-stat strong { display:block; font:700 22px "Courier New",ui-monospace,monospace; font-variant-numeric:tabular-nums; }
  .swing-lab .sl-stat span { font-size:12px; color:#54545b; }
  .swing-lab .sl-result { color:#1b2238; font:700 14px/1.45 "Courier New",ui-monospace,monospace; padding:8px 10px; border:2px solid #1b2238; border-left:6px solid #d23b2a; background:#e0a526; }
  .swing-lab .sl-coach { display:grid; gap:10px; }
  .swing-lab .sl-tip { border-left:2px solid #d23b2a; padding-left:10px; }
  .swing-lab button { border:2px solid #1b2238; background:#f2e8d5; color:#1b2238; border-radius:0; padding:6px 10px; font:400 16px Impact,"Arial Narrow Bold",Haettenschweiler,sans-serif; text-transform:uppercase; cursor:pointer; }
  .swing-lab button:hover:enabled { background:#e0a526; }
  .swing-lab button:focus-visible { outline:3px solid #1b2238; outline-offset:3px; }
  .swing-lab button:disabled { color:#54545b; background:#f2e8d5; cursor:default; }
`;

const finite = value => Number.isFinite(value) ? value : 0;

/** Compare measured angular velocity over normalized swing time, never a spatial reconstruction. */
export function createSwingLab(root) {
  root.innerHTML = `<style>${STYLES}</style><div class="swing-lab">
    <div class="sl-heading"><h2>Swing Lab</h2><span class="sl-muted">Measured motion</span></div>
    <div class="sl-card">
      <div class="sl-heading"><h3>Motion profile</h3><button type="button" data-replay disabled>Replay</button></div>
      <canvas class="sl-chart" role="img" aria-label="Swing and wrist rotation over normalized swing time. Throw a ball to see your profile."></canvas>
      <div class="sl-legend"><span style="--line:#1878ba">Swing</span><span style="--line:#d63a2f">Wrist twist</span><span style="--line:#6b7b89">Best throw (dashed)</span></div>
      <p class="sl-muted" style="margin-top:10px" data-timing>Hold, swing, release. Your motion profile will appear here.</p>
    </div>
    <div class="sl-stats">
      <div class="sl-stat"><strong data-speed>—</strong><span>Peak swing · °/s</span></div>
      <div class="sl-stat"><strong data-twist>—</strong><span>Wrist twist · °</span></div>
      <div class="sl-stat"><strong data-smooth>—</strong><span>Smoothness</span></div>
    </div>
    <p class="sl-result" data-result aria-live="polite">Ready for your first throw</p>
    <div class="sl-card sl-coach" aria-live="polite">
      <div class="sl-heading"><h3 data-coach-title>Coach</h3><span class="sl-muted" data-consistency></span></div>
      <p class="sl-muted" data-vision></p>
      <p data-insight>Your coach will review each throw.</p>
      <p class="sl-tip" data-tip>Try a comfortable, controlled swing and keep a firm grip on your phone.</p>
    </div>
  </div>`;
  const find = name => root.querySelector(`[data-${name}]`);
  const canvas = root.querySelector('canvas');
  const context = canvas.getContext('2d');
  let state = null;
  let marker = null;
  let animation = null;

  function draw() {
    if (!context) return;
    const width = Math.max(200, canvas.clientWidth || 300);
    const height = 178;
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 3);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#f3faff';
    context.fillRect(0, 0, width, height);
    const left = 31, right = width - 10, top = 16, bottom = height - 25;
    const series = [state?.profile?.swing, state?.profile?.twist, state?.bestProfile?.swing, state?.bestProfile?.twist];
    const scale = Math.max(100, ...series.flatMap(values => (values || []).map(value => Math.abs(finite(value)))));
    const center = (top + bottom) / 2;
    const y = value => center - finite(value) / scale * (bottom - top) / 2;
    context.font = 'bold 10px "Courier New", monospace';
    context.fillStyle = '#33485c';
    for (const value of [-scale, 0, scale]) {
      context.strokeStyle = '#cfe3f1';
      context.lineWidth = 1;
      context.beginPath(); context.moveTo(left, y(value)); context.lineTo(right, y(value)); context.stroke();
      context.fillText(Math.round(value).toString(), 0, y(value) + 3);
    }
    context.fillText('Start', left, height - 6);
    context.fillText('Release', right - 36, height - 6);
    for (const [i, values] of series.entries()) {
      if (!values?.length) continue;
      context.strokeStyle = i === 0 ? '#1878ba' : i === 1 ? '#d63a2f' : '#6b7b89';
      context.lineWidth = i < 2 ? 2 : 1.5;
      context.setLineDash(i < 2 ? [] : [4, 4]);
      context.globalAlpha = 1;
      context.beginPath();
      values.forEach((value, index) => {
        const x = left + index / Math.max(1, values.length - 1) * (right - left);
        if (index === 0) context.moveTo(x, y(value)); else context.lineTo(x, y(value));
      });
      context.stroke();
    }
    context.setLineDash([]);
    context.globalAlpha = 1;
    if (marker !== null) {
      context.strokeStyle = '#ff9a1f'; context.lineWidth = 2;
      const x = left + marker * (right - left);
      context.beginPath(); context.moveTo(x, top); context.lineTo(x, bottom); context.stroke();
    }
  }

  function stopReplay() {
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
    marker = null;
  }

  function replay() {
    if (!state) return;
    stopReplay();
    const start = performance.now();
    const duration = Math.max(500, Math.min(4000, state.features.durationMs));
    function tick(now) {
      marker = Math.min(1, (now - start) / duration);
      draw();
      if (marker < 1) animation = requestAnimationFrame(tick);
      else { animation = null; }
    }
    animation = requestAnimationFrame(tick);
  }
  find('replay').addEventListener('click', replay);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
  observer?.observe(canvas);
  draw();

  return {
    show({ features, profile, bestProfile = null, result = null }) {
      stopReplay();
      state = { features, profile, bestProfile };
      find('replay').disabled = false;
      find('speed').textContent = Math.round(finite(features.peakRot));
      find('twist').textContent = Math.round(finite(features.twistDeg));
      find('smooth').textContent = `${Math.round(Math.max(0, Math.min(1, finite(features.smoothness))) * 100)}%`;
      find('timing').textContent = `${(features.durationMs / 1000).toFixed(2)}s recording · ${Math.round(features.peakAccel)} m/s² peak acceleration. ${Math.abs(features.twistDeg) < 1 ? 'Minimal wrist twist.' : `Twist midpoint at ${Math.round(features.twistTiming * 100)}% of your swing.`}${bestProfile ? ' Compared with your highest pin-count throw.' : 'Your first completed throw sets the comparison.'}`;
      find('result').textContent = result ? `Frame ${result.frame} · Roll ${result.roll} · ${result.strike ? 'Strike!' : result.spare ? 'Spare!' : `${result.pinsDown} pins down`}` : 'Ball in motion…';
      canvas.setAttribute('aria-label', `Measured swing and wrist rotation over normalized time. Peak swing ${Math.round(features.peakRot)} degrees per second, wrist twist ${Math.round(features.twistDeg)} degrees.${bestProfile ? ' Dashed lines show your best throw.' : ''}`);
      draw();
    },
    setCoach(reply) {
      find('coach-title').textContent = reply?.source === 'gemini' ? 'Gemini' : reply?.source === 'fallback' ? 'Local coaching' : 'Coach';
      find('vision').textContent = reply?.vision === true ? 'Gemini looked at camera frames of this swing + phone sensors' : '';
      find('insight').textContent = reply?.insight ?? 'Reviewing your throw…';
      find('tip').textContent = reply?.tip ?? 'Watch your motion profile while the coach prepares your next tip.';
      find('consistency').textContent = reply ? `Consistency ${Math.round(Math.max(0, Math.min(100, finite(reply.consistency))))}/100` : '';
    },
    reset() {
      stopReplay();
      state = null;
      find('replay').disabled = true;
      for (const stat of ['speed', 'twist', 'smooth']) find(stat).textContent = '—';
      find('timing').textContent = 'Hold, swing, release. Your motion profile will appear here.';
      find('result').textContent = 'Ready for your first throw';
      find('coach-title').textContent = 'Coach';
      find('vision').textContent = '';
      find('consistency').textContent = '';
      find('insight').textContent = 'Your coach will review each throw.';
      find('tip').textContent = 'Try a comfortable, controlled swing and keep a firm grip on your phone.';
      canvas.setAttribute('aria-label', 'Swing and wrist rotation over normalized swing time. Throw a ball to see your profile.');
      draw();
    },
    destroy() {
      stopReplay();
      observer?.disconnect();
      find('replay').removeEventListener('click', replay);
    },
  };
}
