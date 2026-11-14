// Pin-crash feedback on the phone: vibration where the browser has it, a crash sound everywhere.
// A pattern is [buzz, pause, buzz, ...] in milliseconds, as navigator.vibrate takes it.

/** Returns a safe pattern from an untrusted message, or null. */
export function validPattern(pattern) {
  return Array.isArray(pattern) && pattern.length >= 1 && pattern.length <= 12
    && pattern.every(ms => Number.isFinite(ms) && ms >= 0 && ms <= 400) ? pattern : null;
}

export function createHaptics() {
  let audio = null;
  // iPhone Safari has no vibration API. Toggling a native switch gives one system tick per toggle,
  // so each buzz in the pattern becomes a tick. Best effort: older iOS versions do nothing.
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-99px;top:0;opacity:0;pointer-events:none';
  label.innerHTML = '<input type="checkbox" switch tabindex="-1">';
  document.body.append(label);

  function crash(duration) { // a short burst of decaying noise through the phone speaker
    if (!audio || audio.state !== 'running') return;
    const length = Math.floor(audio.sampleRate * duration);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
    const source = audio.createBufferSource();
    source.buffer = buffer; source.connect(audio.destination); source.start();
  }

  return {
    /** Call from a tap: browsers only allow sound after a user gesture. */
    unlock() { try { audio ??= new AudioContext(); audio.resume(); } catch { /* sound stays off */ } },
    play(pattern) {
      const total = pattern.reduce((sum, ms) => sum + ms, 0);
      if (navigator.vibrate) navigator.vibrate(pattern);
      else {
        let at = 0;
        pattern.forEach((ms, i) => { if (i % 2 === 0) setTimeout(() => label.click(), at); at += ms; });
      }
      crash(Math.min(0.6, total / 1000));
    },
  };
}
