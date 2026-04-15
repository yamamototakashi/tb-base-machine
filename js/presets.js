/* ===========================================================
   presets.js — Sound presets + demo patterns
   =========================================================== */

const SOUND_PRESETS = {
  fretless: [
    {
      id: 'singing-fretless',
      name: 'Singing Fretless',
      params: { tone: 0.70, decay: 0.75, attack: 0.30, slideTime: 0.14, vibrato: 0.55, body: 0.55 }
    },
    {
      id: 'muted-fretless',
      name: 'Muted Fretless',
      params: { tone: 0.30, decay: 0.30, attack: 0.45, slideTime: 0.10, vibrato: 0.20, body: 0.65 }
    }
  ],
  wood: [
    {
      id: 'jazz-wood',
      name: 'Jazz Wood',
      params: { tone: 0.45, decay: 0.40, attack: 0.10, slideTime: 0.04, vibrato: 0.08, body: 0.65 }
    },
    {
      id: 'deep-wood',
      name: 'Deep Wood',
      params: { tone: 0.30, decay: 0.60, attack: 0.12, slideTime: 0.04, vibrato: 0.05, body: 0.85 }
    }
  ]
};

// ----- Helpers for demo patterns -----
const N = (note, opts = {}) => Object.assign({
  active: true, note, accent: false, slide: false, octave: 0
}, opts);
const OFF = () => ({ active: false, note: 'A', accent: false, slide: false, octave: 0 });

// Note: pattern arrays are length 16
const DEMO_PATTERNS = [
  {
    id: 'walk-jazz',
    name: 'Jazz Walk',
    voice: 'wood',
    presetId: 'jazz-wood',
    bpm: 110,
    steps: [
      N('A'), OFF(), N('A'), OFF(),
      N('C', { octave: 1 }), OFF(), N('E', { octave: 1 }), OFF(),
      N('D', { octave: 1 }), OFF(), N('D', { octave: 1 }), OFF(),
      N('F', { octave: 1 }), OFF(), N('A', { octave: 1 }), OFF()
    ]
  },
  {
    id: 'singing-lines',
    name: 'Singing',
    voice: 'fretless',
    presetId: 'singing-fretless',
    bpm: 92,
    steps: [
      N('E'), OFF(), OFF(), N('G', { slide: true }),
      N('A', { accent: true }), OFF(), N('B', { slide: true }), N('C', { octave: 1 }),
      OFF(), N('B'), OFF(), N('A'),
      N('G', { accent: true }), OFF(), N('E'), OFF()
    ]
  },
  {
    id: 'latin-pulse',
    name: 'Latin',
    voice: 'wood',
    presetId: 'deep-wood',
    bpm: 118,
    steps: [
      N('D', { accent: true }), OFF(), OFF(), N('A'),
      N('D', { octave: 1 }), OFF(), N('A'), OFF(),
      N('D', { accent: true }), OFF(), OFF(), N('F', { octave: 1 }),
      N('A', { octave: 1 }), OFF(), N('F', { octave: 1 }), OFF()
    ]
  },
  {
    id: 'groove-16',
    name: 'Groove',
    voice: 'fretless',
    presetId: 'muted-fretless',
    bpm: 100,
    steps: [
      N('A', { accent: true }), OFF(), N('A'), N('A', { slide: true }),
      N('C', { octave: 1 }), OFF(), N('E', { octave: 1, slide: true }), N('D', { octave: 1 }),
      N('A', { accent: true }), OFF(), N('A'), OFF(),
      N('G'), OFF(), N('E'), N('F', { slide: true })
    ]
  }
];

window.SOUND_PRESETS = SOUND_PRESETS;
window.DEMO_PATTERNS = DEMO_PATTERNS;
