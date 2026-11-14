// Small, locally synthesized bowling sounds. No downloads and no autoplay.
export function createBowlingAudio() {
  let context, master, noise, rolling, enabled = true, lastImpact = -1;
  function stopRoll() {
    if (!rolling) return;
    rolling.source.stop(); rolling.source.disconnect(); rolling.filter.disconnect(); rolling.gain.disconnect();
    rolling = null;
  }
  function ready() { return enabled && context?.state === 'running'; }
  function tone(frequency, time, duration, volume = .12) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(.001, time); gain.gain.exponentialRampToValueAtTime(volume, time + .008);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    oscillator.connect(gain); gain.connect(master); oscillator.start(time); oscillator.stop(time + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  return {
    async unlock() {
      try {
        if (!context) {
          const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!Audio) return false;
          context = new Audio(); master = context.createGain(); master.gain.value = enabled ? .38 : 0;
          master.connect(context.destination);
          noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
          const values = noise.getChannelData(0);
          for (let i = 0; i < values.length; i++) values[i] = Math.random() * 2 - 1;
        }
        await context.resume(); return context.state === 'running';
      } catch { return false; }
    },
    setEnabled(value) {
      enabled = !!value;
      if (master) master.gain.setTargetAtTime(enabled ? .38 : 0, context.currentTime, .025);
      if (!enabled) stopRoll();
    },
    roll(speed) {
      stopRoll();
      if (!ready()) return;
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      source.buffer = noise; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = 220 + speed * 160;
      gain.gain.value = .16 + speed * .08;
      source.connect(filter); filter.connect(gain); gain.connect(master); source.start();
      rolling = { source, filter, gain };
    },
    impact(strength) {
      if (!ready() || context.currentTime - lastImpact < .065) return;
      lastImpact = context.currentTime;
      tone(160 + Math.min(strength, 12) * 22, lastImpact, .1, .22);
      tone(780, lastImpact, .045, .08);
    },
    result(result) {
      stopRoll();
      if (!ready()) return;
      const notes = result.strike ? [523.25, 659.25, 783.99, 1046.5] : result.spare ? [523.25, 659.25, 783.99] : [392, 523.25];
      notes.forEach((note, index) => tone(note, context.currentTime + index * .085, .3, .14));
    },
    stop: stopRoll,
    dispose() { stopRoll(); if (context && context.state !== 'closed') void context.close().catch(() => {}); },
  };
}
