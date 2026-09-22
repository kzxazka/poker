/* ═══════════════════════════════════════════════════════════
   POKER MES — SHARED GAME STATE & SUPABASE SYNC
═══════════════════════════════════════════════════════════ */

const GAME_STATE = {
  title: 'POKER MES',
  hand: 24,
  eventStartTime: Date.now() - (83 * 60 + 42) * 1000,
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

  players: [],
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
      GAME_STATE.hand = tourney.hand || 24;
      GAME_STATE.blindLevel = tourney.blind_level || 3;
      GAME_STATE.totalMedals = tourney.total_medals || 25;
      GAME_STATE.centerMedals = tourney.center_medals ?? 11;
      GAME_STATE.centerValue = tourney.center_value || 22000;
      GAME_STATE.totalPrize = tourney.total_prize || 50000;
      GAME_STATE.currentRound = tourney.current_round || 'PRE-FLOP';
      GAME_STATE.isPaused = !!tourney.is_paused;
      if (tourney.event_start_time) {
        GAME_STATE.eventStartTime = new Date(tourney.event_start_time).getTime();
      }
      if (tourney.last_blind_change_time) {
        GAME_STATE.lastBlindChangeTime = new Date(tourney.last_blind_change_time).getTime();
      }
    }

    // 2. Players list
    const { data: playersData, error: pErr } = await sb
      .from('players')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!pErr && playersData && playersData.length > 0) {
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

    // 3. Hand history
    const { data: handsData, error: hErr } = await sb
      .from('hand_history')
      .select('*')
      .order('id', { ascending: false })
      .limit(6);

    if (!hErr && handsData && handsData.length > 0) {
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hand_history' }, () => {
      fetchSupabaseState();
    })
    .subscribe();
}

// Save helpers for operator panel
async function syncTournamentToSupabase() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('tournaments').upsert({
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
    is_paused: GAME_STATE.isPaused,
    updated_at: new Date().toISOString()
  });
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
      Object.assign(GAME_STATE, JSON.parse(s));
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
  const elapsed = (Date.now() - GAME_STATE.lastBlindChangeTime) / 1000;
  return Math.max(0, GAME_STATE.blindIntervalSecs - elapsed);
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
