/* ═══════════════════════════════════════════════════════════
   POKER MES — SHARED GAME STATE & SUPABASE SYNC
═══════════════════════════════════════════════════════════ */

const GAME_STATE = {
  title: 'POKER MES',
  hand: 24,
  eventStartTime: Date.now() - (83 * 60 + 42) * 1000,
  countdownTotalSecs: 2 * 3600, // Default 2 hours countdown
  blindLevel: 1,
  blindSchedule: [
    { level: 1,  sb: 25,   bb: 50   },
    { level: 2,  sb: 50,   bb: 100  },
    { level: 3,  sb: 75,   bb: 150  },
    { level: 4,  sb: 100,  bb: 200  },
    { level: 5,  sb: 125,  bb: 250  },
    { level: 6,  sb: 150,  bb: 300  },
    { level: 7,  sb: 175,  bb: 350  },
    { level: 8,  sb: 200,  bb: 400  },
    { level: 9,  sb: 250,  bb: 500  },
    { level: 10, sb: 300,  bb: 600  },
    { level: 11, sb: 350,  bb: 700  },
    { level: 12, sb: 400,  bb: 800  },
  ],
  blindIntervalSecs: 15 * 60,
  lastBlindChangeTime: Date.now(),
  totalMedals: 25,
  centerMedals: 11,
  centerValue: 22000,
  totalPrize: 50000,
  currentRound: 'PRE-FLOP',
  isPaused: false,

  players: [
    { id: 1, name: 'APIS', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: 'D', currentAction: 'DEALER', sortOrder: 1 },
    { id: 2, name: 'FADLI', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: 'SB', currentAction: 'SMALL BLIND', sortOrder: 2 },
    { id: 3, name: 'NOPAL', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: 'BB', currentAction: 'BIG BLIND', sortOrder: 3 },
    { id: 4, name: 'RAFY', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: null, currentAction: null, sortOrder: 4 },
    { id: 5, name: 'UCUP', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: null, currentAction: null, sortOrder: 5 },
    { id: 6, name: 'AZKA', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: null, currentAction: null, sortOrder: 6 },
    { id: 7, name: 'ZORA', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: null, currentAction: null, sortOrder: 7 },
    { id: 8, name: 'ISMAIL', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: null, currentAction: null, sortOrder: 8 }
  ],
  recentHands: []
};

// Listeners for UI updates when state changes
const stateListeners = new Set();
function onGameStateChange(fn) {
  stateListeners.add(fn);
}
function notifyStateChanged() {
  stateListeners.forEach(fn => {
    try { fn(GAME_STATE); } catch(e) { console.error(e); }
  });
}

// ── Supabase Integration ───────────────────────────────────
function getSupabase() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabaseClient;
}

// Fetch live data from Supabase
async function fetchSupabaseState() {
  const sb = getSupabase();
  if (!sb) {
    loadLocalFallback();
    return;
  }

  try {
    // 1. Tournament metadata
    const { data: tourney, error: tErr } = await sb
      .from('tournaments')
      .select('*')
      .eq('id', 'current')
      .single();

    if (!tErr && tourney) {
      GAME_STATE.title = tourney.title || 'POKER MES';
      GAME_STATE.hand = tourney.hand || 1;
      GAME_STATE.blindLevel = tourney.blind_level || 1;
      GAME_STATE.blindIntervalSecs = tourney.blind_interval_secs || 900;
      GAME_STATE.totalMedals = tourney.total_medals || 25;
      GAME_STATE.centerMedals = tourney.center_medals ?? 11;
      GAME_STATE.centerValue = tourney.center_value || 22000;
      GAME_STATE.totalPrize = tourney.total_prize || 50000;
      GAME_STATE.currentRound = tourney.current_round || 'PRE-FLOP';
      GAME_STATE.isPaused = !!tourney.is_paused;
      GAME_STATE.anteEnabled = !!tourney.ante_enabled;
      GAME_STATE.anteValue = tourney.ante_value || 25;
      GAME_STATE.rebuyChips = tourney.rebuy_chips || 400;
      GAME_STATE.rupiahPerMedal = tourney.rupiah_per_medal || 2000;
      if (tourney.event_start_time) {
        GAME_STATE.eventStartTime = new Date(tourney.event_start_time).getTime();
      }
      if (tourney.last_blind_change_time) {
        GAME_STATE.lastBlindChangeTime = new Date(tourney.last_blind_change_time).getTime();
      }
    }

    // 2. Blind schedules from database
    const { data: blindsData, error: bErr } = await sb
      .from('blind_schedules')
      .select('*')
      .order('level', { ascending: true });

    if (!bErr && blindsData && blindsData.length > 0) {
      GAME_STATE.blindSchedule = blindsData.map(b => ({
        level: b.level,
        sb: b.sb,
        bb: b.bb,
        ante: b.ante || 0
      }));
    }

    // 3. Players list
    const { data: playersData, error: pErr } = await sb
      .from('players')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!pErr && playersData) {
      GAME_STATE.players = playersData.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        medals: p.medals,
        lastTryUsed: p.last_try_used,
        status: p.status,
        positionRole: p.position_role,
        currentAction: p.current_action,
        sortOrder: p.sort_order
      }));
    }

    // 4. Hand history
    const { data: handsData, error: hErr } = await sb
      .from('hand_history')
      .select('*')
      .order('id', { ascending: false })
      .limit(6);

    if (!hErr && handsData) {
      GAME_STATE.recentHands = handsData.map(h => ({
        hand: h.hand,
        winner: h.winner,
        deltas: typeof h.deltas === 'string' ? JSON.parse(h.deltas) : (h.deltas || [])
      }));
    }

    saveLocalState();
    notifyStateChanged();
  } catch (err) {
    console.error("Supabase fetch error, fallback to local:", err);
    loadLocalFallback();
  }
}

// Subscribe to real-time changes
function subscribeToSupabase() {
  const sb = getSupabase();
  if (!sb) return;

  sb.channel('poker-mes-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => {
      fetchSupabaseState();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
      fetchSupabaseState();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blind_schedules' }, () => {
      fetchSupabaseState();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hand_history' }, () => {
      fetchSupabaseState();
    })
    .subscribe();
}

// Save helpers for operator panel
async function syncTournamentToSupabase() {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from('tournaments').upsert({
      id: 'current',
      title: GAME_STATE.title,
      hand: GAME_STATE.hand,
      blind_level: GAME_STATE.blindLevel,
      blind_interval_secs: GAME_STATE.blindIntervalSecs,
      event_start_time: new Date(GAME_STATE.eventStartTime).toISOString(),
      last_blind_change_time: new Date(GAME_STATE.lastBlindChangeTime).toISOString(),
      total_medals: GAME_STATE.totalMedals,
      center_medals: GAME_STATE.centerMedals,
      center_value: GAME_STATE.centerValue,
      total_prize: GAME_STATE.totalPrize,
      current_round: GAME_STATE.currentRound,
      is_paused: !!GAME_STATE.isPaused,
      updated_at: new Date().toISOString()
    });
    if (error) console.error("Error syncing tournament to Supabase:", error);
  } catch (err) {
    console.error("Supabase sync exception:", err);
  }
}

async function syncPlayerToSupabase(player) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('players').upsert({
    id: player.id,
    name: player.name,
    chips: player.chips,
    medals: player.medals,
    last_try_used: player.lastTryUsed,
    status: player.status,
    position_role: player.positionRole,
    current_action: player.currentAction,
    sort_order: player.sortOrder || player.id,
    updated_at: new Date().toISOString()
  });
}

async function syncHandHistoryToSupabase(handRecord) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('hand_history').insert({
    hand: handRecord.hand,
    winner: handRecord.winner,
    total_pot: handRecord.totalPot || 0,
    deltas: handRecord.deltas
  });
}

// ── Local Fallback (Cache) ────────────────────────────────
function saveLocalState() {
  try { localStorage.setItem('poker_mes_state', JSON.stringify(GAME_STATE)); } catch(e) {}
}

function loadLocalFallback() {
  try {
    const s = localStorage.getItem('poker_mes_state');
    if (s) {
      const parsed = JSON.parse(s);
      if (parsed.players && parsed.players.length > 0) {
        Object.assign(GAME_STATE, parsed);
      } else {
        // preserve existing default players if local cache players array is empty
        const defaultPlayers = [...GAME_STATE.players];
        Object.assign(GAME_STATE, parsed);
        if (!GAME_STATE.players || GAME_STATE.players.length === 0) {
          GAME_STATE.players = defaultPlayers;
        }
      }
      notifyStateChanged();
    }
  } catch(e) {}
}

// ── Helpers ───────────────────────────────────────────────
function getCurrentBlind() {
  return GAME_STATE.blindSchedule[GAME_STATE.blindLevel - 1] || GAME_STATE.blindSchedule[0];
}

function getNextBlind() {
  return GAME_STATE.blindSchedule[GAME_STATE.blindLevel] || null;
}

function getBlindCountdownSecs() {
  const elapsed = (Date.now() - (GAME_STATE.lastBlindChangeTime || Date.now())) / 1000;
  const interval = GAME_STATE.blindIntervalSecs || 900;
  return Math.max(0, interval - elapsed);
}

function getEventCountdownSecs() {
  // Baseline reference 2 hours (7200s). Shifting eventStartTime forward increases remaining countdown for all clients.
  const baseline = 7200;
  const elapsed = (Date.now() - (GAME_STATE.eventStartTime || Date.now())) / 1000;
  return Math.max(0, baseline - elapsed);
}

// Automatically advance blind level when countdown reaches 0
function checkAndAdvanceBlindLevel() {
  if (GAME_STATE.isPaused) return false;
  if (!GAME_STATE.blindSchedule || GAME_STATE.blindSchedule.length === 0) return false;
  if (GAME_STATE.blindLevel >= GAME_STATE.blindSchedule.length) return false;

  const remain = getBlindCountdownSecs();
  if (remain <= 0) {
    GAME_STATE.blindLevel += 1;
    GAME_STATE.lastBlindChangeTime = Date.now();
    return true;
  }
  return false;
}

// Web Audio API ascending chime for Blind Level Up alert
function playBlindChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    
    // Ascending celebratory chime notes: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.13);
      gain.gain.setValueAtTime(0.22, now + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.13 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.13);
      osc.stop(now + i * 0.13 + 0.38);
    });
  } catch (e) {
    console.warn("Audio chime cannot play until user interacts:", e);
  }
}

function formatTime(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatRupiah(n) {
  return 'Rp' + (n || 0).toLocaleString('id-ID');
}

