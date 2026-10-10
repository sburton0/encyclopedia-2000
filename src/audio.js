// Startup jingle and UI sounds, synthesized live with the Web Audio API (no audio files).
// The jingle is a warm pad with a rising five-note melody on top; the melody's instrument ("lead") is selectable.
window.E2KAudio = (() => {
  let ctx = null;
  let master = null;
  const ac = () => (ctx ||= new AudioContext());
  const DEFAULT_LEAD = 'flute';

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

  // Sum of sine partials with a quick strike and exponential ring-out.
  function partials(c, out, freq, t, vol, list, ring) {
    list.forEach(([mult, amp]) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring / Math.sqrt(mult));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + ring + 0.1);
    });
  }

  // ---------- melody instruments: (c, out, freq, t, vol, pan, len) ----------
  const LEADS = {
    // Glassy struck chime with inharmonic overtones (the original).
    chime(c, out, f, t, v, pan) {
      partials(c, panner(c, out, pan), f, t, v, [[1, 1], [2.756, 0.32], [5.404, 0.1]], 2.6);
    },

    // Tiny, delicate music-box tines, an octave up.
    musicbox(c, out, f, t, v, pan) {
      const jitter = Math.random() * 0.012;
      partials(c, panner(c, out, pan), f * 2, t + jitter, v * 1.2, [[1, 1], [3, 0.1], [5.93, 0.04]], 1.7);
    },

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

    // Plucked harp string (Karplus-Strong synthesis).
    harp(c, out, f, t, v, pan) {
      const sr = c.sampleRate;
      const n = Math.round(sr / f);
      const len = Math.floor(sr * 3);
      const buf = c.createBuffer(1, len, sr);
      const y = buf.getChannelData(0);
      for (let i = 0; i < n; i++) y[i] = Math.random() * 2 - 1;
      for (let i = 1; i < n; i++) y[i] = 0.5 * (y[i] + y[i - 1]); // soften the pluck
      for (let i = n; i < len; i++) y[i] = 0.996 * 0.5 * (y[i - n] + y[i - n - 1 < 0 ? 0 : i - n - 1]);
      const src = c.createBufferSource();
      const g = c.createGain();
      src.buffer = buf;
      g.gain.value = v * 4.6;
      src.connect(g).connect(panner(c, out, pan));
      src.start(t);
    },

    // Soft analog-style synth pluck with a filter sweep and a ping-pong echo.
    pluck(c, out, f, t, v, pan, _len, fx) {
      const o = c.createOscillator();
      const o2 = c.createOscillator();
      const lp = c.createBiquadFilter();
      const g = c.createGain();
      o.type = 'sawtooth';
      o2.type = 'sawtooth';
      o.frequency.value = f;
      o2.frequency.value = f;
      o2.detune.value = 9;
      lp.type = 'lowpass';
      lp.Q.value = 5;
      lp.frequency.setValueAtTime(3800, t);
      lp.frequency.exponentialRampToValueAtTime(420, t + 0.45);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.85, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(lp);
      o2.connect(lp);
      lp.connect(g);
      g.connect(panner(c, out, pan));
      g.connect(fx.echo);
      [o, o2].forEach((x) => { x.start(t); x.stop(t + 1.2); });
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

    // Wordless "aah" choir: detuned saws through vowel formant filters, swelling in.
    choir(c, out, f, t, v, pan, len) {
      const p = panner(c, out, pan);
      const mix = c.createGain();
      mix.gain.setValueAtTime(0, t);
      mix.gain.linearRampToValueAtTime(v * 0.58, t + 0.28);
      mix.gain.setValueAtTime(v * 0.52, t + len);
      mix.gain.exponentialRampToValueAtTime(0.0001, t + len + 1.4);
      mix.connect(p);
      [[700, 1, 8], [1220, 0.5, 10], [2600, 0.25, 12]].forEach(([freq, amp, q]) => {
        const bp = c.createBiquadFilter();
        const fg = c.createGain();
        bp.type = 'bandpass';
        bp.frequency.value = freq;
        bp.Q.value = q;
        fg.gain.value = amp * 3;
        bp.connect(fg).connect(mix);
        [-8, 0, 8].forEach((cents) => {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = cents;
          o.connect(bp);
          o.start(t);
          o.stop(t + len + 1.5);
        });
      });
    },
  };

  const LEAD_INFO = [
    ['chime', 'Glass chime', 'The original: bright, glassy, a little like a xylophone.'],
    ['musicbox', 'Music box', 'Tiny, delicate tines an octave higher. Sweet and nostalgic.'],
    ['epiano', 'Electric piano', 'Mellow, round, and warm, like a classic studio keyboard.'],
    ['harp', 'Harp', 'Soft plucked strings that blend naturally with the pad.'],
    ['pluck', 'Synth pluck', 'A gentle early-2000s synth with an echo bouncing left and right.'],
    ['flute', 'Flute', 'Breathy held notes with a little vibrato. Calm and airy.'],
    ['choir', 'Choir', 'Wordless "aah" voices swelling in. The most cinematic option.'],
    ['none', 'Pads only', 'No melody at all, just the pad and the low swell.'],
  ];

  // `context` lets a test render the jingle into an OfflineAudioContext.
  function jingle({ volume = 0.5, lead = DEFAULT_LEAD, context = null, melodyOnly = false } = {}) {
    const c = context || ac();
    if (c.state === 'suspended' && !context) c.resume();
    if (!context) fadeOut(0.15);
    const t0 = c.currentTime + 0.05;

    const out = c.createGain();
    out.gain.value = volume;
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
    if (!melodyOnly) lp.connect(bus);
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
    sub.connect(sg);
    if (!melodyOnly) sg.connect(bus);
    sub.start(t0);
    sub.stop(t0 + 6.2);

    // Melody.
    const play = LEADS[lead];
    if (play) {
      const fx = {};
      if (lead === 'pluck') {
        // Ping-pong echo: left and right delays feeding each other.
        const inL = c.createDelay(1), inR = c.createDelay(1);
        const fbL = c.createGain(), fbR = c.createGain();
        const pl = panner(c, bus, -0.7), pr = panner(c, bus, 0.7);
        inL.delayTime.value = 0.24;
        inR.delayTime.value = 0.24;
        fbL.gain.value = 0.38;
        fbR.gain.value = 0.38;
        inL.connect(pl); inL.connect(fbL).connect(inR);
        inR.connect(pr); inR.connect(fbR).connect(inL);
        fx.echo = inL;
      }
      MELODY.forEach(([f, dt], i) => {
        const next = MELODY[i + 1] ? MELODY[i + 1][1] : FINALE[0][1];
        play(c, bus, f, t0 + dt, 0.13, i % 2 ? 0.35 : -0.35, next - dt + 0.05, fx);
      });
      play(c, bus, FINALE[0][0], t0 + FINALE[0][1], 0.1, -0.15, 2.2, fx);
      play(c, bus, FINALE[1][0], t0 + FINALE[1][1], 0.08, 0.2, 2.2, fx);
    }
  }

  function fadeOut(seconds = 0.4) {
    if (ctx && master) master.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
  }

  // Soft "tick" for toolbar and menu clicks.
  function click() {
    const c = ac();
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.08);
  }

  // Short game sounds: 'correct', 'wrong', 'medal'. They share one cached reverb.
  let sfxVerb = null;
  function sfx(kind) {
    const c = ac();
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime + 0.02;
    const out = c.createGain();
    out.gain.value = 0.6;
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
      LEADS.flute(c, bus, 880.0, t, 0.14, -0.2, 0.12);
      LEADS.flute(c, bus, 1174.66, t + 0.12, 0.14, 0.2, 0.4);
    } else if (kind === 'wrong') {
      LEADS.epiano(c, bus, 311.13, t, 0.11, -0.1);
      LEADS.epiano(c, bus, 277.18, t + 0.16, 0.11, 0.1);
    } else if (kind === 'medal') {
      [[587.33, 0], [739.99, 0.13], [880.0, 0.26]].forEach(([f, dt], i) => LEADS.flute(c, bus, f, t + dt, 0.13, i % 2 ? 0.25 : -0.25, 0.12));
      LEADS.flute(c, bus, 1174.66, t + 0.39, 0.14, 0, 1.0);
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

  return { jingle, fadeOut, click, sfx, LEAD_INFO };
})();
