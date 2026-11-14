import * as CANNON from 'cannon-es';

export function createPhysics() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true });
  world.solver.iterations = 12;
  const laneMaterial = new CANNON.Material('lane');
  const pinMaterial = new CANNON.Material('pin');
  const ballMaterial = new CANNON.Material('ball');
  world.addContactMaterial(new CANNON.ContactMaterial(laneMaterial, ballMaterial, { friction: .025, restitution: .12 }));
  world.addContactMaterial(new CANNON.ContactMaterial(laneMaterial, pinMaterial, { friction: .32, restitution: .12 }));
  world.addContactMaterial(new CANNON.ContactMaterial(pinMaterial, pinMaterial, { friction: .2, restitution: .35 }));
  world.addContactMaterial(new CANNON.ContactMaterial(pinMaterial, ballMaterial, { friction: .18, restitution: .35 }));
  const floor = new CANNON.Body({ mass: 0, material: laneMaterial, shape: new CANNON.Box(new CANNON.Vec3(2.35, .15, 13.5)), position: new CANNON.Vec3(0, -.15, -3) });
  world.addBody(floor);
  const ball = new CANNON.Body({ mass: 5, material: ballMaterial, shape: new CANNON.Sphere(.32), linearDamping: .015, angularDamping: .02 });
  world.addBody(ball);
  const pins = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col <= row; col++) {
    const position = new CANNON.Vec3((col - row / 2) * .73, .49, -9.5 - row * .67);
    const body = new CANNON.Body({ mass: 1.3, material: pinMaterial, position: position.clone(), linearDamping: .12, angularDamping: .15, sleepTimeLimit: .6 });
    body.addShape(new CANNON.Cylinder(.15, .23, .65, 12), new CANNON.Vec3(0, -.15, 0));
    body.addShape(new CANNON.Sphere(.14), new CANNON.Vec3(0, .36, 0));
    world.addBody(body);
    pins.push({ body, origin: position, active: true });
  }
  function place(body, position) {
    body.position.copy(position); body.quaternion.set(0, 0, 0, 1);
    body.velocity.setZero(); body.angularVelocity.setZero(); body.force.setZero(); body.torque.setZero(); body.wakeUp();
    body.aabbNeedsUpdate = true;
  }
  function resetBall() { place(ball, new CANNON.Vec3(0, .33, 8)); }
  function rack() { pins.forEach(p => { p.active = true; p.body.collisionResponse = true; place(p.body, p.origin); }); resetBall(); }
  function down(pin) {
    const up = pin.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    return up.y < .78 || pin.body.position.y < .28 || Math.hypot(pin.body.position.x - pin.origin.x, pin.body.position.z - pin.origin.z) > .48;
  }
  function collect() {
    let count = 0;
    pins.forEach(p => { if (p.active && down(p)) { count++; p.active = false; p.body.collisionResponse = false; place(p.body, new CANNON.Vec3(0, -30, 0)); p.body.sleep(); } });
    // Standing pins are re-spotted to eliminate residual motion between throws.
    pins.filter(p => p.active).forEach(p => place(p.body, p.origin));
    return count;
  }
  function launch({ speed, angle, spin }) {
    resetBall();
    const velocity = 8 + speed * 8;
    ball.velocity.set(angle * 2.2, 0, -velocity);
    ball.angularVelocity.set(-velocity / .32, spin * 8, 0);
  }
  let hook = 0;
  // Apply hook on every physics substep, independent of display refresh rate.
  world.addEventListener('preStep', () => {
    if (ball.position.y > .1 && ball.position.z > -12 && Math.abs(ball.position.x) < 2.2) ball.force.x += hook * 1.8;
  });
  function step(dt, spin = 0) {
    hook = spin;
    world.step(1 / 120, dt, 8);
  }
  rack();
  return { world, ball, pins, rack, resetBall, collect, launch, step };
}
