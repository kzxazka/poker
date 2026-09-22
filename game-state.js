/* ═══════════════════════════════════════════════════════════
   EVENT GOCAP — SHARED GAME STATE
   Single source of truth for both views
═══════════════════════════════════════════════════════════ */

const GAME_STATE = {
  hand: 24,
  eventStartTime: Date.now() - (83 * 60 + 42) * 1000, // 1h23m42s ago
  blindLevel: 3,
  blindSchedule: [
    { level: 1, sb: 25,  bb: 50  },
    { level: 2, sb: 50,  bb: 100 },
    { level: 3, sb: 75,  bb: 150 },
    { level: 4, sb: 100, bb: 200 },
    { level: 5, sb: 150, bb: 300 },
    { level: 6, sb: 200, bb: 400 },
    { level: 7, sb: 300, bb: 600 },
    { level: 8, sb: 400, bb: 800 },
  ],
  blindIntervalSecs: 20 * 60, // 20 min per level
  lastBlindChangeTime: Date.now() - (13 * 60 + 42) * 1000, // 13m42s into level 3
  totalMedals: 25,
  centerMedals: 11,
  centerValue: 22000,
  totalPrize: 50000,

  players: [
    { id: 1, name: 'ANDI',  chips: 2450, medals: 6,  lastTryUsed: false, status: 'ready' },
    { id: 2, name: 'BUDI',  chips: 1100, medals: 3,  lastTryUsed: false, status: 'active' },
    { id: 3, name: 'CACA',  chips: 650,  medals: 7,  lastTryUsed: false, status: 'active' },
    { id: 4, name: 'DENI',  chips: 1800, medals: 2,  lastTryUsed: false, status: 'active' },
    { id: 5, name: 'EKO',   chips: 400,  medals: 1,  lastTryUsed: true,  status: 'lasttry' },
    { id: 6, name: 'FADLI', chips: 2100, medals: 4,  lastTryUsed: false, status: 'active' },
    { id: 7, name: 'GITA',  chips: 0,    medals: 0,  lastTryUsed: true,  status: 'eliminated' },
    { id: 8, name: 'HADI',  chips: 900,  medals: 2,  lastTryUsed: false, status: 'active' },
  ],

  recentHands: [
    {
      hand: 23,
      winner: 'ANDI',
      deltas: [
        { name: 'ANDI',   medals: +3 },
        { name: 'BUDI',   medals: -2 },
        { name: 'DENI',   medals: -1 },
        { name: 'CENTER', medals: -1 },
      ]
    },
    {
      hand: 22,
      winner: 'FADLI',
      deltas: [
        { name: 'FADLI',  medals: +2 },
        { name: 'CACA',   medals: -1 },
        { name: 'CENTER', medals: -1 },
      ]
    },
    {
      hand: 21,
      winner: 'BUDI',
      deltas: [
        { name: 'BUDI',   medals: +2 },
        { name: 'CENTER', medals: -1 },
        { name: 'HADI',   medals: -1 },
      ]
    },
    {
      hand: 20,
      winner: 'EKO',
      deltas: [
        { name: 'EKO',    medals: 0, note: 'GITA ELIMINATED' },
        { name: 'GITA',   medals: 0, note: 'ELIMINATED' },
      ]
    },
  ]
};

// Persist to localStorage so operator panel changes reflect in public display
function saveState() {
  try { localStorage.setItem('gocap_state', JSON.stringify(GAME_STATE)); } catch(e) {}
}

function loadState() {
  try {
    const s = localStorage.getItem('gocap_state');
    if (s) {
      const parsed = JSON.parse(s);
      Object.assign(GAME_STATE, parsed);
    }
  } catch(e) {}
}

// helpers
function getCurrentBlind() {
  return GAME_STATE.blindSchedule[GAME_STATE.blindLevel - 1] || GAME_STATE.blindSchedule[0];
}

function getNextBlind() {
  return GAME_STATE.blindSchedule[GAME_STATE.blindLevel] || null;
}

function getBlindCountdownSecs() {
  const elapsed = (Date.now() - GAME_STATE.lastBlindChangeTime) / 1000;
  return Math.max(0, GAME_STATE.blindIntervalSecs - elapsed);
}

function formatTime(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatChips(n) {
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.0','') + 'K';
  return String(n);
}

function formatRupiah(n) {
  return 'Rp' + n.toLocaleString('id-ID').replace(/\./g, '.');
}
