/* ===========================================================
   app.js — Main wiring / state / UI
   =========================================================== */

(() => {
  // ---------- Constants ----------
  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const SHARP_SET = new Set(['C#','D#','F#','G#','A#']);
  const STEPS = 16;
  const BASE_MIDI = 36; // C2

  // ---------- State ----------
  const state = {
    voice: 'fretless',
    presetId: 'singing-fretless',
    bpm: 120,
    swing: 0,
    params: Object.assign({}, SOUND_PRESETS.fretless[0].params),
    steps: makeEmptySteps(STEPS),
    selectedStep: 0,
    isPlaying: false
  };

  const voiceMgr = new VoiceManager();
  let seq = null;

  // ---------- DOM ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const splash = $('#splash');
  const app = $('#app');
  const startBtn = $('#startBtn');

  const playBtn = $('#playBtn');
  const clearBtn = $('#clearBtn');
  const bpmValueEl = $('#bpmValue');
  const bpmSlVal = $('#bpmSlVal');
  const bpmSlider = $('#bpmSlider');
  const swingSlider = $('#swingSlider');
  const swingVal = $('#swingVal');

  const stepGrid = $('#stepGrid');
  const keyboard = $('#keyboard');
  const presetRow = $('#presetRow');
  const demoRow = $('#demoRow');
  const paramsGrid = $('#paramsGrid');

  const togActive = $('#togActive');
  const togAccent = $('#togAccent');
  const togSlide = $('#togSlide');
  const editorStepIdx = $('#editorStepIdx');

  const randomBtn = $('#randomBtn');
  const saveBtn = $('#saveBtn');
  const loadBtn = $('#loadBtn');
  const exportBtn = $('#exportBtn');

  const toast = $('#toast');

  // ---------- Utility ----------
  function makeEmptySteps(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({
      active: false, note: 'A', accent: false, slide: false, octave: 0
    });
    return arr;
  }

  function noteToMidi(name, octaveShift) {
    const idx = NOTE_NAMES.indexOf(name);
    return BASE_MIDI + idx + octaveShift * 12;
  }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function stepFreq(s) { return midiToFreq(noteToMidi(s.note, s.octave)); }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 1400);
  }

  // ---------- Build UI ----------
  function buildStepGrid() {
    stepGrid.innerHTML = '';
    for (let i = 0; i < STEPS; i++) {
      const el = document.createElement('div');
      el.className = 'step';
      el.dataset.idx = i;
      el.innerHTML = `
        <div class="step-num">${i + 1}</div>
        <div class="step-oct"></div>
        <div class="step-note">—</div>
        <div class="marks">
          <div class="mark acc"></div>
          <div class="mark sli"></div>
        </div>`;
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        onStepTap(i);
      });
      stepGrid.appendChild(el);
    }
  }

  function buildKeyboard() {
    keyboard.innerHTML = '';
    for (let i = 0; i < NOTE_NAMES.length; i++) {
      const name = NOTE_NAMES[i];
      const el = document.createElement('button');
      el.className = 'key' + (SHARP_SET.has(name) ? ' sharp' : '');
      el.dataset.note = name;
      el.textContent = name;
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        onKeyTap(name);
      });
      keyboard.appendChild(el);
    }
  }

  function buildPresetRow() {
    presetRow.innerHTML = '';
    const list = SOUND_PRESETS[state.voice];
    list.forEach(p => {
      const el = document.createElement('button');
      el.className = 'preset-chip' + (p.id === state.presetId ? ' active' : '');
      el.textContent = p.name;
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        applyPreset(p.id);
      });
      presetRow.appendChild(el);
    });
  }

  function buildDemoRow() {
    demoRow.innerHTML = '';
    DEMO_PATTERNS.forEach(d => {
      const el = document.createElement('button');
      el.className = 'demo-chip';
      el.textContent = d.name;
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        loadPattern(d);
        showToast(`Demo: ${d.name}`);
      });
      demoRow.appendChild(el);
    });
  }

  const PARAM_DEFS = [
    { key: 'tone',      label: 'TONE',  min: 0, max: 1, step: 0.01 },
    { key: 'decay',     label: 'DECAY', min: 0, max: 1, step: 0.01 },
    { key: 'attack',    label: 'ATTACK',min: 0, max: 1, step: 0.01 },
    { key: 'slideTime', label: 'SLIDE', min: 0.01, max: 0.3, step: 0.005 },
    { key: 'vibrato',   label: 'VIBRA', min: 0, max: 1, step: 0.01 },
    { key: 'body',      label: 'BODY',  min: 0, max: 1, step: 0.01 }
  ];

  function buildParams() {
    paramsGrid.innerHTML = '';
    PARAM_DEFS.forEach(def => {
      const wrap = document.createElement('div');
      wrap.className = 'param';
      wrap.innerHTML = `
        <div class="param-label"><span>${def.label}</span><span class="val">0</span></div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" />
      `;
      const slider = wrap.querySelector('input');
      const val = wrap.querySelector('.val');
      slider.value = state.params[def.key];
      val.textContent = formatParamVal(def.key, slider.value);
      slider.addEventListener('input', () => {
        state.params[def.key] = parseFloat(slider.value);
        val.textContent = formatParamVal(def.key, slider.value);
        voiceMgr.setParams(state.params);
      });
      paramsGrid.appendChild(wrap);
    });
  }

  function formatParamVal(key, v) {
    const f = parseFloat(v);
    if (key === 'slideTime') return (f * 1000).toFixed(0) + 'ms';
    return Math.round(f * 100) + '';
  }

  function refreshParamSliders() {
    $$('.param').forEach((wrap, i) => {
      const def = PARAM_DEFS[i];
      const slider = wrap.querySelector('input');
      const val = wrap.querySelector('.val');
      slider.value = state.params[def.key];
      val.textContent = formatParamVal(def.key, slider.value);
    });
  }

  // ---------- UI → State handlers ----------
  function onStepTap(i) {
    const wasSelected = (state.selectedStep === i);
    const step = state.steps[i];
    if (!step.active) {
      step.active = true;
      state.selectedStep = i;
    } else if (!wasSelected) {
      state.selectedStep = i;
    } else {
      // already selected & active → toggle off
      step.active = false;
    }
    renderSteps();
    renderEditor();
  }

  function onKeyTap(name) {
    const s = state.steps[state.selectedStep];
    s.note = name;
    if (!s.active) s.active = true;
    renderSteps();
    renderEditor();
  }

  function toggleStepProp(prop) {
    const s = state.steps[state.selectedStep];
    s[prop] = !s[prop];
    if (prop === 'active' && s.active === false) {
      // leave selection intact
    } else if (!s.active && (prop === 'accent' || prop === 'slide')) {
      s.active = true;
    }
    renderSteps();
    renderEditor();
  }

  function setStepOctave(o) {
    const s = state.steps[state.selectedStep];
    s.octave = o;
    if (!s.active) s.active = true;
    renderSteps();
    renderEditor();
  }

  // ---------- Render ----------
  function renderSteps() {
    const cells = stepGrid.children;
    for (let i = 0; i < STEPS; i++) {
      const s = state.steps[i];
      const el = cells[i];
      el.classList.toggle('active', s.active);
      el.classList.toggle('selected', i === state.selectedStep);
      el.querySelector('.step-note').textContent = s.active ? s.note : '—';
      const octEl = el.querySelector('.step-oct');
      octEl.textContent = s.octave === 0 ? '' : (s.octave > 0 ? '+1' : '-1');
      const marks = el.querySelectorAll('.mark');
      marks[0].classList.toggle('acc', s.accent);
      marks[1].classList.toggle('sli', s.slide);
      // opacity for marks
      marks[0].style.opacity = s.accent ? 1 : 0.25;
      marks[1].style.opacity = s.slide ? 1 : 0.25;
    }
  }

  function renderEditor() {
    const s = state.steps[state.selectedStep];
    editorStepIdx.textContent = (state.selectedStep + 1);
    togActive.classList.toggle('active', s.active);
    togAccent.classList.toggle('active', s.accent);
    togSlide.classList.toggle('active', s.slide);

    $$('.oct-group .chip').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.oct, 10) === s.octave);
    });

    $$('.key', keyboard).forEach(el => {
      el.classList.toggle('active', el.dataset.note === s.note && s.active);
    });
  }

  function renderVoiceTabs() {
    $$('.voice-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.voice === state.voice);
    });
  }

  function renderPresets() {
    $$('.preset-chip', presetRow).forEach((el, i) => {
      el.classList.toggle('active', SOUND_PRESETS[state.voice][i].id === state.presetId);
    });
  }

  // ---------- Voice / preset ----------
  function applyVoice(name) {
    if (state.voice === name) return;
    state.voice = name;
    // pick first preset of that voice
    const first = SOUND_PRESETS[name][0];
    state.presetId = first.id;
    state.params = Object.assign({}, first.params);
    voiceMgr.setVoice(name);
    voiceMgr.setParams(state.params);
    buildPresetRow();
    renderVoiceTabs();
    refreshParamSliders();
  }

  function applyPreset(id) {
    const list = SOUND_PRESETS[state.voice];
    const p = list.find(x => x.id === id);
    if (!p) return;
    state.presetId = id;
    state.params = Object.assign({}, p.params);
    voiceMgr.setParams(state.params);
    renderPresets();
    refreshParamSliders();
  }

  // ---------- Scheduler wiring ----------
  let lastScheduledFreq = null;
  let lastScheduledWasActive = false;

  function onScheduleStep(stepIdx, time, stepLen) {
    const s = state.steps[stepIdx];
    if (!s.active) {
      // if we had an active note and next is inactive → don't cut early; natural release
      lastScheduledWasActive = false;
      return;
    }
    const freq = stepFreq(s);
    const duration = s.slide ? stepLen * 1.9 : stepLen * 0.85;
    voiceMgr.trigger({
      freq,
      time,
      duration,
      accent: s.accent,
      slide: s.slide && lastScheduledWasActive,
      prevFreq: lastScheduledFreq
    });
    lastScheduledFreq = freq;
    lastScheduledWasActive = true;
  }

  // ---------- rAF loop for visual step highlight ----------
  let lastPlayingStep = -1;
  function rafLoop() {
    if (seq && seq.isRunning) {
      const ctx = AudioEngine.getCtx();
      if (ctx) {
        const idx = seq.currentPlayingStep(ctx.currentTime);
        if (idx !== lastPlayingStep) {
          const cells = stepGrid.children;
          if (lastPlayingStep >= 0 && cells[lastPlayingStep])
            cells[lastPlayingStep].classList.remove('playing');
          if (idx >= 0 && cells[idx])
            cells[idx].classList.add('playing');
          lastPlayingStep = idx;
        }
      }
    } else if (lastPlayingStep >= 0) {
      const cells = stepGrid.children;
      if (cells[lastPlayingStep]) cells[lastPlayingStep].classList.remove('playing');
      lastPlayingStep = -1;
    }
    requestAnimationFrame(rafLoop);
  }

  // ---------- Transport ----------
  function play() {
    if (state.isPlaying) return;
    const ctx = AudioEngine.getCtx();
    lastScheduledFreq = null;
    lastScheduledWasActive = false;
    seq.setBpm(state.bpm);
    seq.setSwing(state.swing);
    seq.start(ctx.currentTime);
    state.isPlaying = true;
    playBtn.classList.add('active');
  }
  function stop() {
    if (!state.isPlaying) return;
    seq.stop();
    const ctx = AudioEngine.getCtx();
    voiceMgr.allStop(ctx.currentTime);
    state.isPlaying = false;
    playBtn.classList.remove('active');
  }
  function togglePlay() { state.isPlaying ? stop() : play(); }

  // ---------- Randomize ----------
  function randomize() {
    // Musically-safe pentatonic/dorian pool depending on voice
    const roots = ['A','C','D','E','G'];
    const pool = state.voice === 'wood'
      ? ['A','C','D','E','G']
      : ['A','B','C','D','E','G'];
    const density = 0.55;
    for (let i = 0; i < STEPS; i++) {
      const s = state.steps[i];
      const active = Math.random() < density;
      s.active = active;
      if (active) {
        s.note = pool[Math.floor(Math.random() * pool.length)];
        s.octave = Math.random() < 0.2 ? 1 : (Math.random() < 0.15 ? -1 : 0);
        s.accent = Math.random() < 0.18 && (i % 4 === 0 || i % 4 === 2);
        s.slide = Math.random() < 0.18;
      } else {
        s.accent = false;
        s.slide = false;
        s.octave = 0;
      }
    }
    // Ensure step 1 is active and on root
    state.steps[0].active = true;
    state.steps[0].note = roots[Math.floor(Math.random() * roots.length)];
    state.steps[0].accent = true;
    state.steps[0].octave = 0;
    state.steps[0].slide = false;
    state.selectedStep = 0;
    renderSteps(); renderEditor();
  }

  // ---------- Pattern IO ----------
  function buildPatternSnapshot(name) {
    return {
      name: name || ('Pattern ' + new Date().toLocaleTimeString()),
      voice: state.voice,
      presetId: state.presetId,
      bpm: state.bpm,
      swing: state.swing,
      params: Object.assign({}, state.params),
      steps: state.steps.map(s => Object.assign({}, s)),
      bars: 1
    };
  }

  function loadPattern(p) {
    if (!p) return;
    stop();
    state.voice = p.voice || 'fretless';
    state.presetId = p.presetId || SOUND_PRESETS[state.voice][0].id;
    state.bpm = p.bpm || 120;
    state.swing = p.swing || 0;
    state.params = Object.assign({}, SOUND_PRESETS[state.voice][0].params, p.params || {});
    state.steps = (p.steps && p.steps.length === STEPS)
      ? p.steps.map(s => Object.assign({ active: false, note: 'A', accent: false, slide: false, octave: 0 }, s))
      : makeEmptySteps(STEPS);
    state.selectedStep = 0;

    voiceMgr.setVoice(state.voice);
    voiceMgr.setParams(state.params);
    buildPresetRow();
    renderVoiceTabs();
    renderPresets();
    refreshParamSliders();
    bpmSlider.value = state.bpm;
    bpmSlVal.textContent = state.bpm;
    bpmValueEl.textContent = state.bpm;
    swingSlider.value = state.swing;
    swingVal.textContent = state.swing + '%';
    renderSteps(); renderEditor();
    if (seq) { seq.setBpm(state.bpm); seq.setSwing(state.swing); }
  }

  function saveCurrent() {
    const snap = buildPatternSnapshot();
    Storage.save(snap);
    Storage.saveLast(snap);
    showToast('Saved');
  }
  function loadLatest() {
    const p = Storage.loadLatest();
    if (p) { loadPattern(p); showToast('Loaded: ' + p.name); }
    else showToast('No saved pattern');
  }
  function exportJson() {
    const snap = buildPatternSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bassmachine-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
    showToast('Exported JSON');
  }

  // ---------- Bindings ----------
  function bindUI() {
    playBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); togglePlay(); });
    clearBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      state.steps = makeEmptySteps(STEPS);
      state.selectedStep = 0;
      renderSteps(); renderEditor();
      showToast('Cleared');
    });

    $$('.voice-tab').forEach(el => {
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        applyVoice(el.dataset.voice);
      });
    });

    togActive.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleStepProp('active'); });
    togAccent.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleStepProp('accent'); });
    togSlide.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleStepProp('slide'); });

    $$('.oct-group .chip').forEach(el => {
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        setStepOctave(parseInt(el.dataset.oct, 10));
      });
    });

    bpmSlider.addEventListener('input', () => {
      state.bpm = parseInt(bpmSlider.value, 10);
      bpmSlVal.textContent = state.bpm;
      bpmValueEl.textContent = state.bpm;
      if (seq) seq.setBpm(state.bpm);
    });
    swingSlider.addEventListener('input', () => {
      state.swing = parseInt(swingSlider.value, 10);
      swingVal.textContent = state.swing + '%';
      if (seq) seq.setSwing(state.swing);
    });

    randomBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); randomize(); });
    saveBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); saveCurrent(); });
    loadBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); loadLatest(); });
    exportBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); exportJson(); });

    // Prevent iOS double-tap zoom on control surfaces
    ['gesturestart','gesturechange','gestureend'].forEach(evt => {
      document.addEventListener(evt, (e) => e.preventDefault());
    });
  }

  // ---------- Boot ----------
  async function boot() {
    await AudioEngine.resume();
    voiceMgr.init();
    voiceMgr.setVoice(state.voice);
    voiceMgr.setParams(state.params);

    seq = new Sequencer({ onScheduleStep });
    seq.setBpm(state.bpm);
    seq.setSwing(state.swing);

    buildStepGrid();
    buildKeyboard();
    buildPresetRow();
    buildDemoRow();
    buildParams();
    bindUI();

    // initial load — load last saved if any, else first demo
    const last = Storage.getLast();
    if (last) loadPattern(last);
    else loadPattern(DEMO_PATTERNS[0]);

    renderVoiceTabs();
    renderSteps();
    renderEditor();

    splash.classList.add('hidden');
    app.classList.remove('hidden');

    requestAnimationFrame(rafLoop);
  }

  // One-shot start trigger
  function onStart() {
    startBtn.removeEventListener('pointerdown', onStart);
    boot().catch(err => {
      console.error(err);
      alert('Audio init failed: ' + err.message);
    });
  }
  startBtn.addEventListener('pointerdown', onStart, { once: true });

  // Also handle visibility: stop when backgrounded (iOS will anyway)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.isPlaying) {
      stop();
    }
  });
})();
