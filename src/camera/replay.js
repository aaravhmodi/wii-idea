// Camera replay: loops the webcam frames of the most recent throw and draws two beams over them:
// the path the hand holding the phone actually took, and the path to aim for.
import { comparePaths, pathTip } from './pose.js';

const FRAME_MS = 100; // matches FRAME_EVERY_MS in ./index.js

export function createReplay(container) {
  container.innerHTML = `
    <style>
      #${container.id} h2 { font: 400 22px Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif; text-transform: uppercase; margin: 0 0 8px; }
      #${container.id} canvas { display: block; width: 100%; border: 2px solid #1b2238; background: #1b2238; }
      #${container.id} [hidden] { display: none; }
      #${container.id} p { margin: 6px 0 0; font: 700 12px "Courier New", ui-monospace, monospace; }
      #${container.id} .legend span::before { content: ''; display: inline-block; width: 18px; height: 4px; margin-right: 5px; vertical-align: middle; background: var(--beam); }
      #${container.id} .legend span + span { margin-left: 12px; }
      #${container.id} [data-tip] { font: 14px/1.4 Georgia, serif; border-left: 4px solid #d23b2a; padding-left: 8px; }
    </style>
    <h2>Camera replay</h2>
    <canvas role="img" aria-label="Looping camera replay of your most recent throw" hidden></canvas>
    <p class="legend" hidden><span style="--beam:#d23b2a">Your hand</span><span style="--beam:#e0a526" data-target-name>Target</span></p>
    <p data-tip hidden></p>
    <p data-note aria-live="polite">Turn the camera on and throw to see a replay here.</p>`;
  const find = selector => container.querySelector(selector);
  const canvas = find('canvas'), context = canvas.getContext('2d');
  let timer;

  function beam(points, color, upTo, dashed) {
    if (points.length < 2) return;
    context.setLineDash(dashed ? [10, 7] : []);
    for (const [width, stroke] of [[9, '#1b2238'], [5, color]]) { // ink edge keeps the beam readable over any video
      context.lineWidth = width; context.strokeStyle = stroke; context.lineJoin = context.lineCap = 'round';
      context.beginPath();
      points.slice(0, upTo).forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
      context.stroke();
    }
    context.setLineDash([]);
  }

  return {
    /** cut: what camera.capture returned. target: { path, best } from an earlier throw, or null. */
    async show(cut, target) {
      const clip = cut?.clip ?? [];
      if (clip.length < 2) return; // keep the previous replay on screen
      const images = await Promise.all(clip.map(data => new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(image); image.onerror = () => resolve(null);
        image.src = `data:image/jpeg;base64,${data}`;
      })));
      const first = images.find(Boolean);
      if (!first) return;
      clearInterval(timer);
      canvas.width = first.width; canvas.height = first.height;
      // Paths are stored relative to the throwing shoulder in shoulder widths; place them on this video.
      const place = path => (cut.anchor ? path.map(([u, v]) => [cut.anchor.x * canvas.width + u * cut.anchor.width * canvas.height,
        cut.anchor.y * canvas.height + v * cut.anchor.width * canvas.height]) : []);
      const hand = place(cut.path ?? []), aim = hand.length > 1 && target ? place(target.path) : [];
      let i = 0;
      const draw = () => {
        if (images[i]) context.drawImage(images[i], 0, 0);
        beam(aim, '#e0a526', aim.length, true);
        const reached = Math.max(2, Math.round((i + 1) / images.length * hand.length));
        beam(hand, '#d23b2a', reached, false); // the hand's beam grows with the video
        if (hand.length > 1) { const [x, y] = hand[Math.min(reached, hand.length) - 1]; context.fillStyle = '#fffaf0'; context.beginPath(); context.arc(x, y, 7, 0, Math.PI * 2); context.fill(); }
        i = (i + 1) % images.length;
      };
      draw();
      canvas.hidden = false;
      find('.legend').hidden = aim.length < 2;
      find('[data-target-name]').textContent = target?.best ? 'Your best throw' : 'Smooth pendulum';
      const tip = aim.length > 1 ? pathTip(comparePaths(cut.path, target.path), target.best) : '';
      find('[data-tip]').textContent = tip; find('[data-tip]').hidden = !tip;
      find('[data-note]').textContent = hand.length > 1
        ? `${(clip.length * FRAME_MS / 1000).toFixed(1)}s · hand tracked by the laptop camera`
        : `${(clip.length * FRAME_MS / 1000).toFixed(1)}s · keep both shoulders and your throwing arm in view to see the beams`;
      canvas.setAttribute('aria-label', `Looping camera replay of your most recent throw. ${tip}`);
      timer = setInterval(draw, FRAME_MS);
    },
  };
}
