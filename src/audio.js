// Startup jingle and UI sounds, synthesized live with the Web Audio API (no audio files).
// The jingle is a warm pad and distant birdsong, with a rising five-note flute melody on top.
window.E2KAudio = (() => {
  let ctx = null;
  let master = null;
  const ac = () => (ctx ||= new AudioContext());

  // ---------- volume and mute (saved, and shared by the splash screen and the main window) ----------
  const read = (k, d) => { try { const v = localStorage.getItem('e2k.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem('e2k.' + k, JSON.stringify(v)); } catch {} };
  const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
  let volume = clamp(Number(read('volume', 1)));
  let muted = read('muted', read('sound', true) === false); // carries over the old "Sound Effects: off" setting
  // A squared curve makes the slider feel even; at 100% every sound plays at its designed level.
  const level = () => (muted ? 0 : volume * volume);
  const settings = {
    getVolume: () => volume,
    setVolume(v) { volume = clamp(v); write('volume', volume); if (volume > 0 && muted) settings.setMuted(false); },
    isMuted: () => muted || volume === 0,
    setMuted(m) { muted = !!m; write('muted', muted); },
    level,
  };

  // Rising D-major melody: [frequency, start time], then a final two-note flourish.
  const MELODY = [[440.0, 0.55], [587.33, 0.8], [659.25, 1.05], [739.99, 1.3], [880.0, 1.55]];
  const FINALE = [[1174.66, 2.15], [1479.98, 2.17]];

  function makeReverb(c, seconds, decay) {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    const conv = c.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  function noiseBuffer(c, seconds) {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function panner(c, out, pan) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    p.connect(out);
    return p;
  }

  // One bird chirp: a pure sine that swoops from f0 to f1, optionally with a fast trill. No noise, so it stays clean.
  function chirp(c, out, t, f0, f1, dur, vol, pan, trill = 0) {
    const p = panner(c, out, pan);
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (trill) {
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = trill;
      depth.gain.value = f0 * 0.07;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Two distant birds calling back and forth while the pad swells: [start, from Hz, to Hz, length, pan, trill Hz].
  const BIRDS = [
    [0.45, 3300, 4500, 0.07, -0.55], [0.56, 3400, 4700, 0.07, -0.55], [0.67, 3350, 4600, 0.07, -0.55], [0.8, 4800, 3600, 0.12, -0.55],
    [1.15, 4300, 5600, 0.05, 0.6], [1.24, 4300, 5700, 0.05, 0.6], [1.36, 4900, 4900, 0.16, 0.6, 32],
    [1.85, 3500, 4600, 0.07, -0.5], [1.97, 4700, 3700, 0.11, -0.5],
    [2.55, 4400, 5600, 0.05, 0.55], [2.66, 5200, 4300, 0.09, 0.55],
  ];

  // ---------- instruments: (c, out, freq, t, vol, pan, len) ----------
  const INSTRUMENTS = {
    // Mellow FM electric piano: a sine whose brightness fades as the note rings.
    epiano(c, out, f, t, v, pan) {
      const p = panner(c, out, pan);
      const car = c.createOscillator();
      const mod = c.createOscillator();
      const modGain = c.createGain();
      const amp = c.createGain();
      car.frequency.value = f;
      mod.frequency.value = f;
      modGain.gain.setValueAtTime(f * 2.2, t);
      modGain.gain.exponentialRampToValueAtTime(f * 0.25, t + 1.2);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(v * 1.1, t + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      mod.connect(modGain).connect(car.frequency);
      car.connect(amp).connect(p);
      [car, mod].forEach((o) => { o.start(t); o.stop(t + 3); });
    },

    // Breathy flute with gentle vibrato; notes are held, so the melody sings rather than strikes.
    flute(c, out, f, t, v, pan, len) {
      const p = panner(c, out, pan);
      const o = c.createOscillator();
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      const g = c.createGain();
      o.frequency.value = f;
      lfo.frequency.value = 5.2;
      lfoGain.gain.setValueAtTime(0, t);
      lfoGain.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
      lfo.connect(lfoGain).connect(o.frequency);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.65, t + 0.09);
      g.gain.setValueAtTime(v * 0.57, t + len);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.6);
      o.connect(g).connect(p);
      const breath = c.createBufferSource();
      const bp = c.createBiquadFilter();
      const bg = c.createGain();
      breath.buffer = noiseBuffer(c, len + 0.7);
      bp.type = 'bandpass';
      bp.frequency.value = f * 2;
      bp.Q.value = 2;
      bg.gain.setValueAtTime(0, t);
      bg.gain.linearRampToValueAtTime(v * 0.2, t + 0.05);
      bg.gain.exponentialRampToValueAtTime(v * 0.05, t + 0.3);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.6);
      breath.connect(bp).connect(bg).connect(p);
      [o, lfo, breath].forEach((x) => { x.start(t); x.stop(t + len + 0.7); });
    },

  };

  // `context` lets a test render the jingle into an OfflineAudioContext.
  function jingle({ volume = 0.5, context = null } = {}) {
    const c = context || ac();
    if (c.state === 'suspended' && !context) c.resume();
    if (!context) fadeOut(0.15);
    const t0 = c.currentTime + 0.05;

    if (!context && level() === 0) return;
    const out = c.createGain();
    out.gain.value = context ? volume : volume * level();
    if (!context) master = out;
    const comp = c.createDynamicsCompressor();
    out.connect(comp).connect(c.destination);

    const reverb = makeReverb(c, 3.6, 2.3);
    const wet = c.createGain();
    wet.gain.value = 0.6;
    reverb.connect(wet).connect(out);
    const dry = c.createGain();
    dry.gain.value = 0.65;
    dry.connect(out);
    const bus = c.createGain();
    bus.connect(dry);
    bus.connect(reverb);

    // Warm pad (D major 9) that opens up through a sweeping low-pass filter.
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(280, t0);
    lp.frequency.exponentialRampToValueAtTime(2800, t0 + 2.3);
    lp.frequency.exponentialRampToValueAtTime(800, t0 + 6.5);
    lp.connect(bus);
    [146.83, 220.0, 329.63, 369.99, 440.0, 554.37].forEach((f) => {
      [['sine', -5], ['triangle', 5]].forEach(([type, cents]) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = cents;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.05, t0 + 1.5);
        g.gain.setValueAtTime(0.05, t0 + 3.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 6.8);
        o.connect(g).connect(lp);
        o.start(t0);
        o.stop(t0 + 7);
      });
    });

    // Deep swell underneath.
    const sub = c.createOscillator();
    const sg = c.createGain();
    sub.frequency.value = 73.42;
    sg.gain.setValueAtTime(0, t0);
    sg.gain.linearRampToValueAtTime(0.12, t0 + 1.2);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 6);
    sub.connect(sg).connect(bus);
    sub.start(t0);
    sub.stop(t0 + 6.2);

    // Birdsong, kept quiet and softened so it sits in the distance.
    const birds = c.createGain();
    birds.gain.value = 0.5;
    const soft = c.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 6500;
    birds.connect(soft).connect(bus);
    BIRDS.forEach(([dt, f0, f1, dur, pan, trill]) => chirp(c, birds, t0 + dt, f0, f1, dur, 0.035, pan, trill));

    // Flute melody.
    const { flute } = INSTRUMENTS;
    MELODY.forEach(([f, dt], i) => {
      const next = MELODY[i + 1] ? MELODY[i + 1][1] : FINALE[0][1];
      flute(c, bus, f, t0 + dt, 0.13, i % 2 ? 0.35 : -0.35, next - dt + 0.05);
    });
    flute(c, bus, FINALE[0][0], t0 + FINALE[0][1], 0.1, -0.15, 2.2);
    flute(c, bus, FINALE[1][0], t0 + FINALE[1][1], 0.08, 0.2, 2.2);
  }

  function fadeOut(seconds = 0.4) {
    if (ctx && master) master.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
  }

  // Soft "tick" for toolbar and menu clicks.
  function click() {
    if (!level()) return;
    const c = ac();
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    g.gain.setValueAtTime(0.06 * level(), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.08);
  }

  // Short game sounds: 'correct', 'wrong', 'medal'. They share one cached reverb.
  let sfxVerb = null;
  function sfx(kind) {
    if (!level()) return;
    const c = ac();
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime + 0.02;
    const out = c.createGain();
    out.gain.value = 0.6 * level();
    out.connect(c.destination);
    if (!sfxVerb) sfxVerb = makeReverb(c, 2.4, 2.4).buffer;
    const verb = c.createConvolver();
    verb.buffer = sfxVerb;
    const wet = c.createGain();
    wet.gain.value = 0.45;
    verb.connect(wet).connect(out);
    const bus = c.createGain();
    bus.connect(out);
    bus.connect(verb);
    if (kind === 'correct') {
      INSTRUMENTS.flute(c, bus, 880.0, t, 0.14, -0.2, 0.12);
      INSTRUMENTS.flute(c, bus, 1174.66, t + 0.12, 0.14, 0.2, 0.4);
    } else if (kind === 'wrong') {
      INSTRUMENTS.epiano(c, bus, 311.13, t, 0.11, -0.1);
      INSTRUMENTS.epiano(c, bus, 277.18, t + 0.16, 0.11, 0.1);
    } else if (kind === 'medal') {
      [[587.33, 0], [739.99, 0.13], [880.0, 0.26]].forEach(([f, dt], i) => INSTRUMENTS.flute(c, bus, f, t + dt, 0.13, i % 2 ? 0.25 : -0.25, 0.12));
      INSTRUMENTS.flute(c, bus, 1174.66, t + 0.39, 0.14, 0, 1.0);
      [293.66, 369.99, 440.0, 554.37].forEach((f) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.035, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + 2.7);
      });
    }
  }

  return { jingle, fadeOut, click, sfx, ...settings };
})();
