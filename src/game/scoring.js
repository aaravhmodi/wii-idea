/** Ten-pin rules. Unresolved strike/spare bonuses are left pending. */
export class BowlingScore {
  constructor() { this.frames = Array.from({ length: 10 }, () => []); this.frameIndex = 0; this.complete = false; }
  get frame() { return this.frameIndex + 1; }
  get roll() { return this.frames[this.frameIndex].length + 1; }
  get standing() {
    const f = this.frames[this.frameIndex];
    if (!f.length) return 10;
    if (this.frameIndex < 9) return 10 - f[0];
    if (f.length === 1) return f[0] === 10 ? 10 : 10 - f[0];
    if (f[0] === 10) return f[1] === 10 ? 10 : 10 - f[1];
    return 10;
  }
  get totals() {
    let total = 0;
    let pending = false;
    return this.frames.map((f, i) => {
      if (pending || !f.length) { pending = true; return null; }
      if (i === 9) {
        if (!this.complete) return null;
        total += f.reduce((a, b) => a + b, 0); return total;
      }
      const later = this.frames.slice(i + 1).flat();
      const bonus = f[0] === 10 ? 2 : f.length === 2 && f[0] + f[1] === 10 ? 1 : 0;
      if ((f.length < 2 && f[0] !== 10) || later.length < bonus) { pending = true; return null; }
      total += f.reduce((a, b) => a + b, 0) + later.slice(0, bonus).reduce((a, b) => a + b, 0);
      return total;
    });
  }
  get total() { return this.totals.filter(v => v !== null).at(-1) ?? 0; }
  add(pinsDown) {
    if (this.complete) throw new Error('Game complete. Start a new game.');
    if (!Number.isInteger(pinsDown) || pinsDown < 0 || pinsDown > this.standing) throw new Error('Invalid pin count');
    const frame = this.frame, roll = this.roll, before = this.standing;
    const f = this.frames[this.frameIndex];
    f.push(pinsDown);
    const freshRack = roll === 1 || (frame === 10 && ((roll === 2 && f[0] === 10) || (roll === 3 && (f[0] !== 10 || f[1] === 10))));
    const strike = freshRack && pinsDown === 10;
    const spare = !freshRack && pinsDown === before;
    if (this.frameIndex < 9 && (strike || f.length === 2)) this.frameIndex++;
    else if (this.frameIndex === 9 && ((f.length === 2 && f[0] + f[1] < 10) || f.length === 3)) this.complete = true;
    return { pinsDown, frame, roll, strike, spare, total: this.total, complete: this.complete };
  }
}

export function validateDrill(config) {
  if (config === null) return null;
  if (!config || typeof config.title !== 'string' || config.title.length > 100 ||
      !Number.isFinite(config.laneWidth) || config.laneWidth < 0.65 || config.laneWidth > 1 ||
      !Number.isFinite(config.targetSide) || Math.abs(config.targetSide) > 1) throw new Error('Invalid drill configuration');
  return { title: config.title, laneWidth: config.laneWidth, targetSide: config.targetSide };
}
