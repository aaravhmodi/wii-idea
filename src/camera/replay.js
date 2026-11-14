// Loops the webcam frames of the most recent throw (the window the phone recorded).
const FRAME_MS = 100; // matches FRAME_EVERY_MS in ./index.js

export function createReplay(container) {
  container.innerHTML = `
    <style>
      #${container.id} h2 { font: 400 22px Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif; text-transform: uppercase; margin: 0 0 8px; }
      #${container.id} img { display: block; width: 100%; border: 2px solid #1b2238; background: #1b2238; }
      #${container.id} p { margin: 6px 0 0; font: 700 12px "Courier New", ui-monospace, monospace; }
    </style>
    <h2>Last throw replay</h2>
    <img alt="Looping camera replay of your most recent throw" hidden>
    <p aria-live="polite">Turn the camera on and throw to see a replay here.</p>`;
  const image = container.querySelector('img');
  const note = container.querySelector('p');
  let timer;
  return {
    show(clip) {
      clearInterval(timer);
      if (!clip || clip.length < 2) return; // keep the previous replay on screen
      let i = 0;
      const draw = () => { image.src = `data:image/jpeg;base64,${clip[i]}`; i = (i + 1) % clip.length; };
      draw();
      image.hidden = false;
      note.textContent = `${(clip.length * FRAME_MS / 1000).toFixed(1)}s · recorded while you held the phone`;
      timer = setInterval(draw, FRAME_MS);
    },
  };
}
