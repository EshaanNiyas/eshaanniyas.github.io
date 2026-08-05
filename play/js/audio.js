// Sound is synthesised in the Web Audio API rather than downloaded: an engine
// whose pitch tracks the revs, wind that rises with speed, and discovery
// chimes. Silent until the visitor asks for it.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let wind = null;
  let enabled = false;

  function noiseBuffer(context) {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function build() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    ctx = new AudioCtx();

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    /* ------------------------------------------------------------ engine */
    // two detuned saws through a lowpass reads as an engine without a sample
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 3;

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.detune.value = -14;

    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(ctx);
    rumble.loop = true;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.06;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'bandpass';
    rumbleFilter.frequency.value = 90;

    oscA.connect(filter);
    oscB.connect(filter);
    rumble.connect(rumbleFilter).connect(rumbleGain).connect(filter);
    filter.connect(gain).connect(master);
    oscA.start();
    oscB.start();
    rumble.start();
    engine = { oscA, oscB, gain, filter };

    /* -------------------------------------------------------------- wind */
    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer(ctx);
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 520;
    windFilter.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.015;
    windSource.connect(windFilter).connect(windGain).connect(master);
    windSource.start();
    wind = { gain: windGain, filter: windFilter };

    return true;
  }

  return {
    get enabled() { return enabled; },
    toggle() {
      if (!ctx && !build()) return false;
      enabled = !enabled;
      if (enabled) ctx.resume();
      master.gain.setTargetAtTime(enabled ? 0.5 : 0, ctx.currentTime, 0.15);
      return enabled;
    },
    // speed in m/s, throttle 0..1
    update(speed, throttle) {
      if (!enabled || !ctx) return;
      const revs = Math.min(1, speed / 34);
      const now = ctx.currentTime;
      const pitch = 58 + revs * 230 + throttle * 40;
      engine.oscA.frequency.setTargetAtTime(pitch, now, 0.08);
      engine.oscB.frequency.setTargetAtTime(pitch * 0.5, now, 0.08);
      engine.filter.frequency.setTargetAtTime(420 + revs * 2200, now, 0.1);
      engine.gain.gain.setTargetAtTime(0.05 + throttle * 0.1 + revs * 0.07, now, 0.12);
      wind.gain.gain.setTargetAtTime(0.01 + revs * 0.07, now, 0.2);
      wind.filter.frequency.setTargetAtTime(420 + revs * 900, now, 0.2);
    },
    chime(step = 0) {
      if (!enabled || !ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 523.25 * Math.pow(2, step / 12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      osc.connect(gain).connect(master);
      osc.start(now);
      osc.stop(now + 1.2);
    }
  };
}
