// Skylark Run — sound, synthesized live with WebAudio.
// No audio files: the engine is a detuned sawtooth pair through a low-pass
// filter, the wind is filtered noise, and the chimes are sine pings.
// Everything starts on the first user gesture, as browsers require.

export function createAudio() {
  let ctx = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: two saws a few cents apart, low-passed, quiet.
      engineOsc1 = ctx.createOscillator();
      engineOsc1.type = 'sawtooth';
      engineOsc1.frequency.value = 62;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 65;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc1.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc1.start();
      engineOsc2.start();
      // Wind: looped noise through a band-pass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = buf;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSource.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  // Continuous engine + wind, driven by throttle and speed each frame.
  function update(throttle, speed, flying) {
    if (!started || muted || !ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    const freq = 55 + throttle * 75 + speed * 0.35;
    engineOsc1.frequency.setTargetAtTime(freq, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(freq * 1.012, t, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
    engineGain.gain.setTargetAtTime(flying ? 0.035 + throttle * 0.05 : 0, t, 0.1);
    windFilter.frequency.setTargetAtTime(380 + speed * 6, t, 0.1);
    windGain.gain.setTargetAtTime(flying ? Math.min(0.06, speed * 0.0006) : 0, t, 0.15);
  }

  function ping(freq, when, dur, vol, type = 'sine') {
    if (!started || muted || !ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime + when);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + dur + 0.05);
  }

  function ringChime() {
    ping(880, 0, 0.5, 0.22);
    ping(1318.5, 0.07, 0.6, 0.18);
  }

  function landingFanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => ping(f, i * 0.12, 0.55, 0.2));
  }

  function crashThud() {
    if (!started || muted || !ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 0.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
    ping(220, 0.05, 0.3, 0.15, 'triangle');
  }

  function click() {
    ping(660, 0, 0.08, 0.12, 'triangle');
  }

  function toggleMute() {
    muted = !muted;
    if (started && ctx) {
      engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    }
    return muted;
  }

  return {
    ensure, update, ringChime, landingFanfare, crashThud, click,
    toggleMute, isMuted: () => muted, isStarted: () => started,
  };
}
