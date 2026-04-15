/* ===========================================================
   sequencer.js — Look-ahead scheduler (Chris Wilson pattern)
   =========================================================== */

class Sequencer {
  constructor({ onScheduleStep }) {
    this.bpm = 120;
    this.swing = 0;           // 0..40 (% of 16th note)
    this.stepsPerBar = 16;
    this.bars = 1;
    this.totalSteps = 16;
    this.currentStep = 0;
    this.isRunning = false;

    this.lookahead = 25;          // ms
    this.scheduleAheadTime = 0.1; // sec
    this.timerId = null;
    this.nextNoteTime = 0;

    this.onScheduleStep = onScheduleStep; // (stepIdx, time, stepLen) => void

    this.scheduledQueue = []; // { step, time }
  }

  setBpm(b) { this.bpm = b; }
  setSwing(s) { this.swing = s; }
  setBars(n) {
    this.bars = n;
    this.totalSteps = this.stepsPerBar * n;
    if (this.currentStep >= this.totalSteps) this.currentStep = 0;
  }

  _stepDuration(idx) {
    // 16th note in seconds
    const sixteenth = 60 / this.bpm / 4;
    // Swing: delay odd 16ths (idx % 2 === 1)
    // The length of the even 16th gets longer, the odd one shorter — but we schedule by start times.
    // Easier: return base length; swing offset is applied when advancing nextNoteTime.
    return sixteenth;
  }

  _advanceNext() {
    const base = 60 / this.bpm / 4;
    const sw = (this.swing / 100) * base * 0.6; // up to 60% of base
    // If the step we just scheduled is even (0,2,4...), next step (odd) starts later
    // If it was odd, next step (even) starts earlier to compensate
    const justScheduled = this.currentStep;
    let delta = base;
    if (this.swing > 0) {
      if (justScheduled % 2 === 0) delta = base + sw;
      else delta = base - sw;
    }
    this.nextNoteTime += delta;
    this.currentStep = (this.currentStep + 1) % this.totalSteps;
  }

  start(ctxTime) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentStep = 0;
    this.nextNoteTime = ctxTime + 0.06;
    this.scheduledQueue.length = 0;
    this._scheduler();
  }

  stop() {
    this.isRunning = false;
    if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
    this.scheduledQueue.length = 0;
  }

  _scheduler() {
    if (!this.isRunning) return;
    const ctx = AudioEngine.getCtx();
    while (this.nextNoteTime < ctx.currentTime + this.scheduleAheadTime) {
      const stepIdx = this.currentStep;
      const t = this.nextNoteTime;
      const len = this._stepDuration(stepIdx);
      this.onScheduleStep(stepIdx, t, len);
      this.scheduledQueue.push({ step: stepIdx, time: t });
      this._advanceNext();
    }
    this.timerId = setTimeout(() => this._scheduler(), this.lookahead);
  }

  // Called from rAF loop — returns currently playing step idx for UI
  currentPlayingStep(ctxTime) {
    // Drop expired entries
    while (this.scheduledQueue.length > 1 && this.scheduledQueue[1].time <= ctxTime) {
      this.scheduledQueue.shift();
    }
    if (this.scheduledQueue.length && this.scheduledQueue[0].time <= ctxTime) {
      return this.scheduledQueue[0].step;
    }
    return -1;
  }
}

window.Sequencer = Sequencer;
