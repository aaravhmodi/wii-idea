import * as THREE from 'three';
import { createPhysics } from './physics.js';
import { BowlingScore, validateDrill } from './scoring.js';
import { createBowlingAudio } from './audio.js';

export function createGame(container) {
  const audio = createBowlingAudio();
  const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionPreference?.matches ?? false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe6ff');
  scene.fog = new THREE.Fog('#bfe6ff', 35, 75);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 100);
  camera.position.set(0, 8.6, 17.2); camera.lookAt(0, 0, -3.4);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;position:absolute;inset:0;';
  renderer.domElement.setAttribute('aria-label', 'Live 3D bowling lane');
  container.append(renderer.domElement);
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  scene.add(new THREE.HemisphereLight('#ffffff', '#9fc4dd', 2.4));
  const key = new THREE.DirectionalLight('#fff6e6', 3.2);
  key.position.set(-4, 14, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
  scene.add(key);
  const material = (color, roughness = .5, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const box = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); mesh.receiveShadow = true; scene.add(mesh); return mesh;
  };
  box(38, .3, 60, 0, -.7, -8, material('#eaf5fb'));
  box(5, .4, 27, 0, -.24, -3, material('#966c41'));
  // Individually shaded maple boards give the original lane its own physical texture.
  for (let i = 0; i < 23; i++) {
    const color = new THREE.Color().setHSL(.105 + (i % 3) * .003, .48, .56 + (i % 5) * .018);
    box(.199, .025, 27, (i - 11) * .203, -.005, -3, material(color, .32));
  }
  const gutter = material('#8a99a8', .25, .5);
  const rail = material('#f4f8fb', .25, .2);
  for (const side of [-1, 1]) {
    box(.38, .08, 27, side * 2.55, -.1, -3, gutter);
    box(.13, .27, 27, side * 2.8, .01, -3, rail);
    box(.035, .025, 26.7, side * 2.78, .16, -3, new THREE.MeshBasicMaterial({ color: '#2aa7e6' }));
    box(.5, .4, 27, side * 7.5, -.3, -3, rail);
    box(.03, .02, 27, side * 7.5, -.07, -3, new THREE.MeshBasicMaterial({ color: '#966c41' }));
  }
  box(4.65, .012, .055, 0, .025, 5.8, material('#3c3e42'));
  for (let i = -3; i <= 3; i++) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.075, .2, 3), material('#714d30'));
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(i * .46, .04, -1.7 + Math.abs(i) * .16); scene.add(arrow);
  }
  box(9, 4.5, .5, 0, 1.5, -15, material('#1878ba'));
  box(8.9, .22, .03, 0, 2.5, -14.72, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  box(8.9, .1, .03, 0, 2.12, -14.72, new THREE.MeshBasicMaterial({ color: '#ff9a1f' }));
  for (let i = -3; i <= 3; i++) box(.04, 1.1, .03, i * 1.1, .8, -14.7, new THREE.MeshBasicMaterial({ color: '#8fd3f7' }));

  const physics = createPhysics();
  const pinMaterial = material('#ffffff', .22);
  const redMaterial = material('#d23b2a', .25);
  const pinPoints = [[.18,-.47],[.23,-.36],[.24,-.19],[.21,0],[.12,.18],[.11,.29],[.155,.39],[.14,.48],[.08,.53],[0,.55]].map(([x,y]) => new THREE.Vector2(x,y));
  const pinGeometry = new THREE.LatheGeometry(pinPoints, 20);
  const pinMeshes = physics.pins.map(() => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(pinGeometry, pinMaterial); mesh.castShadow = true; group.add(mesh);
    for (const y of [.19,.25]) {
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(.122, .122, .035, 20), redMaterial);
      stripe.position.y = y; group.add(stripe);
    }
    scene.add(group); return group;
  });
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(.32, 32, 24), material('#1f86cc', .2));
  ballMesh.castShadow = true; scene.add(ballMesh);
  for (const [x,z] of [[-.075,.04],[.075,.04],[0,-.1]]) {
    const hole = new THREE.Mesh(new THREE.SphereGeometry(.034, 8, 8), material('#1b2238'));
    hole.position.set(x, .303, z); ballMesh.add(hole);
  }
  const target = new THREE.Group(); scene.add(target); target.visible = false;
  const targetMat = new THREE.MeshBasicMaterial({ color: '#5cb531', transparent: true, opacity: .3, depthWrite: false });
  const targetFloor = new THREE.Mesh(new THREE.PlaneGeometry(1, 8), targetMat);
  targetFloor.rotation.x = -Math.PI / 2; targetFloor.position.set(0,.032,-5); target.add(targetFloor);
  const targetLine = new THREE.Mesh(new THREE.PlaneGeometry(1, .09), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  targetLine.rotation.x = -Math.PI / 2; targetLine.position.set(0,.04,-8.5); target.add(targetLine);

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;right:16px;top:16px;z-index:2;pointer-events:none;color:#3f4852;font-family:Geist,"Segoe UI",system-ui,sans-serif;background:#fffffff2;border:1px solid #dbe6ec;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgb(40 55 70 / .04),0 14px 30px -20px rgb(40 55 70 / .22);';
  hud.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 12px"><div style='font:500 11px Geist,"Segoe UI",system-ui,sans-serif;letter-spacing:.16em;color:#0b7aa8'>MOTIONPLAY BOWL · LANE 1 <span data-frame style="margin-left:10px;letter-spacing:0;color:#66707b"></span></div><div style='font:500 11px Geist,"Segoe UI",system-ui,sans-serif;letter-spacing:.16em;color:#0b7aa8'>TOTAL <span data-total style="font-size:26px;font-weight:300;letter-spacing:-.03em;color:#3f4852;margin-left:10px"></span></div></div><div data-frames style="display:grid;grid-template-columns:repeat(9,minmax(0,1fr)) minmax(0,1.5fr);border-top:1px solid #dbe6ec"></div>`;
  container.append(hud);
  const status = document.createElement('div');
  status.style.cssText = 'position:absolute;bottom:16px;left:16px;right:16px;z-index:2;color:#3f4852;background:#fffffff2;border:1px solid #dbe6ec;border-radius:14px;box-shadow:0 14px 30px -20px rgb(40 55 70 / .22);padding:10px 16px;text-align:center;font:400 14px/1.5 Geist,"Segoe UI",system-ui,sans-serif;pointer-events:none;';
  status.setAttribute('aria-live','polite'); container.append(status);
  const celebration = document.createElement('div');
  celebration.setAttribute('aria-hidden', 'true');
  celebration.style.cssText = 'position:absolute;inset:43% 0 auto;z-index:3;text-align:center;pointer-events:none;opacity:0;color:#0b7aa8;text-shadow:0 0 28px #ffffff,0 0 6px #ffffff;letter-spacing:-.04em;font:300 clamp(48px,8vw,112px)/1 Geist,"Segoe UI",system-ui,sans-serif;';
  container.append(celebration);
  let score = new BowlingScore(), busy = false, disposed = false, drill = null;
  let activeThrow = null, raf, last = performance.now(), resultTimer = 0;
  const cameraHome = new THREE.Vector3(0, 8.6, 17.2), cameraGoal = cameraHome.clone();
  const lookAt = new THREE.Vector3(0, 0, -3.4), lookGoal = lookAt.clone();
  let onImpact = null, aimDeg = null, aimSign = 0, aimNow = 0;
  const impact = event => {
    if (!activeThrow) return;
    const strength = Math.abs(event.contact.getImpactVelocityAlongNormal());
    if (strength > 1.5) { audio.impact(strength); onImpact?.(strength); }
  };
  physics.pins.forEach(pin => pin.body.addEventListener('collide', impact));
  function updateHud() {
    hud.querySelector('[data-frame]').textContent = score.complete ? 'Game complete' : `Frame ${score.frame} / 10`;
    hud.querySelector('[data-total]').textContent = score.total;
    const list = hud.querySelector('[data-frames]'); list.replaceChildren();
    score.frames.forEach((frame, i) => {
      const cell = document.createElement('div');
      cell.style.cssText = `min-width:0;text-align:center;background:${i === score.frameIndex ? '#eaf6fb' : 'transparent'};border-left:${i ? '1px solid #dbe6ec' : '0'};font:400 12px Geist,"Segoe UI",system-ui,sans-serif;font-variant-numeric:tabular-nums;`;
      const number = document.createElement('div'); number.textContent = i + 1;
      number.style.cssText = 'padding:3px 0;color:#66707b;font-size:10px;';
      if (i === score.frameIndex) cell.setAttribute('aria-current', 'step');
      const marks = document.createElement('div'); marks.textContent = frame.length ? frame.map((n, j) => n === 10 && (j === 0 || i === 9 && frame[j-1] === 10) ? 'X' : j > 0 && n + frame[j-1] === 10 && frame[j-1] !== 10 ? '/' : n === 0 ? '–' : n).join(' ') : '·';
      marks.style.cssText = 'box-sizing:border-box;min-height:19px;padding:2px 0;white-space:nowrap;color:#3f4852;';
      // Darker red keeps small strike/spare marks at AA on paper and mustard.
      if (/[X/]/.test(marks.textContent)) marks.style.color = '#d63a2f';
      const total = document.createElement('div'); total.textContent = score.totals[i] ?? '–'; total.style.cssText = 'font-size:14px;font-weight:500;padding:3px 0 5px;border-top:1px solid #eef3f6';
      cell.append(number, marks, total); list.append(cell);
    });
  }
  function readyText() { status.textContent = score.complete ? 'All ten frames played. Start a new game to keep practicing.' : drill ? `${drill.title} · aim through the mustard target corridor` : 'Your phone is the controller. A comfortable movement is all it takes.'; }
  function finishThrow() {
    const current = activeThrow; activeThrow = null;
    const result = score.add(Math.min(score.standing, physics.collect()));
    if (drill) result.drillHit = current.drillHit;
    if (!score.complete && score.standing === 10) physics.rack(); else physics.resetBall();
    busy = false; updateHud();
    status.textContent = `${result.strike ? 'Strike!' : result.spare ? 'Spare!' : `${result.pinsDown} pins down`}${drill ? current.drillHit ? ' · Target hit' : ' · Outside target' : ''}${score.complete ? ' · Game complete' : ''}`;
    current.resolve(result);
  }
  function render(now) {
    if (disposed) return;
    const dt = Math.min((now - last) / 1000, 0.25); last = now;
    // Slow frames are caught up in slices, so a throw lasts the same real time at any frame rate.
    for (let left = dt; left > 1e-6; left -= 1 / 30) physics.step(Math.min(left, 1 / 30), activeThrow?.spin ?? 0);
    if (activeThrow) {
      activeThrow.elapsed += dt;
      if (drill && !activeThrow.crossed && physics.ball.position.z <= -8.5) {
        activeThrow.crossed = true;
        activeThrow.drillHit = physics.ball.position.y > 0 && Math.abs(physics.ball.position.x - drill.targetSide * 1.1) <= drill.laneWidth * 1.25;
      }
      if (activeThrow.elapsed > 5.5) finishThrow();
    }
    physics.pins.forEach((pin,i) => { pinMeshes[i].visible = pin.active; pinMeshes[i].position.copy(pin.body.position); pinMeshes[i].quaternion.copy(pin.body.quaternion); });
    ballMesh.position.copy(physics.ball.position); ballMesh.quaternion.copy(physics.ball.quaternion);
    // Before release the ball swings with the phone: back and up on the backswing, forward on the way through.
    aimNow += ((activeThrow || aimDeg === null ? 0 : aimDeg) - aimNow) * (activeThrow ? 1 : 0.3);
    if (Math.abs(aimNow) > 0.5) { const a = aimNow * Math.PI / 180; ballMesh.position.z += Math.sin(a) * 1.6; ballMesh.position.y += (1 - Math.cos(a)) * 1.6; }
    renderer.render(scene, camera); raf = requestAnimationFrame(render);
  }
  function resize() {
    const w = Math.max(container.clientWidth, 1), h = Math.max(container.clientHeight, 1);
    camera.aspect = w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h,false);
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize(); updateHud(); readyText(); raf = requestAnimationFrame(render);
  return {
    get busy() { return busy; },
    set onImpact(listener) { onImpact = listener; },
    /** Swing angle of the phone in degrees while it is held, or null when the hold ends. */
    aim(deg) {
      if (!Number.isFinite(deg)) { aimDeg = null; aimSign = 0; return; }
      // A gyro cannot tell back from forward on its own; whichever way the swing goes first is the backswing.
      if (!aimSign && Math.abs(deg) > 12) aimSign = Math.sign(deg);
      aimDeg = Math.max(-110, Math.min(110, aimSign ? deg * aimSign : Math.abs(deg)));
    },
    get score() { return { frames: score.frames.map(f => [...f]), totals: score.totals, total: score.total, frame: score.frame, roll: score.roll, complete: score.complete }; },
    throwBall(params) {
      if (disposed || busy || score.complete) return Promise.reject(new Error(disposed ? 'Game closed.' : busy ? 'A ball is already rolling.' : 'Game complete. Start a new game.'));
      if (!params || !Number.isFinite(params.speed) || params.speed < 0 || params.speed > 1 || !Number.isFinite(params.angle) || Math.abs(params.angle) > 1 || !Number.isFinite(params.spin) || Math.abs(params.spin) > 1) return Promise.reject(new Error('Invalid throw parameters.'));
      busy = true; physics.launch(params); status.textContent = 'Ball in motion…';
      return new Promise((resolve, reject) => { activeThrow = { resolve, reject, elapsed: 0, spin: params.spin, crossed: false, drillHit: false }; });
    },
    reset() { if (busy) throw new Error('Wait for the current throw to finish.'); score = new BowlingScore(); physics.rack(); updateHud(); readyText(); },
    setDrill(config) {
      if (busy) throw new Error('Wait for the current throw to finish.');
      drill = validateDrill(config); target.visible = !!drill;
      if (drill) { target.position.x = drill.targetSide * 1.1; targetFloor.scale.x = targetLine.scale.x = drill.laneWidth * 2.5; }
      readyText();
    },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect();
      if (activeThrow) activeThrow.reject(new Error('Game closed.'));
      scene.traverse(o => { o.geometry?.dispose(); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); });
      renderer.dispose(); renderer.domElement.remove(); hud.remove(); status.remove();
    },
  };
}
