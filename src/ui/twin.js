// Phone replay: a small 3D figure repeats the swing using the phone's gyroscope alone.
// The phone's full 3D rotation is real (swing, sideways drift and wrist twist). Where the arm was in
// space is not measurable from a phone, so the arm is drawn rigid with the phone at an assumed length.
import * as THREE from 'three';

const RAD = Math.PI / 180;

/** Integrates the gyro rates into planar angles. Returns [{ t (ms from start), swing, twist }] in degrees, starting at 0. */
export function swingAngles(samples) {
  // The swing shows up on x when the phone lies flat in the palm and on z when it is held edge-on like a remote.
  const axis = samples.reduce((sum, s) => sum + Math.abs(s.rz) - Math.abs(s.rx), 0) > 0 ? 'rz' : 'rx';
  let swing = 0, twist = 0;
  return samples.map((sample, i) => {
    if (i) {
      const dt = (sample.t - samples[i - 1].t) / 1000;
      swing += (samples[i - 1][axis] + sample[axis]) * dt / 2;
      twist += (samples[i - 1].ry + sample.ry) * dt / 2;
    }
    return { t: sample.t - samples[0].t, swing, twist };
  });
}

/**
 * The swing as 3D rotations. Returns [{ t, q }] where q (THREE.Quaternion) turns the resting arm
 * (hanging straight down, lane ahead along -z) into its pose at time t.
 * A gyro knows how the phone turned but not how it was gripped, so two things are assumed: the axis
 * the phone turned about most is the side-to-side axis of the swing, and the first excursion is the backswing.
 */
export function orientationPath(samples) {
  const rate = s => new THREE.Vector3(s.rx, s.ry, s.rz).multiplyScalar(RAD);
  // 1. Orientation relative to the start, in the phone's own starting frame.
  const q = new THREE.Quaternion(), steps = [], spread = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  samples.forEach((sample, i) => {
    if (i) {
      const w = rate(samples[i - 1]).add(rate(sample)).multiplyScalar(0.5), dt = (sample.t - samples[i - 1].t) / 1000, speed = w.length();
      if (speed > 0) q.multiply(new THREE.Quaternion().setFromAxisAngle(w.clone().divideScalar(speed), speed * dt));
      const c = w.toArray();
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) spread[a * 3 + b] += c[a] * c[b] * dt;
    }
    steps.push({ t: sample.t - samples[0].t, q: q.clone() });
  });
  // 2. The axis the phone turned about most (dominant direction of the rotation rates).
  let axis = new THREE.Vector3(1, 0.3, 0.2).normalize();
  for (let i = 0; i < 16; i++) {
    const [x, y, z] = axis.toArray();
    const next = new THREE.Vector3(spread[0] * x + spread[1] * y + spread[2] * z, spread[3] * x + spread[4] * y + spread[5] * z, spread[6] * x + spread[7] * y + spread[8] * z);
    if (next.length() < 1e-9) { axis.set(1, 0, 0); break; }
    axis = next.normalize();
  }
  // 3. The first clear excursion is the backswing: it must carry the arm back (+z), which is a negative turn about the side axis.
  const turn = step => 2 * Math.atan2(new THREE.Vector3(step.q.x, step.q.y, step.q.z).dot(axis), step.q.w);
  const first = steps.find(step => Math.abs(turn(step)) > 12 * RAD);
  if (first && turn(first) > 0) axis.negate();
  // 4. Express everything in the figure's frame: side axis = x, the resting arm = down.
  const least = Math.abs(axis.x) <= Math.abs(axis.y) && Math.abs(axis.x) <= Math.abs(axis.z) ? new THREE.Vector3(1, 0, 0) : Math.abs(axis.y) <= Math.abs(axis.z) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const down = least.sub(axis.clone().multiplyScalar(least.dot(axis))).normalize();
  const up = down.clone().negate(), back = new THREE.Vector3().crossVectors(axis, up);
  const frame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis, up, back)).invert();
  const unframe = frame.clone().invert();
  return steps.map(step => ({ t: step.t, q: frame.clone().multiply(step.q).multiply(unframe) }));
}

const CSS = `
  .twin { border: 2px solid #1b2238; background: #fffaf0; padding: 12px; display: grid; gap: 8px; }
  .twin h2 { font: 400 22px Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif; text-transform: uppercase; margin: 0; }
  .twin canvas { display: block; width: 100%; height: 280px; border: 2px solid #1b2238; background: #eef8ff; }
  .twin p { margin: 0; font-size: 12px; }
  .twin a { font-size: 12px; color: #1b2238; }
  .twin [data-numbers] { font: 700 13px "Courier New", ui-monospace, monospace; }
`;
const ARM = 0.66, SHOULDER = new THREE.Vector3(0.24, 1.42, 0), PAUSE_MS = 900;

export function createTwin(root) {
  root.innerHTML = `<style>${CSS}</style><div class="twin">
    <h2>Phone replay</h2>
    <canvas role="img" aria-label="3D replay of how your phone moved during the last throw. Throw to see it."></canvas>
    <p data-numbers aria-live="polite">Throw to see how your phone moved.</p>
    <a data-save download="swing.json" hidden>Download this swing's sensor data</a>
    <p>The phone's rotation is measured in 3D by its motion sensors. A phone cannot sense where your arm is, so the figure and arm length are a stand-in.</p>
  </div>`;
  const canvas = root.querySelector('canvas');
  const numbers = root.querySelector('[data-numbers]');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight('#ffffff', '#a9c9de', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(2, 4, 3); scene.add(sun);
  const paint = (color, roughness = 0.55) => new THREE.MeshStandardMaterial({ color, roughness });
  const add = (mesh, x, y, z, parent = scene) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };

  // Floor with a strip showing which way the lane is (away from the viewer).
  const floor = add(new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), paint('#dcedf8', 0.9)), 0, 0, 0); floor.rotation.x = -Math.PI / 2;
  const lane = add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.6), paint('#e9c98f', 0.6)), 0.24, 0.004, -0.5); lane.rotation.x = -Math.PI / 2;
  const blob = add(new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: '#33485c', transparent: true, opacity: 0.22 })), 0, 0.008, 0); blob.rotation.x = -Math.PI / 2;

  // A plain stand-in figure: head, body, legs, resting left arm.
  const body = paint('#ffffff'), shirt = paint('#1f86cc');
  add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), body), 0, 1.72, 0);
  add(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 8, 20), shirt), 0, 1.2, 0);
  for (const x of [-0.1, 0.1]) add(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 6, 14), body), x, 0.42, 0);
  add(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, ARM - 0.12, 6, 14), body), -0.27, 1.42 - ARM / 2, 0);

  // The throwing arm turns about the shoulder exactly as the phone turned.
  const arm = new THREE.Group(); arm.position.copy(SHOULDER); scene.add(arm);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), shirt), 0, 0, 0, arm);
  add(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, ARM - 0.12, 6, 14), body), 0, -ARM / 2, 0, arm);
  const phone = new THREE.Group(); phone.position.set(0, -ARM - 0.06, 0); arm.add(phone);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.33, 0.03), paint('#33485c', 0.4)), 0, 0, 0, phone);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.29, 0.01), paint('#2aa7e6', 0.25)), 0, 0, 0.018, phone); // the bright face shows the twist
  const trailMaterial = new THREE.MeshBasicMaterial({ color: '#ff9a1f' });
  let trail = null, path = null, startedAt = 0, frame = null;

  function resize() {
    const width = canvas.clientWidth || 320, height = canvas.clientHeight || 280;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const hand = q => new THREE.Vector3(0, -ARM - 0.06, 0).applyQuaternion(q).add(SHOULDER);
  function draw(q, now) {
    arm.quaternion.copy(q);
    const at = hand(q);
    blob.position.set(at.x, 0.008, at.z); blob.scale.setScalar(Math.max(0.5, 1.3 - at.y * 0.5));
    // A slow sway of the viewpoint makes the depth of the swing readable.
    const sway = Math.sin(now / 2600) * 0.45;
    camera.position.set(2.5 * Math.cos(0.55 + sway), 1.75, 2.5 * Math.sin(0.55 + sway) + 1.1);
    camera.lookAt(0.2, 0.95, 0);
    renderer.render(scene, camera);
  }
  function tick(now) {
    frame = null;
    if (!path || document.hidden) return; // restarted by show() or visibilitychange
    const total = path.at(-1).t;
    const t = Math.min((now - startedAt) % (total + PAUSE_MS), total);
    let i = path.findIndex(step => step.t >= t); if (i < 1) i = 1;
    const a = path[i - 1], b = path[i];
    draw(a.q.clone().slerp(b.q, b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)), now);
    frame = requestAnimationFrame(tick);
  }
  const restart = () => { if (path && !frame && !document.hidden) frame = requestAnimationFrame(tick); };
  document.addEventListener('visibilitychange', restart);
  new ResizeObserver(() => { resize(); draw(arm.quaternion.clone(), performance.now()); }).observe(canvas);
  resize(); draw(new THREE.Quaternion(), 0);

  return {
    show(samples) {
      path = orientationPath(samples);
      const angles = swingAngles(samples), swings = angles.map(a => a.swing);
      const save = root.querySelector('[data-save]');
      save.href = `data:application/json,${encodeURIComponent(JSON.stringify({ type: 'swing', samples }))}`;
      save.hidden = false;
      if (trail) { scene.remove(trail); trail.geometry.dispose(); trail = null; }
      const points = path.map(step => hand(step.q));
      if (points.some(p => p.distanceTo(points[0]) > 0.05)) { // a ribbon along the path of the phone
        trail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.min(200, points.length * 2), 0.014, 6), trailMaterial);
        scene.add(trail);
      }
      const summary = `Swing arc ${Math.round(Math.max(...swings) - Math.min(...swings))}° · wrist twist ${Math.round(angles.at(-1).twist)}° · ${(angles.at(-1).t / 1000).toFixed(1)}s`;
      numbers.textContent = summary;
      canvas.setAttribute('aria-label', `Looping 3D replay of your phone's movement in the last throw. ${summary}.`);
      startedAt = performance.now();
      restart();
    },
  };
}
