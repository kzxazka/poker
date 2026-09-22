/* ═══════════════════════════════════════════════════════════
   POKER MES — SHARED GAME STATE & SUPABASE SYNC
═══════════════════════════════════════════════════════════ */

// Suggested roster used only by the launcher form. A public/operator view must never
// invent players when no tournament has been created yet.
const DEFAULT_PLAYERS = [
  { id: 1, name: 'PLAYER 1', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: 'D', currentAction: null, sortOrder: 1 },
  { id: 2, name: 'PLAYER 2', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: 'SB', currentAction: null, sortOrder: 2 },
  { id: 3, name: 'PLAYER 3', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: 'BB', currentAction: null, sortOrder: 3 },
  { id: 4, name: 'PLAYER 4', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: null, currentAction: null, sortOrder: 4 },
  { id: 5, name: 'PLAYER 5', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: null, currentAction: null, sortOrder: 5 },
  { id: 6, name: 'PLAYER 6', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: null, currentAction: null, sortOrder: 6 },
  { id: 7, name: 'PLAYER 7', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: null, currentAction: null, sortOrder: 7 },
  { id: 8, name: 'PLAYER 8', chips: 1600, medals: 0, lastTryUsed: false, status: 'active', positionRole: null, currentAction: null, sortOrder: 8 }
];

// All values below are clean defaults — the real data comes from Supabase
// which is populated by launchTournament() in launcher.html.
const GAME_STATE = {
  title: 'POKER MES',
  hand: 1,
  eventStartTime: Date.now(),             // Will be overwritten by Supabase
  countdownTotalSecs: 2 * 3600,           // Default 2 hours, overwritten by setup
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
  lastBlindChangeTime: Date.now(),         // Will be overwritten by Supabase
  totalMedals: 25,                         // Default, overwritten by setup
  centerMedals: 25,                        // Starts equal to totalMedals
  centerValue: 50000,                      // = totalMedals * rupiahPerMedal
  totalPrize: 50000,
  currentRound: 'PRE-FLOP',
  activeTurnPlayerId: null,                // Set by launchTournament
  currentBet: 0,
  pot: 0,
  currentHandContributions: {},
  roundBets: {},
  actedInRound: [],
  foldedPlayerIds: [],
  lastRaiserId: null,
  isPaused: false,
  stateVersion: 0,
  lastUpdated: 0,                          // 0 = no local data yet, always accept Supabase

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

// Clear the in-memory and browser-cached game so a database reset cannot revive
// an old tournament on this device. The launcher supplies its own suggested roster.
function resetGameStateMemory() {
  Object.assign(GAME_STATE, {
    title: 'POKER MES',
    hand: 1,
    eventStartTime: Date.now(),
    countdownTotalSecs: 2 * 3600,
    blindLevel: 1,
    blindSchedule: [],
    blindIntervalSecs: 15 * 60,
    lastBlindChangeTime: Date.now(),
    totalMedals: 25,
    centerMedals: 25,
    centerValue: 50000,
    totalPrize: 50000,
    currentRound: 'PRE-FLOP',
    activeTurnPlayerId: null,
    currentBet: 0,
    pot: 0,
    currentHandContributions: {},
    roundBets: {},
    actedInRound: [],
    foldedPlayerIds: [],
    lastRaiserId: null,
    isPaused: false,
    stateVersion: 0,
    lastUpdated: 0,
    players: [],
    recentHands: []
  });
  lastSavedStateString = '';
  try { localStorage.removeItem('poker_mes_state'); } catch (e) {}
  notifyStateChanged();
}

// ── Unified High-Speed Sync Channels (0ms Local + ~20ms Cross-Device WebSocket) ──
const REALTIME_ROOM = 'poker_mes_live_sync';
let supabaseLiveChannel = null;

let stateBroadcastChannel = null;
if (typeof window !== 'undefined' && window.BroadcastChannel) {
  try {
    stateBroadcastChannel = new BroadcastChannel('poker_mes_bus');
    stateBroadcastChannel.onmessage = (event) => {
      if (event && event.data) {
        handleIncomingBroadcast(event.data);
      }
    };
  } catch (e) {
    console.warn("BroadcastChannel error:", e);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'poker_mes_state' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed) {
          applyStateUpdate(parsed, false, parsed.stateVersion, parsed.lastUpdated, false);
        }
      } catch (err) {}
    } else if (e.key === 'poker_mes_state' && e.newValue === null) {
      // A reset in another tab/device cleared the browser cache.
      resetGameStateMemory();
    }
  });
}

function broadcastState(type = 'STATE_UPDATE', payload = null) {
  GAME_STATE.stateVersion = (GAME_STATE.stateVersion || 0) + 1;
  GAME_STATE.lastUpdated = Date.now();

  const msg = {
    type: type,
    state: GAME_STATE,
    payload: payload,
    version: GAME_STATE.stateVersion,
    timestamp: GAME_STATE.lastUpdated
  };

  // 1. Cross-tab local channel (0ms latency on same machine)
  if (stateBroadcastChannel) {
    try {
      stateBroadcastChannel.postMessage(msg);
    } catch (e) {}
  }

  // 2. Supabase Realtime WebSocket broadcast (~20-40ms on mobile / PC)
  if (supabaseLiveChannel) {
    try {
      supabaseLiveChannel.send({
        type: 'broadcast',
        event: 'FAST_STATE_SYNC',
        payload: msg
      });
    } catch (e) {}
  }
}

function handleIncomingBroadcast(data) {
  if (!data) return;
  if (data.type === 'BLIND_UP' && data.payload) {
    if (data.payload.level && data.payload.level > GAME_STATE.blindLevel) {
      GAME_STATE.blindLevel = data.payload.level;
      GAME_STATE.lastBlindChangeTime = data.payload.lastBlindChangeTime || Date.now();
    }
  } else if (data.type === 'TIME_UPDATE' && data.payload) {
    if (data.payload.eventStartTime !== undefined) GAME_STATE.eventStartTime = data.payload.eventStartTime;
    if (data.payload.lastBlindChangeTime !== undefined) GAME_STATE.lastBlindChangeTime = data.payload.lastBlindChangeTime;
  }
  if (data.state) {
    applyStateUpdate(data.state, false, data.version, data.timestamp);
  } else {
    notifyStateChanged();
  }
}

function applyStateUpdate(incoming, shouldBroadcast = true, incomingVersion = 0, incomingTimestamp = 0, shouldSaveLocal = true) {
  if (!incoming) return;

  const ts = incomingTimestamp || incoming.lastUpdated || 0;
  const inVer = incomingVersion || incoming.stateVersion || 0;

  // Guard against stale or identical updates causing ping-pong loops
  if (inVer && GAME_STATE.stateVersion && inVer < GAME_STATE.stateVersion) {
    return;
  }
  if (ts && GAME_STATE.lastUpdated && ts < GAME_STATE.lastUpdated) {
    return;
  }
  if (inVer && ts && inVer === GAME_STATE.stateVersion && ts === GAME_STATE.lastUpdated) {
    return;
  }

  GAME_STATE.stateVersion = inVer || (GAME_STATE.stateVersion || 0) + 1;
  GAME_STATE.lastUpdated = ts || Date.now();

  if (incoming.title !== undefined) GAME_STATE.title = incoming.title;
  if (incoming.hand !== undefined) GAME_STATE.hand = incoming.hand;
  if (incoming.blindLevel !== undefined) GAME_STATE.blindLevel = incoming.blindLevel;
  if (incoming.blindIntervalSecs !== undefined) GAME_STATE.blindIntervalSecs = incoming.blindIntervalSecs;
  if (incoming.totalMedals !== undefined) GAME_STATE.totalMedals = incoming.totalMedals;
  if (incoming.centerMedals !== undefined) GAME_STATE.centerMedals = incoming.centerMedals;
  if (incoming.centerValue !== undefined) GAME_STATE.centerValue = incoming.centerValue;
  if (incoming.totalPrize !== undefined) GAME_STATE.totalPrize = incoming.totalPrize;
  if (incoming.currentRound !== undefined) GAME_STATE.currentRound = incoming.currentRound;
  if (incoming.activeTurnPlayerId !== undefined) GAME_STATE.activeTurnPlayerId = incoming.activeTurnPlayerId;
  if (incoming.currentBet !== undefined) GAME_STATE.currentBet = incoming.currentBet;
  if (incoming.pot !== undefined) GAME_STATE.pot = incoming.pot;
  if (incoming.currentHandContributions) GAME_STATE.currentHandContributions = incoming.currentHandContributions;
  if (incoming.roundBets) GAME_STATE.roundBets = incoming.roundBets;
  if (incoming.actedInRound) GAME_STATE.actedInRound = incoming.actedInRound;
  if (incoming.foldedPlayerIds) GAME_STATE.foldedPlayerIds = incoming.foldedPlayerIds;
  if (incoming.lastRaiserId !== undefined) GAME_STATE.lastRaiserId = incoming.lastRaiserId;
  if (incoming.isPaused !== undefined) GAME_STATE.isPaused = incoming.isPaused;
  if (incoming.eventStartTime !== undefined) GAME_STATE.eventStartTime = incoming.eventStartTime;
  if (incoming.countdownTotalSecs !== undefined) GAME_STATE.countdownTotalSecs = incoming.countdownTotalSecs;
  if (incoming.lastBlindChangeTime !== undefined) GAME_STATE.lastBlindChangeTime = incoming.lastBlindChangeTime;

  if (incoming.players && incoming.players.length > 0) {
    GAME_STATE.players = incoming.players;
  }
  if (incoming.recentHands && incoming.recentHands.length > 0) {
    GAME_STATE.recentHands = incoming.recentHands;
  }
  if (incoming.blindSchedule && incoming.blindSchedule.length > 0) {
    GAME_STATE.blindSchedule = incoming.blindSchedule;
  }

  if (shouldSaveLocal) {
    saveLocalState(false);
  }
  notifyStateChanged();

  if (shouldBroadcast) {
    broadcastState('STATE_UPDATE');
  }
}

function applyTournamentRow(tourney) {
  if (!tourney) return;
  if (tourney.updated_at && GAME_STATE.lastUpdated) {
    const rowTime = new Date(tourney.updated_at).getTime();
    if (rowTime < GAME_STATE.lastUpdated - 2000) return;
  }
  GAME_STATE.title = tourney.title || GAME_STATE.title;
  GAME_STATE.hand = tourney.hand || GAME_STATE.hand;
  GAME_STATE.blindLevel = tourney.blind_level || GAME_STATE.blindLevel;
  GAME_STATE.blindIntervalSecs = tourney.blind_interval_secs || GAME_STATE.blindIntervalSecs;
  GAME_STATE.totalMedals = tourney.total_medals || GAME_STATE.totalMedals;
  GAME_STATE.centerMedals = tourney.center_medals ?? GAME_STATE.centerMedals;
  GAME_STATE.centerValue = tourney.center_value || GAME_STATE.centerValue;
  if (tourney.total_prize !== undefined) GAME_STATE.totalPrize = tourney.total_prize;
  GAME_STATE.isPaused = !!tourney.is_paused;
  if (tourney.event_start_time) {
    GAME_STATE.eventStartTime = new Date(tourney.event_start_time).getTime();
  }
  if (tourney.last_blind_change_time) {
    GAME_STATE.lastBlindChangeTime = new Date(tourney.last_blind_change_time).getTime();
  }
  if (tourney.current_round) {
    try {
      if (typeof tourney.current_round === 'string' && tourney.current_round.startsWith('{')) {
        const rData = JSON.parse(tourney.current_round);
        GAME_STATE.currentRound = rData.round || 'PRE-FLOP';
        GAME_STATE.activeTurnPlayerId = rData.turnId !== undefined ? rData.turnId : null;
        GAME_STATE.pot = rData.pot || 0;
        GAME_STATE.currentBet = rData.currentBet || 0;
        if (rData.foldedPlayerIds) GAME_STATE.foldedPlayerIds = rData.foldedPlayerIds;
        if (rData.actedInRound) GAME_STATE.actedInRound = rData.actedInRound;
        if (rData.contributions) GAME_STATE.currentHandContributions = rData.contributions;
        if (rData.roundBets) GAME_STATE.roundBets = rData.roundBets;
        if (rData.lastRaiserId !== undefined) GAME_STATE.lastRaiserId = rData.lastRaiserId;
        if (rData.forfeitedInHand) GAME_STATE.forfeitedInHand = rData.forfeitedInHand;
        if (rData.forfeitedMedalsInPot !== undefined) GAME_STATE.forfeitedMedalsInPot = rData.forfeitedMedalsInPot;
      } else {
        GAME_STATE.currentRound = tourney.current_round;
      }
    } catch (e) {
      GAME_STATE.currentRound = tourney.current_round;
    }
  }
  saveLocalState(false);
  notifyStateChanged();
}

function applyPlayerRow(row) {
  if (!row || !row.id) return;
  const p = GAME_STATE.players.find(x => x.id === row.id);
  if (p) {
    if (row.updated_at && GAME_STATE.lastUpdated) {
      const rowTime = new Date(row.updated_at).getTime();
      if (rowTime < GAME_STATE.lastUpdated - 2000) return;
    }
    p.chips = row.chips;
    p.medals = row.medals;
    p.lastTryUsed = row.last_try_used;
    p.status = row.status;
    p.positionRole = row.position_role;
    p.currentAction = row.current_action;
    p.sortOrder = row.sort_order || p.id;
    saveLocalState(false);
    notifyStateChanged();
  }
}

// ── Supabase Integration ───────────────────────────────────
function getSupabase() {
  if (!supabaseClient && typeof window !== 'undefined' && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabaseClient;
}

// Fetch live data from Supabase
async function fetchSupabaseState(force = false) {
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
      const tourneyTime = tourney.updated_at ? new Date(tourney.updated_at).getTime() : 0;
      // Only skip tournament apply if stale - DON'T return entirely (players still need fetching)
      if (force || !GAME_STATE.lastUpdated || tourneyTime >= GAME_STATE.lastUpdated - 1500) {
        applyTournamentRow(tourney);
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

    if (!pErr && playersData && playersData.length > 0) {
      let mapped = playersData.map(p => ({
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

      // The roster is defined by setup and may contain 2–10 players.
      // Never fill it with fallback seats, or setup names/counts get overwritten.
      GAME_STATE.players = mapped;
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

    saveLocalState(false);
    notifyStateChanged();
  } catch (err) {
    console.error("Supabase fetch error, fallback to local:", err);
    loadLocalFallback();
  }
}

async function fetchBlindSchedulesOnly() {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: blindsData } = await sb
      .from('blind_schedules')
      .select('*')
      .order('level', { ascending: true });
    if (blindsData && blindsData.length > 0) {
      GAME_STATE.blindSchedule = blindsData.map(b => ({
        level: b.level,
        sb: b.sb,
        bb: b.bb,
        ante: b.ante || 0
      }));
      notifyStateChanged();
    }
  } catch(e) {}
}

async function fetchHandHistoryOnly() {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: handsData } = await sb
      .from('hand_history')
      .select('*')
      .order('id', { ascending: false })
      .limit(6);
    if (handsData) {
      GAME_STATE.recentHands = handsData.map(h => ({
        hand: h.hand,
        winner: h.winner,
        deltas: typeof h.deltas === 'string' ? JSON.parse(h.deltas) : (h.deltas || [])
      }));
      notifyStateChanged();
    }
  } catch(e) {}
}

// Subscribe to real-time changes
function subscribeToSupabase() {
  const sb = getSupabase();
  if (!sb) return;

  if (supabaseLiveChannel) {
    try { sb.removeChannel(supabaseLiveChannel); } catch(e) {}
  }

  supabaseLiveChannel = sb.channel(REALTIME_ROOM, {
    config: { broadcast: { self: false } }
  });

  supabaseLiveChannel
    .on('broadcast', { event: 'FAST_STATE_SYNC' }, ({ payload }) => {
      if (payload && payload.state) {
        applyStateUpdate(payload.state, false, payload.version, payload.timestamp);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, (payload) => {
      if (payload && payload.eventType === 'DELETE') {
        resetGameStateMemory();
      } else if (payload && payload.new) {
        applyTournamentRow(payload.new);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, (payload) => {
      if (payload && payload.eventType === 'DELETE' && payload.old) {
        GAME_STATE.players = GAME_STATE.players.filter(p => p.id !== payload.old.id);
        notifyStateChanged();
      } else if (payload && payload.new) {
        applyPlayerRow(payload.new);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blind_schedules' }, () => {
      fetchBlindSchedulesOnly();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hand_history' }, () => {
      fetchHandHistoryOnly();
    })
    .subscribe((status) => {
      if (typeof window !== 'undefined') {
        const badge = document.getElementById('op-sync-status');
        const text = document.getElementById('op-sync-text');
        if (status === 'SUBSCRIBED') {
          if (badge) {
            badge.style.background = 'rgba(16, 185, 129, 0.12)';
            badge.style.borderColor = 'rgba(16, 185, 129, 0.35)';
            badge.style.color = '#34d399';
          }
          if (text) text.textContent = 'LIVE';
        }
      }
    });
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
      current_round: JSON.stringify({
        round: GAME_STATE.currentRound || 'PRE-FLOP',
        turnId: GAME_STATE.activeTurnPlayerId,
        pot: GAME_STATE.pot || 0,
        currentBet: GAME_STATE.currentBet || 0,
        foldedPlayerIds: GAME_STATE.foldedPlayerIds || [],
        actedInRound: GAME_STATE.actedInRound || [],
        contributions: GAME_STATE.currentHandContributions || {},
        roundBets: GAME_STATE.roundBets || {},
        lastRaiserId: GAME_STATE.lastRaiserId || null,
        forfeitedInHand: GAME_STATE.forfeitedInHand || {},
        forfeitedMedalsInPot: GAME_STATE.forfeitedMedalsInPot || 0
      }),
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
  try {
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
  } catch(e) {}
}

async function syncAllPlayersToSupabase() {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const rows = GAME_STATE.players.map(p => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      medals: p.medals,
      last_try_used: p.lastTryUsed,
      status: p.status,
      position_role: p.positionRole,
      current_action: p.currentAction,
      sort_order: p.sortOrder || p.id,
      updated_at: new Date().toISOString()
    }));
    await sb.from('players').upsert(rows);
  } catch (err) {
    console.error("Batch sync players error:", err);
  }
}

async function syncFullStateToSupabase() {
  await Promise.all([
    syncTournamentToSupabase(),
    syncAllPlayersToSupabase()
  ]);
}

async function syncHandHistoryToSupabase(handRecord) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('hand_history').insert({
      hand: handRecord.hand,
      winner: handRecord.winner,
      total_pot: handRecord.totalPot || 0,
      deltas: handRecord.deltas
    });
  } catch(e) {}
}

// ── Local Fallback (Cache) ────────────────────────────────
let lastSavedStateString = '';

function saveLocalState(shouldBroadcast = true) {
  try {
    const json = JSON.stringify(GAME_STATE);
    if (json === lastSavedStateString) {
      if (shouldBroadcast) {
        broadcastState('STATE_UPDATE');
      }
      return;
    }
    lastSavedStateString = json;
    localStorage.setItem('poker_mes_state', json);
    if (shouldBroadcast) {
      broadcastState('STATE_UPDATE');
    }
  } catch(e) {}
}

function loadLocalFallback() {
  try {
    const s = localStorage.getItem('poker_mes_state');
    if (s) {
      const parsed = JSON.parse(s);
      if (parsed.players && parsed.players.length > 0) {
        Object.assign(GAME_STATE, parsed);
      } else resetGameStateMemory();
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
  // Use the configured total countdown duration (set by launchTournament)
  const baseline = GAME_STATE.countdownTotalSecs || 7200;
  const elapsed = (Date.now() - (GAME_STATE.eventStartTime || Date.now())) / 1000;
  return Math.max(0, baseline - elapsed);
}

let lastAutoAdvanceTime = 0;
// Automatically advance blind level when countdown reaches 0
function checkAndAdvanceBlindLevel() {
  if (GAME_STATE.isPaused) return false;
  if (!GAME_STATE.blindSchedule || GAME_STATE.blindSchedule.length === 0) return false;
  if (GAME_STATE.blindLevel >= GAME_STATE.blindSchedule.length) return false;

  // Guard: don't advance twice within 3 seconds
  if (Date.now() - lastAutoAdvanceTime < 3000) return false;

  const remain = getBlindCountdownSecs();
  if (remain <= 0) {
    lastAutoAdvanceTime = Date.now();
    GAME_STATE.blindLevel += 1;
    GAME_STATE.lastBlindChangeTime = Date.now();
    saveLocalState();
    broadcastState('BLIND_UP', {
      level: GAME_STATE.blindLevel,
      lastBlindChangeTime: GAME_STATE.lastBlindChangeTime
    });
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

// ═══════════════════════════════════════════════════════════
// AUTOMATED POKER ENGINE: TURNS, STREETS, MEDALS & CHIPS
// ═══════════════════════════════════════════════════════════

function getOrderedActivePlayers() {
  return (GAME_STATE.players || [])
    .filter(p => p.status !== 'eliminated')
    .sort((a, b) => (a.sortOrder || a.id) - (b.sortOrder || b.id));
}

function getEligibleTurnPlayers() {
  const folded = new Set(GAME_STATE.foldedPlayerIds || []);
  return getOrderedActivePlayers().filter(p => !folded.has(p.id));
}

function rollDealerPositions(silent = true) {
  const activePlayers = getOrderedActivePlayers();
  if (activePlayers.length < 2) return;

  // Find current dealer index among active players
  let curDealerIdx = activePlayers.findIndex(p => p.positionRole === 'D');
  if (curDealerIdx === -1) curDealerIdx = 0;

  // Clear all roles first
  GAME_STATE.players.forEach(p => {
    p.positionRole = null;
    if (p.currentAction && (p.currentAction.includes('DEALER') || p.currentAction.includes('BLIND') || p.currentAction.startsWith('SB') || p.currentAction.startsWith('BB'))) {
      p.currentAction = null;
    }
  });

  // Calculate next positions (clockwise modulo active players)
  const nextDealerIdx = (curDealerIdx + 1) % activePlayers.length;
  const nextSbIdx = (nextDealerIdx + 1) % activePlayers.length;
  const nextBbIdx = (nextDealerIdx + 2) % activePlayers.length;

  activePlayers[nextDealerIdx].positionRole = 'D';
  activePlayers[nextSbIdx].positionRole = 'SB';
  if (activePlayers.length > 2) {
    activePlayers[nextBbIdx].positionRole = 'BB';
  } else {
    // Heads-up: Dealer is SB, other player is BB
    activePlayers[nextDealerIdx].positionRole = 'D';
    activePlayers[nextSbIdx].positionRole = 'BB';
  }
}

async function startNewHand(advanceDealer = true) {
  if (advanceDealer) {
    rollDealerPositions(true);
  }

  const curBlind = getCurrentBlind() || { sb: 25, bb: 50 };

  // 1. AUTOMATIC BUST / LAST TRY CHECK (+400 CHIPS & RETURN ALL MEDALS TO CENTER)
  // Rule: Untuk player yang bust itu harus otomatis ada opsi untuk melakukan last try dan menambahkan chips senilai 400, jika ia memiliki medal pada saat bust, semua jumlah medal harus dikembalikan ke medal center
  GAME_STATE.players.forEach(p => {
    if (p.status !== 'eliminated' && p.chips <= 0) {
      if (!p.lastTryUsed) {
        p.lastTryUsed = true;
        p.status = 'lasttry';
        p.chips = 400;
        const retMedals = p.medals || 0;
        p.medals = 0;
        GAME_STATE.centerMedals += retMedals;
        GAME_STATE.centerValue = GAME_STATE.centerMedals * (GAME_STATE.rupiahPerMedal || 2000);
      } else {
        p.status = 'eliminated';
        p.chips = 0;
        const retMedals = p.medals || 0;
        p.medals = 0;
        GAME_STATE.centerMedals += retMedals;
        GAME_STATE.centerValue = GAME_STATE.centerMedals * (GAME_STATE.rupiahPerMedal || 2000);
      }
    }
  });

  // 2. MANDATORY MEDAL CONVERSION BEFORE HAND STARTS IF CHIPS < BIG BLIND
  // Rule: Player diwajibkan untuk convert medal ke chips jika sebelum hand dimulai total chips player kurang dari big blind pada saat itu
  GAME_STATE.players.forEach(p => {
    if (p.status !== 'eliminated') {
      while (p.chips < curBlind.bb && p.medals > 0) {
        p.medals -= 1;
        p.chips += 400;
      }
    }
  });

  const activeList = getOrderedActivePlayers();
  if (activeList.length < 2) return;

  // Reset street and pot state
  GAME_STATE.currentRound = 'PRE-FLOP';
  GAME_STATE.pot = 0;
  GAME_STATE.currentHandContributions = {};
  GAME_STATE.roundBets = {};
  GAME_STATE.actedInRound = [];
  GAME_STATE.foldedPlayerIds = [];
  GAME_STATE.lastRaiserId = null;
  GAME_STATE.forfeitedInHand = {};
  GAME_STATE.forfeitedMedalsInPot = 0;

  // Clear action tags
  GAME_STATE.players.forEach(p => {
    if (p.status !== 'eliminated') {
      p.currentAction = null;
    }
  });

  // Post blinds. In heads-up, Dealer posts SB and the other player posts BB.
  const isHeadsUp = activeList.length === 2;
  const dealerPlayer = activeList.find(p => p.positionRole === 'D');
  const sbPlayer = isHeadsUp
    ? dealerPlayer
    : (activeList.find(p => p.positionRole === 'SB') || activeList[1 % activeList.length]);
  if (sbPlayer) {
    const sbAmt = Math.min(sbPlayer.chips || 0, curBlind.sb);
    sbPlayer.chips -= sbAmt;
    GAME_STATE.pot += sbAmt;
    GAME_STATE.roundBets[sbPlayer.id] = sbAmt;
    GAME_STATE.currentHandContributions[sbPlayer.id] = sbAmt;
    sbPlayer.currentAction = `SB ${sbAmt}`;

    // If center medals already 0 and blind >= 400
    if (GAME_STATE.centerMedals === 0) {
      const forfeit = Math.floor(sbAmt / 400);
      if (forfeit > 0) {
        const actual = Math.min(forfeit, sbPlayer.medals || 0);
        sbPlayer.medals = Math.max(0, (sbPlayer.medals || 0) - actual);
        GAME_STATE.forfeitedInHand[sbPlayer.id] = actual;
        GAME_STATE.forfeitedMedalsInPot = (GAME_STATE.forfeitedMedalsInPot || 0) + actual;
      }
    }
  }

  // Post Big Blind
  const bbPlayer = isHeadsUp
    ? activeList.find(p => p.id !== sbPlayer?.id)
    : (activeList.find(p => p.positionRole === 'BB') || activeList[2 % activeList.length]);
  if (bbPlayer) {
    const bbAmt = Math.min(bbPlayer.chips || 0, curBlind.bb);
    bbPlayer.chips -= bbAmt;
    GAME_STATE.pot += bbAmt;
    GAME_STATE.roundBets[bbPlayer.id] = bbAmt;
    GAME_STATE.currentHandContributions[bbPlayer.id] = bbAmt;
    bbPlayer.currentAction = `BB ${bbAmt}`;

    // If center medals already 0 and blind >= 400
    if (GAME_STATE.centerMedals === 0) {
      const forfeit = Math.floor(bbAmt / 400);
      if (forfeit > 0) {
        const actual = Math.min(forfeit, bbPlayer.medals || 0);
        bbPlayer.medals = Math.max(0, (bbPlayer.medals || 0) - actual);
        GAME_STATE.forfeitedInHand[bbPlayer.id] = actual;
        GAME_STATE.forfeitedMedalsInPot = (GAME_STATE.forfeitedMedalsInPot || 0) + actual;
      }
    }
  }

  GAME_STATE.currentBet = curBlind.bb;

  // First to act in Pre-Flop: Player immediately AFTER Big Blind (UTG)
  const bbIdx = activeList.findIndex(p => p.id === (bbPlayer ? bbPlayer.id : -1));
  const firstIdx = (bbIdx !== -1) ? (bbIdx + 1) % activeList.length : 0;
  GAME_STATE.activeTurnPlayerId = activeList[firstIdx].id;

  saveLocalState();
  notifyStateChanged();
  syncFullStateToSupabase().catch(console.error);
}

async function processPlayerMove(playerId, actionType, amount = 0) {
  if (GAME_STATE.activeTurnPlayerId !== playerId) {
    console.warn(`Bukan giliran player #${playerId}. Giliran aktif: #${GAME_STATE.activeTurnPlayerId}`);
    return false;
  }

  const player = GAME_STATE.players.find(p => p.id === playerId);
  if (!player) return false;

  const curPaid = GAME_STATE.roundBets[playerId] || 0;
  const curBlind = getCurrentBlind() || { sb: 25, bb: 50 };
  const minBet = GAME_STATE.currentRound === 'PRE-FLOP' ? curBlind.bb : 0;
  const curBet = Math.max(GAME_STATE.currentBet || 0, minBet);
  let chipsSpent = 0;

  if (actionType === 'CHECK') {
    if (curPaid < curBet) {
      // Must call, strictly cannot check
      return false;
    }
    player.currentAction = 'CHECK';
    if (!GAME_STATE.actedInRound.includes(playerId)) {
      GAME_STATE.actedInRound.push(playerId);
    }
  } else if (actionType === 'CALL') {
    let toCall = Math.max(0, curBet - curPaid);
    if (toCall >= player.chips) {
      toCall = player.chips;
      player.currentAction = 'ALL-IN';
    } else {
      player.currentAction = toCall > 0 ? `CALL ${toCall}` : 'CHECK';
    }
    chipsSpent = toCall;
    player.chips -= toCall;
    GAME_STATE.pot = (GAME_STATE.pot || 0) + toCall;
    GAME_STATE.roundBets[playerId] = curPaid + toCall;
    GAME_STATE.currentHandContributions[playerId] = (GAME_STATE.currentHandContributions[playerId] || 0) + toCall;
    if (!GAME_STATE.actedInRound.includes(playerId)) {
      GAME_STATE.actedInRound.push(playerId);
    }
  } else if (actionType === 'RAISE') {
    const targetTotal = Math.max(curBet + 25, amount);
    let additional = targetTotal - curPaid;
    if (additional >= player.chips) {
      additional = player.chips;
      player.currentAction = 'ALL-IN';
      GAME_STATE.currentBet = curPaid + additional;
    } else {
      player.currentAction = `RAISE ${targetTotal}`;
      GAME_STATE.currentBet = targetTotal;
    }
    chipsSpent = additional;
    player.chips -= additional;
    GAME_STATE.pot = (GAME_STATE.pot || 0) + additional;
    GAME_STATE.roundBets[playerId] = curPaid + additional;
    GAME_STATE.currentHandContributions[playerId] = (GAME_STATE.currentHandContributions[playerId] || 0) + additional;
    GAME_STATE.lastRaiserId = playerId;
    // Reset actedInRound to this player so other active players must react
    GAME_STATE.actedInRound = [playerId];
  } else if (actionType === 'ALL-IN' || actionType === 'ALLIN') {
    const allinAmt = player.chips || 0;
    chipsSpent = allinAmt;
    player.chips = 0;
    player.currentAction = 'ALL-IN';
    const newTotal = curPaid + allinAmt;
    if (newTotal > curBet) {
      GAME_STATE.currentBet = newTotal;
      GAME_STATE.lastRaiserId = playerId;
      GAME_STATE.actedInRound = [playerId];
    } else if (!GAME_STATE.actedInRound.includes(playerId)) {
      GAME_STATE.actedInRound.push(playerId);
    }
    GAME_STATE.pot = (GAME_STATE.pot || 0) + allinAmt;
    GAME_STATE.roundBets[playerId] = newTotal;
    GAME_STATE.currentHandContributions[playerId] = (GAME_STATE.currentHandContributions[playerId] || 0) + allinAmt;
  } else if (actionType === 'FOLD') {
    player.currentAction = 'FOLD';
    if (!GAME_STATE.foldedPlayerIds.includes(playerId)) {
      GAME_STATE.foldedPlayerIds.push(playerId);
    }
  }

  // ── AUTOMATIC MEDAL FORFEITURE ON 400 CHIPS CONTRIBUTION (ONLY WHEN CENTER MEDALS === 0) ──
  if (GAME_STATE.centerMedals === 0 && chipsSpent > 0) {
    if (!GAME_STATE.forfeitedInHand) GAME_STATE.forfeitedInHand = {};
    const totalContrib = GAME_STATE.currentHandContributions[playerId] || 0;
    const shouldForfeitTotal = Math.floor(totalContrib / 400);
    const alreadyForfeited = GAME_STATE.forfeitedInHand[playerId] || 0;
    const newlyForfeited = Math.max(0, shouldForfeitTotal - alreadyForfeited);
    if (newlyForfeited > 0) {
      const actualLoss = Math.min(newlyForfeited, player.medals || 0);
      player.medals = Math.max(0, (player.medals || 0) - actualLoss);
      GAME_STATE.forfeitedInHand[playerId] = alreadyForfeited + actualLoss;
      GAME_STATE.forfeitedMedalsInPot = (GAME_STATE.forfeitedMedalsInPot || 0) + actualLoss;
    }
  }

  // Check if only 1 eligible player remains in the hand
  const eligible = getEligibleTurnPlayers();
  if (eligible.length === 1) {
    saveLocalState();
    notifyStateChanged();
    Promise.all([
      syncPlayerToSupabase(player),
      syncTournamentToSupabase()
    ]).catch(console.error);
    // Sole remaining player wins immediately
    await resolveHandWinner(eligible[0].id);
    return true;
  }

  // Check if betting round/street is complete
  const allActed = eligible.every(p => GAME_STATE.actedInRound.includes(p.id) || p.chips === 0);
  const allBetsMatched = eligible.every(p => (GAME_STATE.roundBets[p.id] || 0) === GAME_STATE.currentBet || p.chips === 0);

  if (allActed && allBetsMatched) {
    // Automatically advance street: Preflop -> Flop -> Turn -> River -> Showdown
    if (GAME_STATE.currentRound === 'PRE-FLOP') {
      GAME_STATE.currentRound = 'FLOP';
    } else if (GAME_STATE.currentRound === 'FLOP') {
      GAME_STATE.currentRound = 'TURN';
    } else if (GAME_STATE.currentRound === 'TURN') {
      GAME_STATE.currentRound = 'RIVER';
    } else if (GAME_STATE.currentRound === 'RIVER') {
      GAME_STATE.currentRound = 'SHOWDOWN';
    }

    if (GAME_STATE.currentRound !== 'SHOWDOWN') {
      // Reset street bets
      GAME_STATE.currentBet = 0;
      GAME_STATE.roundBets = {};
      GAME_STATE.actedInRound = [];
      GAME_STATE.lastRaiserId = null;

      // Clear street action labels for non-all-in players
      eligible.forEach(p => {
        if (p.currentAction !== 'ALL-IN') p.currentAction = null;
      });

      // Next turn post-flop: first eligible player left of Dealer button
      const activeAll = getOrderedActivePlayers();
      const dIdx = activeAll.findIndex(p => p.positionRole === 'D');
      let nextTurnPlayer = null;
      for (let i = 1; i <= activeAll.length; i++) {
        const candidate = activeAll[(dIdx + i) % activeAll.length];
        if (eligible.some(p => p.id === candidate.id)) {
          if (candidate.chips > 0) {
            nextTurnPlayer = candidate;
            break;
          }
        }
      }
      GAME_STATE.activeTurnPlayerId = nextTurnPlayer ? nextTurnPlayer.id : eligible[0].id;
    } else {
      // SHOWDOWN! Waiting for operator to select winner
      GAME_STATE.activeTurnPlayerId = null;
    }
  } else {
    // Advance to next eligible player clockwise
    const activeAll = getOrderedActivePlayers();
    const curIdx = activeAll.findIndex(p => p.id === playerId);
    let nextTurnPlayer = null;
    for (let i = 1; i <= activeAll.length; i++) {
      const candidate = activeAll[(curIdx + i) % activeAll.length];
      if (eligible.some(p => p.id === candidate.id)) {
        if (candidate.chips > 0 || !GAME_STATE.actedInRound.includes(candidate.id)) {
          nextTurnPlayer = candidate;
          break;
        }
      }
    }
    GAME_STATE.activeTurnPlayerId = nextTurnPlayer ? nextTurnPlayer.id : null;
  }

  saveLocalState();
  notifyStateChanged();
  Promise.all([
    syncPlayerToSupabase(player),
    syncTournamentToSupabase()
  ]).catch(console.error);
  return true;
}

async function resolveHandWinner(winnerId) {
  const winner = GAME_STATE.players.find(p => p.id === winnerId);
  if (!winner) return;

  const potWon = GAME_STATE.pot || 0;
  winner.chips += potWon;

  const deltas = [];
  let winnerMedalsGained = 0;

  // Medal Rules:
  // 1. If centerMedals > 0: Winner takes 1 medal from Center Medals automatically!
  if (GAME_STATE.centerMedals > 0) {
    GAME_STATE.centerMedals = Math.max(0, GAME_STATE.centerMedals - 1);
    winner.medals = (winner.medals || 0) + 1;
    winnerMedalsGained = 1;
    GAME_STATE.centerValue = GAME_STATE.centerMedals * (GAME_STATE.rupiahPerMedal || 2000);
    deltas.push({ name: winner.name, medals: 1, note: 'MENANG POT + 1 MEDAL DARI CENTER' });
  } else {
    // 2. If centerMedals === 0: Every 400 chips contributed forfeits 1 medal to the winner!
    let totalForfeited = GAME_STATE.forfeitedMedalsInPot || 0;

    // Check if any additional pending forfeiture from contributors wasn't deducted
    GAME_STATE.players.forEach(p => {
      if (p.id !== winnerId) {
        const contrib = GAME_STATE.currentHandContributions[p.id] || 0;
        const shouldForfeit = Math.floor(contrib / 400);
        const alreadyForfeited = (GAME_STATE.forfeitedInHand && GAME_STATE.forfeitedInHand[p.id]) || 0;
        const remainder = Math.max(0, shouldForfeit - alreadyForfeited);
        if (remainder > 0) {
          const actual = Math.min(remainder, p.medals || 0);
          p.medals = Math.max(0, (p.medals || 0) - actual);
          totalForfeited += actual;
          if (GAME_STATE.forfeitedInHand) {
            GAME_STATE.forfeitedInHand[p.id] = alreadyForfeited + actual;
          }
        }
        const playerTotalLost = (GAME_STATE.forfeitedInHand && GAME_STATE.forfeitedInHand[p.id]) || 0;
        if (playerTotalLost > 0) {
          deltas.push({ name: p.name, medals: -playerTotalLost, note: `${contrib} chips → forfeit -${playerTotalLost} 🏅` });
        }
      }
    });

    winner.medals = (winner.medals || 0) + totalForfeited;
    winnerMedalsGained = totalForfeited;
    deltas.unshift({ name: winner.name, medals: totalForfeited, note: `MENANG POT + ${totalForfeited} MEDAL FORFEITED` });
  }

  // Check for players busting on this hand
  // Rule: Untuk player yang bust itu harus otomatis ada opsi untuk melakukan last try dan menambahkan chips senilai 400, jika ia memiliki medal pada saat bust, semua jumlah medal harus dikembalikan ke medal center
  GAME_STATE.players.forEach(p => {
    if (p.status !== 'eliminated' && p.chips <= 0) {
      if (!p.lastTryUsed) {
        p.lastTryUsed = true;
        p.status = 'lasttry';
        p.chips = 400;
        const retMedals = p.medals || 0;
        p.medals = 0;
        GAME_STATE.centerMedals += retMedals;
        GAME_STATE.centerValue = GAME_STATE.centerMedals * (GAME_STATE.rupiahPerMedal || 2000);
      } else {
        p.status = 'eliminated';
        p.chips = 0;
        const retMedals = p.medals || 0;
        p.medals = 0;
        GAME_STATE.centerMedals += retMedals;
        GAME_STATE.centerValue = GAME_STATE.centerMedals * (GAME_STATE.rupiahPerMedal || 2000);
      }
    }
  });

  // Record Hand History
  const handRecord = {
    hand: GAME_STATE.hand,
    winner: winner.name,
    totalPot: potWon,
    winnerMedalsGained: winnerMedalsGained,
    deltas: deltas
  };
  GAME_STATE.recentHands.unshift(handRecord);
  if (GAME_STATE.recentHands.length > 10) GAME_STATE.recentHands.pop();
  await syncHandHistoryToSupabase(handRecord);

  // Advance Hand number
  GAME_STATE.hand += 1;

  // Rotate Dealer, SB, BB and automatically start next hand
  await startNewHand(true);
}
