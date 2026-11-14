// Phone replay: animates how the phone moved during the last throw, from its gyroscope alone.
// The swing arc is the integrated swing rotation drawn on an arm of assumed length; the phone
// also turns by the integrated wrist twist. Relative motion only: a phone cannot know where the arm was.
import * as THREE from 'three';

/** Integrates the gyro rates into angles. Returns [{ t (ms from start), swing, twist }] in degrees, starting at 0. */
export function swingAngles(samples) {
  let swing = 0, twist = 0;
  return samples.map((sample, i) => {
    if (i) {
      const dt = (sample.t - samples[i - 1].t) / 1000;
      swing += (samples[i - 1].rx + sample.rx) * dt / 2;
      twist += (samples[i - 1].ry + sample.ry) * dt / 2;
    }
    return { t: sample.t - samples[0].t, swing, twist };
  });
}

const CSS = `
  .twin { border: 2px solid #1b2238; background: #fffaf0; padding: 12px; display: grid; gap: 8px; }
  .twin h2 { font: 400 22px Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif; text-transform: uppercase; margin: 0; }
  .twin canvas { display: block; width: 100%; height: 220px; border: 2px solid #1b2238; background: #f2e8d5; }
  .twin p { margin: 0; font-size: 12px; }
  .twin [data-numbers] { font: 700 13px "Courier New", ui-monospace, monospace; }
`;
const ARM = 2.2, PAUSE_MS = 700;

export function createTwin(root) {
  root.innerHTML = `<style>${CSS}</style><div class="twin">
    <h2>Phone replay</h2>
    <canvas role="img" aria-label="Replay of how your phone moved during the last throw. Throw to see it."></canvas>
    <p data-numbers aria-live="polite">Throw to see how your phone moved.</p>
    <p>Built from the phone's motion sensors: the swing arc and wrist twist are real, the arm length is assumed.</p>
  </div>`;
  const canvas = root.querySelector('canvas');
  const numbers = root.querySelector('[data-numbers]');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, -0.4, 8.4); camera.lookAt(0, -0.4, 0); // faces the swing plane, so the arc is seen in full
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9ae98', 2.6));
  const ink = new THREE.MeshStandardMaterial({ color: '#1b2238', roughness: 0.6 });
  const pivot = new THREE.Group(); scene.add(pivot); // the shoulder
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, ARM, 0.07), ink); arm.position.y = -ARM / 2; pivot.add(arm);
  const phone = new THREE.Group(); phone.position.y = -ARM; pivot.add(phone);
  phone.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.85, 0.07), ink));
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.76, 0.02), new THREE.MeshStandardMaterial({ color: '#d23b2a', roughness: 0.4 }));
  screen.position.z = 0.04; phone.add(screen); // the red face shows the twist
  const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#e0a526' })); scene.add(trail);
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), ink); scene.add(shoulder);

  let angles = null, startedAt = 0, frame = null;
  const rad = THREE.MathUtils.degToRad;
  function resize() {
    const width = canvas.clientWidth || 300, height = canvas.clientHeight || 220;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  function pose(swing, twist) { pivot.rotation.z = rad(swing); phone.rotation.y = rad(twist); }
  function tick(now) {
    frame = null;
    if (!angles || document.hidden) return; // restarted by show() or visibilitychange
    const total = angles.at(-1).t;
    const t = Math.min((now - startedAt) % (total + PAUSE_MS), total);
    let i = angles.findIndex(a => a.t >= t); if (i < 1) i = 1;
    const a = angles[i - 1], b = angles[i], f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    pose(a.swing + (b.swing - a.swing) * f, a.twist + (b.twist - a.twist) * f);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }
  const restart = () => { if (angles && !frame && !document.hidden) frame = requestAnimationFrame(tick); };
  document.addEventListener('visibilitychange', restart);
  new ResizeObserver(() => { resize(); renderer.render(scene, camera); }).observe(canvas);
  resize(); pose(0, 0); renderer.render(scene, camera);

  return {
    show(samples) {
      angles = swingAngles(samples);
      const swings = angles.map(a => a.swing), twist = angles.at(-1).twist;
      const arc = Math.max(...swings) - Math.min(...swings);
      trail.geometry.setFromPoints(angles.map(a => new THREE.Vector3(0, -ARM, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), rad(a.swing))));
      const summary = `Swing arc ${Math.round(arc)}° · wrist twist ${Math.round(twist)}° · ${(angles.at(-1).t / 1000).toFixed(1)}s`;
      numbers.textContent = summary;
      canvas.setAttribute('aria-label', `Looping replay of your phone's movement in the last throw. ${summary}.`);
      startedAt = performance.now();
      restart();
    },
  };
}
