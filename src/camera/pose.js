// Pure pose maths on MediaPipe Pose landmarks (33 per sample, x/y normalised 0..1, y down). No DOM.
// Left-side joint indices; the right side is index + 1.
const SHOULDER = 11, WRIST = 15;
const DEG = 180 / Math.PI;

const clamp = (v, lo, hi, fallback = lo) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const vis = (lm, i) => clamp(lm[i]?.visibility, 0, 1);
// x is scaled by the frame aspect so angles and distances are true to the picture, not the unit square.
const pt = (lm, i, aspect) => [lm[i].x * aspect, lm[i].y];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// A sample counts when both shoulders are confidently seen. A laptop camera usually shows only the
// upper body, so hips and legs are never required or measured.
export function visibleBody(lm) {
  return Array.isArray(lm) && lm.length > WRIST + 1 && [SHOULDER, SHOULDER + 1].every(i =>
    Number.isFinite(lm[i]?.x) && Number.isFinite(lm[i]?.y) && vis(lm, i) > 0.5);
}

// 0 = left arm, 1 = right arm: the wrist that travelled furthest. Ties go to the right arm.
export function throwingSide(samples, aspect = 4 / 3) {
  const path = [0, 0];
  for (let i = 1; i < samples.length; i++) {
    for (const side of [0, 1]) {
      const d = dist(pt(samples[i], WRIST + side, aspect), pt(samples[i - 1], WRIST + side, aspect));
      if (Number.isFinite(d)) path[side] += d;
    }
  }
  return path[0] > path[1] ? 0 : 1;
}

// Live readout: 0 = arm hanging straight down, 90 = level with the shoulder, 180 = straight up.
export function armAngleDeg(lm, side, aspect = 4 / 3) {
  const s = pt(lm, SHOULDER + side, aspect), w = pt(lm, WRIST + side, aspect);
  return clamp(Math.acos((w[1] - s[1]) / dist(s, w)) * DEG, 0, 180, 0);
}

// samples: landmark arrays, oldest first. Returns null with fewer than 3 visible-body samples.
export function poseStats(samples, aspect = 4 / 3) {
  const s = (samples ?? []).filter(visibleBody).slice(-200);
  if (s.length < 3) return null;
  const side = throwingSide(s, aspect);
  const used = [SHOULDER, SHOULDER + 1, WRIST + side];

  let prev = null, turned = 0, lo = 0, hi = 0, visSum = 0;
  for (const lm of s) {
    const sh = pt(lm, SHOULDER + side, aspect), w = pt(lm, WRIST + side, aspect);
    const angle = Math.atan2(w[1] - sh[1], w[0] - sh[0]) * DEG;
    if (Number.isFinite(angle)) {
      // Unwrap so a swing through the ±180° seam is not counted as a full turn.
      if (prev !== null) turned += ((angle - prev + 540) % 360) - 180;
      prev = angle;
      lo = Math.min(lo, turned);
      hi = Math.max(hi, turned);
    }
    for (const i of used) visSum += vis(lm, i);
  }

  const last = s[s.length - 1];
  const ls = pt(last, SHOULDER, aspect), rs = pt(last, SHOULDER + 1, aspect);
  return {
    samples: s.length,
    armSwingDeg: clamp(hi - lo, 0, 360),
    // How far the throwing wrist is above the shoulder line at release, in shoulder widths (negative = below).
    releaseWristHeight: clamp((mid(ls, rs)[1] - last[WRIST + side].y) / dist(ls, rs), -3, 3, 0),
    // Positive = the player's right shoulder is lower than the left.
    shoulderTiltDeg: clamp(Math.atan2(rs[1] - ls[1], Math.abs(rs[0] - ls[0])) * DEG, -90, 90, 0),
    visibility: clamp(visSum / (s.length * used.length), 0, 1),
  };
}
