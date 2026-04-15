/* ===========================================================
   synth.js — Fretless / Wood bass voices (Web Audio API)
   Monophonic. Common interface:
     voice.setParams({...})
     voice.trigger({freq, time, duration, accent, slide, prevFreq})
     voice.connect(destinationNode)
   =========================================================== */

const AudioEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let masterComp = null;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive', sampleRate: 44100 });

    masterComp = ctx.createDynamicsCompressor();
    masterComp.threshold.value = -14;
    masterComp.knee.value = 24;
    masterComp.ratio.value = 3;
    masterComp.attack.value = 0.005;
    masterComp.release.value = 0.12;

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;

    masterComp.connect(masterGain).connect(ctx.destination);
    return ctx;
  }

  async function resume() {
    const c = ensureCtx();
    if (c.state !== 'running') {
      try { await c.resume(); } catch (e) {}
    }
    return c;
  }

  function getCtx() { return ctx; }
  function getBus() { return masterComp; }

  // Reused small noise buffer for wood attack
  let noiseBuf = null;
  function getNoiseBuffer() {
    if (!noiseBuf) {
      const c = ensureCtx();
      const n = Math.floor(c.sampleRate * 0.2);
      noiseBuf = c.createBuffer(1, n, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    }
    return noiseBuf;
  }

  // Soft-clip curve for fretless saturation
  let shaperCurve = null;
  function getSoftCurve() {
    if (shaperCurve) return shaperCurve;
    const n = 2048;
    shaperCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      shaperCurve[i] = Math.tanh(1.6 * x);
    }
    return shaperCurve;
  }

  return { ensureCtx, resume, getCtx, getBus, getNoiseBuffer, getSoftCurve };
})();


/* ---------------- Fretless Voice ---------------- */
class FretlessVoice {
  constructor(ctx, out) {
    this.ctx = ctx;
    // Params (defaults; overwritten by presets)
    this.params = {
      tone: 0.55,          // 0..1 → LPF cutoff
      decay: 0.55,         // 0..1 → amp decay time
      attack: 0.35,        // 0..1 → attack time
      slideTime: 0.12,     // seconds for slide
      vibrato: 0.35,       // 0..1 → vibrato depth
      body: 0.5            // 0..1 → low-shelf boost
    };

    // Oscillators — mixed sine + triangle + small saw
    this.oscSine = ctx.createOscillator(); this.oscSine.type = 'sine';
    this.oscTri  = ctx.createOscillator(); this.oscTri.type  = 'triangle';
    this.oscSaw  = ctx.createOscillator(); this.oscSaw.type  = 'sawtooth';

    this.gSine = ctx.createGain(); this.gSine.gain.value = 0.7;
    this.gTri  = ctx.createGain(); this.gTri.gain.value  = 0.45;
    this.gSaw  = ctx.createGain(); this.gSaw.gain.value  = 0.08;

    // Vibrato LFO
    this.lfo = ctx.createOscillator(); this.lfo.type = 'sine'; this.lfo.frequency.value = 4.5;
    this.lfoGain = ctx.createGain(); this.lfoGain.gain.value = 0; // cents
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.oscSine.detune);
    this.lfoGain.connect(this.oscTri.detune);
    this.lfoGain.connect(this.oscSaw.detune);

    // Filter — lowpass
    this.lpf = ctx.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.value = 900;
    this.lpf.Q.value = 0.6;

    // Low shelf for body
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'lowshelf';
    this.shelf.frequency.value = 180;
    this.shelf.gain.value = 4;

    // Gentle saturation
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = AudioEngine.getSoftCurve();
    this.shaper.oversample = '2x';

    // Amp env
    this.amp = ctx.createGain(); this.amp.gain.value = 0;

    // Wire
    this.oscSine.connect(this.gSine).connect(this.lpf);
    this.oscTri.connect(this.gTri).connect(this.lpf);
    this.oscSaw.connect(this.gSaw).connect(this.lpf);
    this.lpf.connect(this.shelf).connect(this.shaper).connect(this.amp);
    this.amp.connect(out);

    this.oscSine.start();
    this.oscTri.start();
    this.oscSaw.start();
    this.lfo.start();

    this._lastFreq = 110;
    this._freqTarget = 110;
    this._setOscFreq(110, ctx.currentTime);
  }

  _setOscFreq(f, t) {
    this.oscSine.frequency.setValueAtTime(f, t);
    this.oscTri.frequency.setValueAtTime(f, t);
    this.oscSaw.frequency.setValueAtTime(f, t);
  }
  _rampOscFreq(f, t) {
    this.oscSine.frequency.linearRampToValueAtTime(f, t);
    this.oscTri.frequency.linearRampToValueAtTime(f, t);
    this.oscSaw.frequency.linearRampToValueAtTime(f, t);
  }

  setParams(p) { Object.assign(this.params, p || {}); }

  trigger({ freq, time, duration, accent, slide, prevFreq }) {
    const t = time;
    const p = this.params;
    const ctx = this.ctx;

    // Slide: start from prevFreq, glide to freq
    const slideT = Math.max(0.01, p.slideTime);
    if (slide && prevFreq) {
      this._setOscFreq(prevFreq, t);
      this._rampOscFreq(freq, t + slideT);
    } else {
      this._setOscFreq(freq, t);
    }
    this._lastFreq = freq;

    // Filter — tone + accent boost
    const cutoffBase = 300 + p.tone * 2800;           // 300..3100 Hz
    const cutoffPeak = cutoffBase * (accent ? 1.8 : 1.25);
    this.lpf.frequency.cancelScheduledValues(t);
    this.lpf.frequency.setValueAtTime(cutoffPeak, t);
    this.lpf.frequency.exponentialRampToValueAtTime(
      Math.max(160, cutoffBase * 0.7), t + 0.25);

    // Body shelf
    this.shelf.gain.setValueAtTime(2 + p.body * 6, t);

    // Vibrato depth (cents)
    const vibDepth = p.vibrato * 18;                  // up to 18 cents
    this.lfoGain.gain.cancelScheduledValues(t);
    this.lfoGain.gain.setValueAtTime(0, t);
    this.lfoGain.gain.linearRampToValueAtTime(vibDepth, t + 0.15);

    // Amp env
    const atk = 0.006 + p.attack * 0.08;              // 6..86 ms
    const dec = 0.12 + p.decay * 0.9;                 // 120..1020 ms
    const peak = accent ? 0.95 : 0.72;
    const sustain = peak * 0.55;
    const dur = Math.max(duration, atk + 0.05);

    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setValueAtTime(this.amp.gain.value * 0.5, t);
    this.amp.gain.linearRampToValueAtTime(peak, t + atk);
    this.amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + atk + dec * 0.4);
    // release
    const rel = 0.08;
    this.amp.gain.setTargetAtTime(0.0001, t + dur, rel / 3);
  }

  hardStop(t) {
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setTargetAtTime(0.0001, t, 0.01);
  }
}


/* ---------------- Wood Voice ---------------- */
class WoodVoice {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.params = {
      tone: 0.45,
      decay: 0.45,
      attack: 0.15,
      slideTime: 0.05,
      vibrato: 0.08,
      body: 0.65
    };

    // Two oscs — sine (fundamental) + triangle (body warmth)
    this.oscSine = ctx.createOscillator(); this.oscSine.type = 'sine';
    this.oscTri  = ctx.createOscillator(); this.oscTri.type  = 'triangle';
    this.gSine = ctx.createGain(); this.gSine.gain.value = 0.9;
    this.gTri  = ctx.createGain(); this.gTri.gain.value  = 0.35;

    // Subtle vibrato
    this.lfo = ctx.createOscillator(); this.lfo.type = 'sine'; this.lfo.frequency.value = 5;
    this.lfoGain = ctx.createGain(); this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.oscSine.detune);
    this.lfoGain.connect(this.oscTri.detune);

    // Lowpass — muted tone
    this.lpf = ctx.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.value = 700;
    this.lpf.Q.value = 0.5;

    // Body bandpass — warm resonance around 180-280 Hz
    this.bp = ctx.createBiquadFilter();
    this.bp.type = 'peaking';
    this.bp.frequency.value = 220;
    this.bp.Q.value = 2.2;
    this.bp.gain.value = 6;

    // Low shelf
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'lowshelf';
    this.shelf.frequency.value = 140;
    this.shelf.gain.value = 3;

    // Amp env
    this.amp = ctx.createGain(); this.amp.gain.value = 0;

    // Wire main chain
    this.oscSine.connect(this.gSine).connect(this.lpf);
    this.oscTri.connect(this.gTri).connect(this.lpf);
    this.lpf.connect(this.bp).connect(this.shelf).connect(this.amp);
    this.amp.connect(out);

    this.oscSine.start();
    this.oscTri.start();
    this.lfo.start();

    // Attack click/noise path (re-created per hit for cleanness)
    this._out = out;

    this._lastFreq = 110;
    this._setOscFreq(110, ctx.currentTime);
  }

  _setOscFreq(f, t) {
    this.oscSine.frequency.setValueAtTime(f, t);
    this.oscTri.frequency.setValueAtTime(f, t);
  }
  _rampOscFreq(f, t) {
    this.oscSine.frequency.linearRampToValueAtTime(f, t);
    this.oscTri.frequency.linearRampToValueAtTime(f, t);
  }

  setParams(p) { Object.assign(this.params, p || {}); }

  _spawnAttackClick(t, accent, freq) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = AudioEngine.getNoiseBuffer();
    src.playbackRate.value = 1;

    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = Math.min(1400, Math.max(500, freq * 6));
    hp.Q.value = 1.1;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const peak = accent ? 0.35 : 0.22;
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

    src.connect(hp).connect(g).connect(this._out);
    src.start(t);
    src.stop(t + 0.1);
  }

  _spawnBodyResonance(t, freq, amount) {
    // Short decaying "thunk" at fundamental, filtered through bandpass
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * 1.0;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35 * amount, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18 + amount * 0.2);
    osc.connect(bp).connect(g).connect(this._out);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  trigger({ freq, time, duration, accent, slide, prevFreq }) {
    const t = time;
    const p = this.params;

    // Slide (subtle — wood normally doesn't slide, but allow it)
    const slideT = Math.max(0.01, p.slideTime);
    if (slide && prevFreq) {
      this._setOscFreq(prevFreq, t);
      this._rampOscFreq(freq, t + slideT);
    } else {
      this._setOscFreq(freq, t);
    }
    this._lastFreq = freq;

    // Filter
    const cutoffBase = 260 + p.tone * 1800;
    const cutoffPeak = cutoffBase * (accent ? 1.7 : 1.2);
    this.lpf.frequency.cancelScheduledValues(t);
    this.lpf.frequency.setValueAtTime(cutoffPeak, t);
    this.lpf.frequency.exponentialRampToValueAtTime(
      Math.max(180, cutoffBase * 0.6), t + 0.22);

    // Body peak
    const bodyFreq = 160 + p.body * 180;    // 160..340 Hz
    const bodyGain = 3 + p.body * 8;
    this.bp.frequency.setValueAtTime(bodyFreq, t);
    this.bp.gain.setValueAtTime(bodyGain, t);

    // Shelf
    this.shelf.gain.setValueAtTime(2 + p.body * 4, t);

    // Vibrato (very subtle on wood)
    const vibDepth = p.vibrato * 10;
    this.lfoGain.gain.cancelScheduledValues(t);
    this.lfoGain.gain.setValueAtTime(0, t);
    this.lfoGain.gain.linearRampToValueAtTime(vibDepth, t + 0.2);

    // Amp env
    const atk = 0.003 + p.attack * 0.035;    // 3..38 ms
    const dec = 0.14 + p.decay * 0.75;       // 140..890 ms
    const peak = accent ? 0.95 : 0.75;
    const dur = Math.max(duration, atk + 0.06);

    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setValueAtTime(this.amp.gain.value * 0.4, t);
    this.amp.gain.linearRampToValueAtTime(peak, t + atk);
    this.amp.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
    this.amp.gain.setTargetAtTime(0.0001, t + dur, 0.04);

    // Attack click
    this._spawnAttackClick(t, accent, freq);
    // Body resonance layer
    this._spawnBodyResonance(t, freq, 0.5 + p.body * 0.5);
  }

  hardStop(t) {
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setTargetAtTime(0.0001, t, 0.01);
  }
}


/* ---------------- Voice Manager ----------------
   Keeps one voice of each kind alive (reused).
   switchVoice(name) mutes the other. */
class VoiceManager {
  constructor() {
    this.current = 'fretless';
    this.voices = {};
    this.out = null;
  }
  init() {
    const ctx = AudioEngine.ensureCtx();
    const bus = AudioEngine.getBus();

    // Per-voice output gains so we can mute inactive voice
    const fOut = ctx.createGain(); fOut.gain.value = 1; fOut.connect(bus);
    const wOut = ctx.createGain(); wOut.gain.value = 0; wOut.connect(bus);

    this.voices.fretless = { voice: new FretlessVoice(ctx, fOut), gate: fOut };
    this.voices.wood     = { voice: new WoodVoice(ctx, wOut),     gate: wOut };
  }
  setVoice(name) {
    if (!this.voices[name]) return;
    const ctx = AudioEngine.getCtx();
    const now = ctx.currentTime;
    this.current = name;
    for (const k of Object.keys(this.voices)) {
      const g = this.voices[k].gate.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(k === name ? 1 : 0, now, 0.02);
    }
  }
  setParams(params) {
    if (this.voices[this.current]) this.voices[this.current].voice.setParams(params);
  }
  getVoice() { return this.voices[this.current].voice; }
  trigger(opts) {
    if (!this.voices[this.current]) return;
    this.voices[this.current].voice.trigger(opts);
  }
  allStop(t) {
    for (const k of Object.keys(this.voices)) {
      this.voices[k].voice.hardStop(t);
    }
  }
}

window.AudioEngine = AudioEngine;
window.VoiceManager = VoiceManager;
