// Shared shapes. Every module codes against these; change here first, nowhere else.

/**
 * One motion reading from the phone (DeviceMotionEvent), recorded while the swing button is held.
 * @typedef {Object} Sample
 * @property {number} t   ms since the button was pressed
 * @property {number} ax  acceleration m/s^2, phone x axis (gravity removed when the device provides it)
 * @property {number} ay  acceleration m/s^2, phone y axis (long axis, toward the top of the phone)
 * @property {number} az  acceleration m/s^2, phone z axis (out of the screen)
 * @property {number} rx  rotation rate deg/s about x (rotationRate.beta)  — the swing arc
 * @property {number} ry  rotation rate deg/s about y (rotationRate.gamma) — WRIST TWIST
 * @property {number} rz  rotation rate deg/s about z (rotationRate.alpha)
 */

/**
 * Phone -> laptop, sent once when the button is released (release = letting go of the ball).
 * @typedef {{type:'swing', samples: Sample[]}} SwingMsg
 */

/**
 * Deterministic numbers computed on the laptop from a swing.
 * @typedef {Object} Features
 * @property {number} durationMs   button-down to release
 * @property {number} peakAccel    max |a| in m/s^2
 * @property {number} peakRot      max |rx| in deg/s
 * @property {number} twistDeg     signed integral of ry over the swing, degrees (+ = clockwise seen from behind)
 * @property {number} twistTiming  0..1, where in the swing half the total |twist| was reached (0.5 = middle, <0.4 = early)
 * @property {number} smoothness   0..1, 1 = no jerk
 */

/**
 * What the game needs to roll a ball.
 * @typedef {Object} ThrowParams
 * @property {number} speed  0..1 (0 = slowest playable roll, 1 = fastest)
 * @property {number} angle  -1..1 (launch direction, 0 = dead straight, + = right)
 * @property {number} spin   -1..1 (hook, + curves right)
 */

/**
 * @typedef {Object} ThrowResult
 * @property {number} pinsDown  pins knocked by this roll
 * @property {number} frame     1..10
 * @property {number} roll      1..3 within the frame
 * @property {boolean} strike
 * @property {boolean} spare
 * @property {number} total     running game score after this roll
 */

/**
 * A swing resampled to a fixed length for drawing and comparing (not a spatial path).
 * @typedef {Object} Profile
 * @property {number[]} swing  |rx| over the swing, PROFILE_N points, deg/s
 * @property {number[]} twist  ry over the swing, PROFILE_N points, deg/s
 */

/**
 * One entry of the last-20 history kept in localStorage.
 * @typedef {{features: Features, profile: Profile, params: ThrowParams, result: ThrowResult, at: number}} ThrowRecord
 */

/**
 * Gemini's answer, also the shape of the canned fallback.
 * @typedef {Object} CoachReply
 * @property {string} insight      one or two sentences on what happened in this swing
 * @property {string} tip          one concrete thing to try next throw
 * @property {number} consistency  0..100
 */

export const MSG_SWING = 'swing';
export const HISTORY_MAX = 20;
export const PROFILE_N = 50;
