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

const ELBOW = 13;
// Where the hand holding the phone is, in picture coordinates (0..1), or null when it cannot be told.
// A laptop camera loses the hand at the bottom of a swing; the model then guesses wildly, so an unseen
// wrist is replaced by a straight-arm estimate from the shoulder and elbow, or dropped.
export function handPoint(lm, side) {
  const seen = i => vis(lm, i) > 0.5 && Number.isFinite(lm[i]?.x) && Number.isFinite(lm[i]?.y);
  const w = lm[WRIST + side];
  if (seen(WRIST + side) && w.x > -0.05 && w.x < 1.05 && w.y > -0.05 && w.y < 1.05) return [w.x, w.y];
  if (seen(ELBOW + side) && seen(SHOULDER + side)) {
    const e = lm[ELBOW + side], sh = lm[SHOULDER + side];
    return [2 * e.x - sh.x, 2 * e.y - sh.y]; // forearm continues the upper arm
  }
  return null;
}

// 0 = left arm, 1 = right arm: the hand that travelled furthest while it could be seen. Ties go to the right arm.
export function throwingSide(samples, aspect = 4 / 3) {
  const path = [0, 0];
  for (const side of [0, 1]) {
    let previous = null;
    for (const lm of samples) {
      const p = handPoint(lm, side);
      if (p && previous) path[side] += Math.hypot((p[0] - previous[0]) * aspect, p[1] - previous[1]);
      if (p) previous = p;
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

// --- Hand path (the hand holding the phone) for the replay beams ---------------------------------
// Points are [u, v]: offset of the throwing wrist from the throwing shoulder in shoulder widths
// (u right, v down, as the camera sees it), so paths from different throws and positions compare.

/**
 * samples: landmark arrays, oldest first. Returns null, or:
 *   track  - the hand in picture coordinates [x, y] (0..1), smoothed, for drawing on the video;
 *   path   - the same points relative to the throwing shoulder in shoulder widths, for comparing throws;
 *   anchor - the average shoulder position and width, to place a stored path on this video.
 */
export function handPath(samples, aspect = 4 / 3) {
  const s = (samples ?? []).filter(visibleBody);
  if (s.length < 3) return null;
  const side = throwingSide(s, aspect);
  const width = lm => dist(pt(lm, SHOULDER, aspect), pt(lm, SHOULDER + 1, aspect));
  const seen = s.map(lm => ({ lm, hand: handPoint(lm, side) })).filter(x => x.hand && width(x.lm) > 0);
  if (seen.length < 3) return null;
  // Average each point with its neighbours: single-frame jumps of the model are what make the beam jagged.
  const smooth = seen.map((_, i) => {
    const near = seen.slice(Math.max(0, i - 1), i + 2);
    return [near.reduce((sum, x) => sum + x.hand[0], 0) / near.length, near.reduce((sum, x) => sum + x.hand[1], 0) / near.length];
  });
  const step = Math.max(1, Math.ceil(seen.length / 40)); // at most about 40 points
  const track = [], path = [];
  for (let i = 0; i < seen.length; i += step) {
    const { lm } = seen[i], sh = lm[SHOULDER + side], wide = width(lm);
    track.push(smooth[i]);
    path.push([clamp((smooth[i][0] - sh.x) * aspect / wide, -6, 6, 0), clamp((smooth[i][1] - sh.y) / wide, -6, 6, 0)]);
  }
  const mean = pick => seen.reduce((sum, x) => sum + pick(x.lm), 0) / seen.length;
  return { track, path, anchor: { x: mean(lm => lm[SHOULDER + side].x), y: mean(lm => lm[SHOULDER + side].y), width: mean(width) } };
}

/** The same swing as a smooth pendulum: every point keeps its direction from the shoulder but at one constant arm length. */
export function pendulumPath(path) {
  const radius = path.map(([u, v]) => Math.hypot(u, v)).sort((a, b) => a - b)[Math.floor(path.length / 2)];
  return path.map(([u, v]) => { const length = Math.hypot(u, v) || 1; return [u / length * radius, v / length * radius]; });
}

/** How far the hand was from the target path: mean gap, where it was largest (0..1 through the swing), and the gap at release. */
export function comparePaths(path, target) {
  const at = (points, f) => points[Math.round(f * (points.length - 1))];
  let sum = 0, worst = 0, worstAt = 0;
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const a = at(path, i / n), b = at(target, i / n), gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
    sum += gap;
    if (gap > worst) { worst = gap; worstAt = i / n; }
  }
  const end = path[path.length - 1], goal = target[target.length - 1];
  return { meanGap: sum / (n + 1), worstGap: worst, worstAt, releaseAcross: end[0] - goal[0], releaseDown: end[1] - goal[1] };
}

/** One plain sentence on how to bring the hand's beam onto the target beam. */
export function pathTip({ meanGap, worstGap, worstAt, releaseAcross, releaseDown }, best) {
  const goal = best ? 'your best throw' : 'a smooth pendulum';
  if (worstGap < 0.25) return `Your hand stayed on the path of ${goal}. Repeat that swing.`;
  const when = worstAt < 0.34 ? 'in the backswing' : worstAt < 0.67 ? 'through the middle of the swing' : 'at the release';
  const parts = [];
  if (Math.abs(releaseAcross) > 0.2) parts.push(`${Math.abs(releaseAcross).toFixed(1)} shoulder widths to the ${releaseAcross > 0 ? 'right' : 'left'} of it in the picture`);
  if (Math.abs(releaseDown) > 0.2) parts.push(`${Math.abs(releaseDown).toFixed(1)} ${releaseDown > 0 ? 'lower' : 'higher'}`);
  const finish = parts.length ? ` You finished ${parts.join(' and ')}.` : '';
  return `Your hand drifted furthest from ${goal} ${when} (${worstGap.toFixed(1)} shoulder widths, ${meanGap.toFixed(1)} on average).${finish} Bring the red beam onto the dashed one.`;
}
