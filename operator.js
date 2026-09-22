/* ═══════════════════════════════════════════════════════════
   EVENT GOCAP — OPERATOR LOGIC
   Full hand resolution, medal conversion, bust handling
═══════════════════════════════════════════════════════════ */

loadLocalFallback();

// ── State ─────────────────────────────────────────────────
let isPaused = false;
let convertPlayerId = null;
let convertAmount = 1;
let pendingHandResult = null;

const MEDAL_VALUE = 400; // Rp per medal
const LAST_TRY_CHIPS = 400;

// ── DOM refs ──────────────────────────────────────────────
const $opHand = document.getElementById('op-hand');
const $opBlind = document.getElementById('op-blind');
const $opCenter = document.getElementById('op-center');
const $opTimer = document.getElementById('op-timer');
const $playerGrid = document.getElementById('op-player-grid');
const $log = document.getElementById('op-log');
const $syncBadge = document.getElementById('op-sync-status');
const $syncText = document.getElementById('op-sync-text');

// ── Custom Alert & Confirmation System ────────────────────
function showOpAlert(title, message, type = 'gold') {
  const iconEl = document.getElementById('op-alert-icon');
  const iconBox = document.getElementById('op-alert-icon-box');
  const titleEl = document.getElementById('op-alert-title');
  const msgEl = document.getElementById('op-alert-msg');
  const actionsEl = document.getElementById('op-alert-actions');

  titleEl.textContent = title;
  msgEl.textContent = message;

  iconBox.className = `modal-alert-icon ${type}`;
  if (type === 'red') iconEl.textContent = '✕';
  else if (type === 'green') iconEl.textContent = '✓';
  else iconEl.textContent = 'ℹ';

  actionsEl.innerHTML = `<button class="op-btn op-btn-gold" style="width:100%;" onclick="closeModal('modal-alert')">MENGERTI</button>`;
  openModal('modal-alert');
}

function showOpConfirm(title, message, onConfirm, type = 'gold') {
  const iconEl = document.getElementById('op-alert-icon');
  const iconBox = document.getElementById('op-alert-icon-box');
  const titleEl = document.getElementById('op-alert-title');
  const msgEl = document.getElementById('op-alert-msg');
  const actionsEl = document.getElementById('op-alert-actions');

  titleEl.textContent = title;
  msgEl.textContent = message;

  iconBox.className = `modal-alert-icon ${type}`;
  if (type === 'red') iconEl.textContent = '⚠️';
  else iconEl.textContent = '❓';

  actionsEl.innerHTML = `
    <button class="op-btn op-btn-secondary" style="flex:1;" onclick="closeModal('modal-alert')">BATAL</button>
    <button class="op-btn op-btn-gold" id="op-confirm-btn-yes" style="flex:1;">YA, LANJUTKAN</button>
  `;

  document.getElementById('op-confirm-btn-yes').onclick = () => {
    closeModal('modal-alert');
    if (typeof onConfirm === 'function') onConfirm();
  };

  openModal('modal-alert');
}

function updateSyncStatus(connected, text = null) {
  if (!$syncBadge) return;
  if (connected) {
    $syncBadge.style.background = 'rgba(46, 198, 107, 0.1)';
    $syncBadge.style.borderColor = 'rgba(46, 198, 107, 0.3)';
    $syncBadge.style.color = 'var(--green)';
    if ($syncText) $syncText.textContent = text || 'LIVE CONNECTED';
  } else {
    $syncBadge.style.background = 'rgba(231, 76, 60, 0.1)';
    $syncBadge.style.borderColor = 'rgba(231, 76, 60, 0.3)';
    $syncBadge.style.color = 'var(--red)';
    if ($syncText) $syncText.textContent = text || 'DISCONNECTED';
  }
}

// Explicit button to load or re-sync active game from Supabase
async function loadActiveGame() {
  if ($syncText) $syncText.textContent = 'SYNCING...';
  try {
    await fetchSupabaseState();
    renderPlayerCards();
    renderLog();
    updateSyncStatus(true, 'LIVE CONNECTED');
    showOpAlert('KONEKSI BERHASIL', `Berhasil menyambung ke game aktif Supabase!\nHand #${GAME_STATE.hand} • Level ${GAME_STATE.blindLevel} • ${GAME_STATE.players.length} Pemain`, 'green');
  } catch (err) {
    updateSyncStatus(false, 'SYNC ERROR');
    showOpAlert('KONEKSI GAGAL', 'Tidak dapat mengambil game dari cloud:\n' + err.message, 'red');
  }
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  onGameStateChange(() => {
    renderPlayerCards();
    renderLog();
  });

  // 1. Direct fetch from Supabase to load active running game or last game
  try {
    updateSyncStatus(true, 'CONNECTING...');
    await fetchSupabaseState();
    updateSyncStatus(true, 'LIVE CONNECTED');
  } catch (e) {
    console.error("Operator Supabase init error:", e);
    updateSyncStatus(false, 'OFFLINE (LOCAL)');
  }

  // 2. Real-time subscription
  subscribeToSupabase();

  renderPlayerCards();
  renderLog();
  tick();
  setInterval(tick, 1000);

  // Auto-sync polling every 6 seconds as a robust fallback
  setInterval(() => {
    fetchSupabaseState();
  }, 6000);
}

async function tick() {
  if (isPaused) return;

  // 1. Check auto-advance blind level when countdown reaches 0
  if (checkAndAdvanceBlindLevel()) {
    saveLocalState();
    notifyStateChanged();
    await syncTournamentToSupabase();
    playBlindChime();
    const curBlind = getCurrentBlind();
    showOpAlert(
      "BLIND LEVEL NAIK! 🔔",
      `Waktu blind habis! Level otomatis naik ke Level ${GAME_STATE.blindLevel}\nSmall Blind: ${curBlind.sb} • Big Blind: ${curBlind.bb}\nLayar monitor publik langsung tersinkronisasi!`,
      "gold"
    );
  }

  // 2. Tournament Match Countdown Timer
  const countdownSecs = getEventCountdownSecs();
  if ($opTimer) {
    $opTimer.textContent = formatTime(countdownSecs);
    if (countdownSecs < 300) {
      $opTimer.style.color = 'var(--red)';
    } else {
      $opTimer.style.color = '';
    }
  }

  // 3. Blind Countdown Timer (Next Blind In)
  const blindSecs = getBlindCountdownSecs();
  const $opBlindTimer = document.getElementById('op-blind-timer');
  if ($opBlindTimer) {
    $opBlindTimer.textContent = formatTime(blindSecs);
    if (blindSecs < 60) {
      $opBlindTimer.style.color = 'var(--red)';
      $opBlindTimer.style.fontWeight = 'bold';
    } else {
      $opBlindTimer.style.color = '#f87171';
      $opBlindTimer.style.fontWeight = 'normal';
    }
  }

  // 4. Blind and Hand Info
  const blind = getCurrentBlind();
  if (blind && $opBlind) {
    $opBlind.textContent = `${blind.sb} / ${blind.bb}`;
    const levelLabel = document.getElementById('op-blind-level-num');
    if (levelLabel) levelLabel.textContent = `LEVEL ${GAME_STATE.blindLevel}`;
  }
  if ($opHand) $opHand.textContent = `#${GAME_STATE.hand}`;
  if ($opCenter) $opCenter.textContent = `${GAME_STATE.centerMedals} 🏅`;

  const roundSelect = document.getElementById('op-round-select');
  if (roundSelect && document.activeElement !== roundSelect) {
    if (GAME_STATE.currentRound) roundSelect.value = GAME_STATE.currentRound;
  }
}

// ── ROLLING DEALER, SB, BB SYSTEM ─────────────────────────
function rollDealerPositions(silent = false) {
  const activePlayers = GAME_STATE.players.filter(p => p.status !== 'eliminated');
  if (activePlayers.length < 2) return;

  // Find current dealer index among active players
  let curDealerIdx = activePlayers.findIndex(p => p.positionRole === 'D');
  if (curDealerIdx === -1) curDealerIdx = 0;

  // Clear all roles first
  GAME_STATE.players.forEach(p => {
    p.positionRole = null;
    if (p.currentAction === 'DEALER' || p.currentAction === 'SMALL BLIND' || p.currentAction === 'BIG BLIND') {
      p.currentAction = null;
    }
  });

  // Calculate next positions (modulo active players)
  const nextDealerIdx = (curDealerIdx + 1) % activePlayers.length;
  const nextSbIdx = (nextDealerIdx + 1) % activePlayers.length;
  const nextBbIdx = (nextDealerIdx + 2) % activePlayers.length;

  activePlayers[nextDealerIdx].positionRole = 'D';
  activePlayers[nextDealerIdx].currentAction = 'DEALER';

  activePlayers[nextSbIdx].positionRole = 'SB';
  activePlayers[nextSbIdx].currentAction = 'SMALL BLIND';

  if (activePlayers.length > 2) {
    activePlayers[nextBbIdx].positionRole = 'BB';
    activePlayers[nextBbIdx].currentAction = 'BIG BLIND';
  }

  saveLocalState();
  renderPlayerCards();

  // Sync players and tournament to Supabase
  GAME_STATE.players.forEach(p => syncPlayerToSupabase(p));
  syncTournamentToSupabase();

  if (!silent) {
    const dName = activePlayers[nextDealerIdx].name;
    const sbName = activePlayers[nextSbIdx].name;
    const bbName = activePlayers.length > 2 ? activePlayers[nextBbIdx].name : '-';
    showOpAlert(
      "ROLLING DEALER SUKSES",
      `Posisi meja berhasil dirotasi!\n• DEALER (D): ${dName}\n• SMALL BLIND (SB): ${sbName}\n• BIG BLIND (BB): ${bbName}`,
      "green"
    );
  }
}

function rollDealerManually() {
  showOpConfirm(
    "ROLLING DEALER",
    "Pindahkan posisi Dealer (D), Small Blind (SB), dan Big Blind (BB) ke pemain berikutnya secara berurutan?",
    () => {
      rollDealerPositions(false);
    },
    'gold'
  );
}

// ── TIME & BLIND CONTROLLERS (SYNCHRONIZED) ───────────────
async function addTournamentTime(seconds) {
  // Shifting eventStartTime forward increases remaining match countdown for ALL connected clients
  GAME_STATE.eventStartTime = (GAME_STATE.eventStartTime || Date.now()) + (seconds * 1000);
  saveLocalState();
  notifyStateChanged();
  await syncTournamentToSupabase();
  const mins = Math.round(seconds / 60);
  showOpAlert("WAKTU MATCH DITAMBAHKAN", `Berhasil menambahkan +${mins} menit ke hitung mundur turnamen!\nMonitor publik langsung tersinkronisasi.`, "green");
}

async function addBlindTime(seconds) {
  const curRemain = getBlindCountdownSecs();
  const interval = GAME_STATE.blindIntervalSecs || 900;
  if (curRemain <= 0) {
    // If it was expired, give it `seconds` remaining:
    const elapsed = Math.max(0, interval - seconds);
    GAME_STATE.lastBlindChangeTime = Date.now() - (elapsed * 1000);
  } else {
    // Shift lastBlindChangeTime forward by `seconds * 1000`
    GAME_STATE.lastBlindChangeTime = (GAME_STATE.lastBlindChangeTime || Date.now()) + (seconds * 1000);
  }
  saveLocalState();
  notifyStateChanged();
  await syncTournamentToSupabase();
  const mins = Math.round(seconds / 60);
  showOpAlert("WAKTU BLIND DITAMBAHKAN", `Berhasil menambahkan +${mins} menit ke sisa waktu level blind saat ini!\nMonitor publik langsung tersinkronisasi.`, "green");
}

async function changeBlindLevel(delta) {
  const maxLevel = GAME_STATE.blindSchedule ? GAME_STATE.blindSchedule.length : 12;
  const newLevel = (GAME_STATE.blindLevel || 1) + delta;
  if (newLevel < 1 || newLevel > maxLevel) return;

  GAME_STATE.blindLevel = newLevel;
  GAME_STATE.lastBlindChangeTime = Date.now(); // Reset countdown for the new level
  saveLocalState();
  notifyStateChanged();
  await syncTournamentToSupabase();
  playBlindChime();
  const cur = getCurrentBlind();
  showOpAlert(
    "BLIND LEVEL DIUBAH",
    `Blind dialihkan ke Level ${newLevel} (${cur.sb} / ${cur.bb})!\nCountdown blind direset ke awal level dan langsung tampil di monitor depan.`,
    "gold"
  );
}

let pauseTimestamp = null;
async function togglePause() {
  isPaused = !isPaused;
  GAME_STATE.isPaused = isPaused;
  const btn = document.getElementById('btn-pause');
  if (isPaused) {
    pauseTimestamp = Date.now();
    btn.textContent = '▶ RESUME';
    btn.style.color = 'var(--amber)';
  } else {
    if (pauseTimestamp) {
      const pausedMs = Date.now() - pauseTimestamp;
      GAME_STATE.eventStartTime = (GAME_STATE.eventStartTime || Date.now()) + pausedMs;
      GAME_STATE.lastBlindChangeTime = (GAME_STATE.lastBlindChangeTime || Date.now()) + pausedMs;
      pauseTimestamp = null;
    }
    btn.textContent = '⏸ PAUSE';
    btn.style.color = '';
  }
  saveLocalState();
  notifyStateChanged();
  await syncTournamentToSupabase();
}

// ══════════════════════════════════════════════════════════
// PLAYER CARDS
// ══════════════════════════════════════════════════════════
function renderPlayerCards() {
  $playerGrid.innerHTML = '';
  if (!GAME_STATE.players || GAME_STATE.players.length === 0) {
    $playerGrid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-secondary); background: var(--bg-card); border-radius: 8px; border: 1px dashed var(--border-mid);">
        <p style="font-size:16px; font-weight:600; margin-bottom:8px; color:var(--text-primary);">Belum ada data pemain di memori</p>
        <p style="font-size:13px; margin-bottom:16px;">Klik tombol di bawah untuk memuat pemain dari database Supabase atau reset ke 8 pemain default.</p>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button class="op-btn op-btn-gold" onclick="loadActiveGame()">🔄 SYNC SUPABASE</button>
        </div>
      </div>
    `;
    return;
  }
  GAME_STATE.players.forEach(p => {
    try {
      $playerGrid.appendChild(buildPlayerCard(p));
    } catch(err) {
      console.error("Error rendering player card for", p, err);
    }
  });
}

function buildPlayerCard(player) {
  const div = document.createElement('div');
  const status = player.status || 'active';
  div.className = `op-player-card status-${status}`;
  div.dataset.id = player.id;

  let badgeClass = 'badge-active';
  let badgeText = 'ACTIVE';
  if (status === 'ready') { badgeClass = 'badge-ready'; badgeText = 'READY'; }
  if (status === 'lasttry') { badgeClass = 'badge-lasttry'; badgeText = 'LAST TRY USED'; }
  if (status === 'eliminated') { badgeClass = 'badge-eliminated'; badgeText = 'ELIMINATED'; }

  let roleBadge = '';
  if (player.positionRole === 'D') {
    roleBadge = '<span style="font-size:10px;font-weight:800;background:var(--gold);color:#000;padding:2px 6px;border-radius:3px;margin-left:6px;">D</span>';
  } else if (player.positionRole === 'SB') {
    roleBadge = '<span style="font-size:10px;font-weight:800;background:#38bdf8;color:#000;padding:2px 6px;border-radius:3px;margin-left:6px;">SB</span>';
  } else if (player.positionRole === 'BB') {
    roleBadge = '<span style="font-size:10px;font-weight:800;background:#c084fc;color:#000;padding:2px 6px;border-radius:3px;margin-left:6px;">BB</span>';
  }

  const isElim = status === 'eliminated';
  const chipsNum = player.chips != null ? player.chips : 0;
  const chipsStr = isElim ? '—' : chipsNum.toLocaleString();
  const medalsStr = String(player.medals != null ? player.medals : 0);

  let actionsHtml = '';
  let liveActionBarHtml = '';

  const curAction = (player.currentAction || '').toUpperCase();
  let actionBadge = '';
  if (curAction) {
    let actColor = '#94a3b8';
    let actBg = 'rgba(148, 163, 184, 0.15)';
    let actBorder = 'rgba(148, 163, 184, 0.3)';
    if (curAction.includes('RAISE')) { actColor = '#fbbf24'; actBg = 'rgba(245, 158, 11, 0.15)'; actBorder = 'rgba(245, 158, 11, 0.35)'; }
    else if (curAction.includes('CALL')) { actColor = '#34d399'; actBg = 'rgba(16, 185, 129, 0.15)'; actBorder = 'rgba(16, 185, 129, 0.35)'; }
    else if (curAction.includes('CHECK')) { actColor = '#38bdf8'; actBg = 'rgba(56, 189, 248, 0.15)'; actBorder = 'rgba(56, 189, 248, 0.35)'; }
    else if (curAction.includes('ALL-IN') || curAction.includes('ALLIN')) { actColor = '#c084fc'; actBg = 'rgba(192, 132, 252, 0.15)'; actBorder = 'rgba(192, 132, 252, 0.35)'; }
    else if (curAction.includes('FOLD')) { actColor = '#94a3b8'; actBg = 'rgba(100, 116, 139, 0.15)'; actBorder = 'rgba(100, 116, 139, 0.3)'; }
    else if (curAction.includes('DEALER') || curAction.includes('BLIND')) { actColor = '#e2e8f0'; actBg = 'rgba(255, 255, 255, 0.08)'; actBorder = 'rgba(255, 255, 255, 0.15)'; }

    actionBadge = `<span style="font-size:10px;font-weight:800;letter-spacing:0.06em;color:${actColor};background:${actBg};border:1px solid ${actBorder};padding:2px 7px;border-radius:4px;margin-left:6px;">${curAction}</span>`;
  }

  if (!isElim) {
    const isFoldActive = curAction === 'FOLD';
    const isCheckActive = curAction === 'CHECK';
    const isCallActive = curAction === 'CALL';
    const isRaiseActive = curAction.startsWith('RAISE');
    const isAllinActive = curAction === 'ALL-IN' || curAction === 'ALLIN';

    liveActionBarHtml = `
      <div class="op-card-action-bar">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="op-action-bar-label">ACTION RONDE / MEJA:</span>
          ${curAction ? `<span style="font-size:9px;color:var(--text-muted);cursor:pointer;" onclick="setPlayerAction(${player.id}, null)" title="Hapus action">Clear ✕</span>` : ''}
        </div>
        <div class="op-action-btns-grid">
          <button type="button" class="op-btn-act act-fold ${isFoldActive ? 'is-current' : ''}" onclick="setPlayerAction(${player.id}, 'FOLD')">FOLD</button>
          <button type="button" class="op-btn-act act-check ${isCheckActive ? 'is-current' : ''}" onclick="setPlayerAction(${player.id}, 'CHECK')">CHECK</button>
          <button type="button" class="op-btn-act act-call ${isCallActive ? 'is-current' : ''}" onclick="setPlayerAction(${player.id}, 'CALL')">CALL</button>
          <button type="button" class="op-btn-act act-raise ${isRaiseActive ? 'is-current' : ''}" onclick="setPlayerAction(${player.id}, 'RAISE')">RAISE</button>
          <button type="button" class="op-btn-act act-allin ${isAllinActive ? 'is-current' : ''}" onclick="setPlayerAction(${player.id}, 'ALL-IN')">ALL-IN</button>
        </div>
      </div>
    `;

    actionsHtml = `
      <div class="op-card-actions" style="margin-top:2px;">
        <button class="op-btn op-btn-secondary op-btn-sm" style="flex:1;" onclick="openConvert(${player.id})">
          🔄 Convert
        </button>
        <button class="op-btn op-btn-secondary op-btn-sm" style="flex:1;" onclick="editPlayer(${player.id})">
          ✏ Edit Player
        </button>
      </div>
    `;
  }

  div.innerHTML = `
    <div class="op-card-top">
      <div class="op-card-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
        <span>${player.name}</span>
        ${roleBadge}
        ${actionBadge}
      </div>
      <div class="op-card-status ${badgeClass}">${badgeText}</div>
    </div>
    <div class="op-card-stats">
      <div class="op-stat">
        <div class="op-stat-label">CHIPS</div>
        <div class="op-stat-value">${chipsStr}</div>
      </div>
      <div class="op-stat">
        <div class="op-stat-label">MEDALS</div>
        <div class="op-stat-value gold">${medalsStr} 🏅</div>
      </div>
    </div>
    ${player.lastTryUsed ? `<div style="font-size:10px;color:var(--amber);font-weight:600;letter-spacing:.1em;">⚠ LAST TRY USED</div>` : ''}
    ${liveActionBarHtml}
    ${actionsHtml}
  `;

  return div;
}

// ══════════════════════════════════════════════════════════
// NEW HAND MODAL
// ══════════════════════════════════════════════════════════
function openNewHand() {
  const activePlayers = GAME_STATE.players.filter(p => p.status !== 'eliminated');

  // Build player input cards
  const container = document.getElementById('nh-player-inputs');
  container.innerHTML = '';
  activePlayers.forEach(p => {
    const card = document.createElement('div');
    card.className = 'nh-player-card';
    card.innerHTML = `
      <div class="nh-player-name">${p.name}</div>
      <div class="nh-player-chips">Chips: <strong>${p.chips.toLocaleString()}</strong> · 🏅 ${p.medals}</div>
      <div class="nh-row">
        <label class="form-label">Total Contribution (chips)</label>
        <input class="form-input" id="contrib-${p.id}" type="number" min="0" max="${p.chips}" placeholder="0" />
      </div>
      <div class="nh-action-pills">
        <div class="pill pill-fold" id="fold-${p.id}" onclick="toggleFold(${p.id})">FOLD</div>
        <div class="pill pill-allin" id="allin-${p.id}" onclick="toggleAllIn(${p.id}, ${p.chips})">ALL-IN</div>
      </div>
    `;
    container.appendChild(card);
  });

  // Build winner select
  const sel = document.getElementById('nh-winner');
  sel.innerHTML = '<option value="">Select winner…</option>';
  activePlayers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });

  document.getElementById('modal-hand-num').textContent = `#${GAME_STATE.hand}`;
  openModal('modal-newhand');
}

function toggleFold(playerId) {
  const foldBtn = document.getElementById(`fold-${playerId}`);
  const input = document.getElementById(`contrib-${playerId}`);
  foldBtn.classList.toggle('active');
  if (foldBtn.classList.contains('active')) {
    input.value = '0';
    input.disabled = true;
  } else {
    input.disabled = false;
  }
}

function toggleAllIn(playerId, chips) {
  const allinBtn = document.getElementById(`allin-${playerId}`);
  const input = document.getElementById(`contrib-${playerId}`);
  allinBtn.classList.toggle('active');
  if (allinBtn.classList.contains('active')) {
    input.value = chips;
    input.disabled = true;
  } else {
    input.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════
// PREVIEW / CONFIRM HAND
// ══════════════════════════════════════════════════════════
function previewHand() {
  const winnerId = parseInt(document.getElementById('nh-winner').value);
  if (!winnerId) {
    showOpAlert('PILIH PEMENANG', 'Silakan pilih pemenang hand terlebih dahulu sebelum melanjutkan konfirmasi.', 'gold');
    return;
  }

  const winner = GAME_STATE.players.find(p => p.id === winnerId);
  const activePlayers = GAME_STATE.players.filter(p => p.status !== 'eliminated');

  // Calculate contributions and medal risks
  const contributions = {};
  let totalPot = 0;

  activePlayers.forEach(p => {
    const input = document.getElementById(`contrib-${p.id}`);
    const contrib = input ? parseInt(input.value) || 0 : 0;
    contributions[p.id] = contrib;
    totalPot += contrib;
  });

  // Calculate medal deltas
  // Rules: each 400 chips contribution = 1 medal risk for losers
  // Winner gains medals lost by losers + center contribution
  const medalDeltas = {};
  let winnerGain = 0;

  activePlayers.forEach(p => {
    if (p.id === winnerId) {
      medalDeltas[p.id] = 0; // fill in after
      return;
    }
    const contrib = contributions[p.id] || 0;
    if (contrib > 0) {
      const loss = Math.floor(contrib / 400);
      medalDeltas[p.id] = -loss;
      winnerGain += loss;
    } else {
      medalDeltas[p.id] = 0; // folded
    }
  });

  // Center gives 1 medal when > 1 loser contributes
  const losersWithContrib = activePlayers.filter(p => p.id !== winnerId && (contributions[p.id] || 0) > 0);
  let centerDelta = 0;
  if (losersWithContrib.length >= 1 && GAME_STATE.centerMedals > 0) {
    centerDelta = -1;
    winnerGain += 1;
  }
  medalDeltas[winnerId] = winnerGain;

  pendingHandResult = { winnerId, contributions, medalDeltas, centerDelta, totalPot };

  // Build confirm body
  const body = document.getElementById('confirm-body');
  body.innerHTML = '';

  // Winner section
  const winSec = document.createElement('div');
  winSec.className = 'confirm-section';
  winSec.innerHTML = `
    <div class="confirm-section-title">WINNER</div>
    <div class="confirm-winner-name">${winner.name}</div>
    <div style="font-size:12px;color:var(--text-secondary);">Total pot: ${totalPot.toLocaleString()} chips</div>
  `;
  body.appendChild(winSec);

  // Medal risk section
  const riskPlayers = activePlayers.filter(p => p.id !== winnerId && (contributions[p.id] || 0) > 0);
  if (riskPlayers.length) {
    const riskSec = document.createElement('div');
    riskSec.className = 'confirm-section';
    riskSec.innerHTML = `<div class="confirm-section-title">MEDAL RISK</div>`;
    riskPlayers.forEach(p => {
      const contrib = contributions[p.id];
      const loss = Math.abs(medalDeltas[p.id]);
      const row = document.createElement('div');
      row.className = 'confirm-row';
      row.innerHTML = `
        <div>
          <div class="confirm-row-name">${p.name}</div>
          <div class="confirm-row-detail">${contrib.toLocaleString()} chips → ${loss} medal${loss !== 1 ? 's' : ''}</div>
        </div>
        <div class="confirm-row-medal neg">−${loss} 🏅</div>
      `;
      riskSec.appendChild(row);
    });
    body.appendChild(riskSec);
  }

  // Medal deltas summary
  const deltaSec = document.createElement('div');
  deltaSec.className = 'confirm-section';
  deltaSec.innerHTML = `<div class="confirm-section-title">MEDAL CHANGES</div>`;

  activePlayers.forEach(p => {
    const d = medalDeltas[p.id];
    if (d === 0) return;
    const row = document.createElement('div');
    row.className = 'confirm-row';
    const cls = d > 0 ? 'pos' : 'neg';
    const sign = d > 0 ? '+' : '';
    row.innerHTML = `
      <div class="confirm-row-name">${p.name}</div>
      <div class="confirm-row-medal ${cls}">${sign}${d} 🏅</div>
    `;
    deltaSec.appendChild(row);
  });

  if (centerDelta !== 0) {
    const row = document.createElement('div');
    row.className = 'confirm-row';
    row.innerHTML = `
      <div class="confirm-row-name">CENTER</div>
      <div class="confirm-row-medal neu">${centerDelta} 🏅</div>
    `;
    deltaSec.appendChild(row);
  }

  body.appendChild(deltaSec);

  document.getElementById('confirm-hand-num').textContent = `#${GAME_STATE.hand}`;
  closeModal('modal-newhand');
  openModal('modal-confirm');
}

function confirmHand() {
  if (!pendingHandResult) return;
  const { winnerId, contributions, medalDeltas, centerDelta, totalPot } = pendingHandResult;

  const bustedPlayers = [];

  // Apply medal changes
  GAME_STATE.players.forEach(p => {
    const delta = medalDeltas[p.id];
    if (delta === undefined) return;

    p.medals += delta;
    if (p.medals < 0) p.medals = 0;

    // Check bust
    if (p.id !== winnerId && p.medals === 0 && p.status !== 'eliminated') {
      bustedPlayers.push(p);
    }
  });

  // Apply winner chip gain
  const winner = GAME_STATE.players.find(p => p.id === winnerId);
  if (winner) {
    winner.chips += totalPot;
  }

  // Apply chip losses (subtract contributions)
  GAME_STATE.players.forEach(p => {
    if (p.id === winnerId) return;
    const contrib = contributions[p.id] || 0;
    p.chips -= contrib;
    if (p.chips < 0) p.chips = 0;
  });

  // Center medals
  GAME_STATE.centerMedals += centerDelta;
  if (GAME_STATE.centerMedals < 0) GAME_STATE.centerMedals = 0;

  // Record hand in history
  const handRecord = {
    hand: GAME_STATE.hand,
    winner: winner?.name || '?',
    deltas: GAME_STATE.players
      .filter(p => (medalDeltas[p.id] || 0) !== 0)
      .map(p => ({ name: p.name, medals: medalDeltas[p.id] }))
  };
  if (centerDelta !== 0) handRecord.deltas.push({ name: 'CENTER', medals: centerDelta });
  GAME_STATE.recentHands.unshift(handRecord);

  GAME_STATE.hand++;
  pendingHandResult = null;

  // Auto-roll Dealer, Small Blind, and Big Blind to next players
  rollDealerPositions(true);

  saveLocalState();
  renderPlayerCards();
  renderLog();
  closeModal('modal-confirm');

  // Sync to Supabase
  syncTournamentToSupabase();
  GAME_STATE.players.forEach(p => syncPlayerToSupabase(p));
  syncHandHistoryToSupabase(handRecord);

  // Handle busts sequentially
  if (bustedPlayers.length > 0) {
    handleBust(bustedPlayers, 0);
  }
}

// ══════════════════════════════════════════════════════════
// BUST / LAST TRY HANDLING
// ══════════════════════════════════════════════════════════
function handleBust(players, index) {
  if (index >= players.length) return;
  const player = players[index];

  const body = document.getElementById('bust-body');

  if (!player.lastTryUsed) {
    // First bust — give last try
    player.lastTryUsed = true;
    player.status = 'lasttry';
    player.chips += LAST_TRY_CHIPS;
    const returned = player.medals;
    player.medals = 0;
    GAME_STATE.centerMedals += returned;

    body.innerHTML = `
      <div class="bust-alert">
        <div style="font-size:11px;color:var(--text-muted);letter-spacing:.16em;">BUSTED</div>
        <div class="bust-player-name">${player.name}</div>
        <div class="bust-subtitle first">FIRST BUST — LAST TRY ACTIVATED</div>
        <div class="bust-details">
          <div class="bust-detail-row">
            <span class="bust-detail-label">Chips received</span>
            <span class="bust-detail-value green">+${LAST_TRY_CHIPS.toLocaleString()}</span>
          </div>
          <div class="bust-detail-row">
            <span class="bust-detail-label">Medals returned</span>
            <span class="bust-detail-value gold">${returned} → CENTER</span>
          </div>
        </div>
        <div class="bust-badge amber">LAST TRY USED</div>
      </div>
    `;
  } else {
    // Second bust — eliminated
    player.status = 'eliminated';
    player.chips = 0;

    body.innerHTML = `
      <div class="bust-alert">
        <div style="font-size:11px;color:var(--text-muted);letter-spacing:.16em;">ELIMINATED</div>
        <div class="bust-player-name">${player.name}</div>
        <div class="bust-subtitle final">LAST TRY ALREADY USED</div>
        <div class="bust-details">
          <div class="bust-detail-row">
            <span class="bust-detail-label">Tournament status</span>
            <span class="bust-detail-value" style="color:var(--red)">OUT</span>
          </div>
        </div>
        <div class="bust-badge red">PLAYER ELIMINATED</div>
      </div>
    `;
  }

  // Override continue button to go to next bust
  const footer = document.querySelector('#modal-bust .modal-footer');
  footer.innerHTML = `<button class="op-btn op-btn-gold full-width" onclick="nextBust(${JSON.stringify(players.map(p => p.id))}, ${index + 1})">CONTINUE →</button>`;

  saveLocalState();
  renderPlayerCards();
  openModal('modal-bust');
}

function nextBust(playerIds, nextIndex) {
  closeModal('modal-bust');
  const players = playerIds.map(id => GAME_STATE.players.find(p => p.id === id));
  if (nextIndex < players.length) {
    setTimeout(() => handleBust(players, nextIndex), 100);
  }
}

// ══════════════════════════════════════════════════════════
// MEDAL CONVERT MODAL
// ══════════════════════════════════════════════════════════
function openConvert(playerId) {
  convertPlayerId = playerId;
  convertAmount = 1;
  renderConvertModal();
  openModal('modal-convert');
}

function renderConvertModal() {
  const player = GAME_STATE.players.find(p => p.id === convertPlayerId);
  if (!player) return;

  const chipsGain = convertAmount * MEDAL_VALUE;
  const afterChips = player.chips + chipsGain;
  const afterMedals = player.medals - convertAmount;

  const body = document.getElementById('convert-body');
  body.innerHTML = `
    <div class="convert-player-info">
      <div class="convert-player-name">${player.name}</div>
      <div class="convert-current-stats">
        <div><strong>${player.chips.toLocaleString()}</strong> chips</div>
        <div><strong>${player.medals}</strong> 🏅 medals</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <div class="form-label">MEDALS TO CONVERT</div>
      <div class="convert-amount-row">
        <button class="counter-btn" onclick="adjustConvert(-1)">−</button>
        <div class="counter-value" id="convert-count">${convertAmount}</div>
        <button class="counter-btn" onclick="adjustConvert(+1)">+</button>
      </div>
    </div>
    <div class="convert-preview-box">
      <div class="convert-preview-row">
        <span class="convert-preview-label">Chips gained</span>
        <span class="convert-preview-value green">+${chipsGain.toLocaleString()}</span>
      </div>
      <div class="convert-preview-row">
        <span class="convert-preview-label">After chips</span>
        <span class="convert-preview-value">${afterChips.toLocaleString()}</span>
      </div>
      <div class="convert-preview-row">
        <span class="convert-preview-label">After medals</span>
        <span class="convert-preview-value gold">${afterMedals} 🏅</span>
      </div>
    </div>
  `;
}

function adjustConvert(delta) {
  const player = GAME_STATE.players.find(p => p.id === convertPlayerId);
  if (!player) return;
  convertAmount = Math.max(1, Math.min(player.medals, convertAmount + delta));
  renderConvertModal();
}

function confirmConvert() {
  const player = GAME_STATE.players.find(p => p.id === convertPlayerId);
  if (!player) return;

  player.chips += convertAmount * MEDAL_VALUE;
  player.medals -= convertAmount;

  saveLocalState();
  renderPlayerCards();
  closeModal('modal-convert');

  // Supabase sync
  syncPlayerToSupabase(player);
}

// ══════════════════════════════════════════════════════════
// LIVE PLAYER ACTIONS (FOLD, CHECK, CALL, RAISE, ALL-IN)
// ══════════════════════════════════════════════════════════
async function setPlayerAction(playerId, action) {
  const player = GAME_STATE.players.find(p => p.id === playerId);
  if (!player) return;

  // If clicking RAISE, open custom nominal modal!
  if (action === 'RAISE') {
    triggerRaiseModal(player);
    return;
  }

  // Toggle off if clicking the same action
  if (player.currentAction === action) {
    player.currentAction = null;
  } else {
    player.currentAction = action;
  }

  saveLocalState();
  renderPlayerCards();

  // Instant sync to Supabase
  try {
    await syncPlayerToSupabase(player);
  } catch (err) {
    console.error("Error syncing player action:", err);
  }
}

// ── RAISE MODAL & LOGIC ───────────────────────────────────
function triggerRaiseModal(player) {
  document.getElementById('raise-player-id').value = player.id;
  document.getElementById('raise-player-name').textContent = player.name;
  
  const curBlind = getCurrentBlind();
  const bb = curBlind ? curBlind.bb : 150;
  const playerChips = player.chips || 0;

  document.getElementById('raise-player-info').textContent = `${player.name} memiliki ${playerChips.toLocaleString()} chips (BB saat ini: ${bb})`;

  // Preset default value: 2x BB or 300
  const defaultRaise = Math.min(playerChips, bb * 2);
  const inputEl = document.getElementById('raise-amount-input');
  inputEl.value = defaultRaise;
  inputEl.max = playerChips;

  // Quick preset buttons
  const presetsContainer = document.getElementById('raise-quick-presets');
  const p1 = bb * 2;
  const p2 = bb * 3;
  const p3 = bb * 4;
  const allin = playerChips;

  presetsContainer.innerHTML = `
    <button type="button" class="op-btn op-btn-secondary op-btn-sm" style="flex:1;" onclick="setRaiseVal(${p1})">${p1} (2x BB)</button>
    <button type="button" class="op-btn op-btn-secondary op-btn-sm" style="flex:1;" onclick="setRaiseVal(${p2})">${p2} (3x BB)</button>
    <button type="button" class="op-btn op-btn-secondary op-btn-sm" style="flex:1;" onclick="setRaiseVal(${p3})">${p3} (4x BB)</button>
    <button type="button" class="op-btn op-btn-secondary op-btn-sm" style="flex:1;border-color:rgba(192,132,252,0.4);color:#c084fc;" onclick="setRaiseVal(${allin})">ALL-IN (${allin})</button>
  `;

  openModal('modal-raise');
  setTimeout(() => {
    inputEl.focus();
    inputEl.select();
  }, 100);
}

function setRaiseVal(val) {
  const input = document.getElementById('raise-amount-input');
  if (input) input.value = val;
}

async function confirmRaiseAction() {
  const id = parseInt(document.getElementById('raise-player-id').value);
  const player = GAME_STATE.players.find(p => p.id === id);
  if (!player) return;

  const rawVal = parseInt(document.getElementById('raise-amount-input').value);
  let actionText = 'RAISE';
  if (!isNaN(rawVal) && rawVal > 0) {
    actionText = `RAISE ${rawVal.toLocaleString()}`;
  }

  player.currentAction = actionText;

  saveLocalState();
  renderPlayerCards();
  closeModal('modal-raise');

  // Sync to Supabase
  try {
    await syncPlayerToSupabase(player);
  } catch (err) {
    console.error("Error syncing raise action:", err);
  }
}

// ── POKER ROUND SESSIONS (PRE-FLOP, FLOP, TURN, RIVER, SHOWDOWN) ──
async function changePokerRound(roundName) {
  GAME_STATE.currentRound = roundName;
  saveLocalState();
  
  // Sync tournament to Supabase so Public Display updates immediately
  try {
    await syncTournamentToSupabase();
    showOpAlert("SESI DIUBAH", `Sesi ronde meja berhasil dialihkan ke: ${roundName}!\nLayar monitor publik langsung tersinkronisasi.`, "green");
  } catch (err) {
    console.error("Error updating round:", err);
  }
}

async function clearAllPlayerActions() {
  GAME_STATE.players.forEach(p => {
    p.currentAction = null;
  });
  saveLocalState();
  renderPlayerCards();
  
  // Sync to Supabase
  for (const p of GAME_STATE.players) {
    syncPlayerToSupabase(p);
  }
  showOpAlert("ACTION DIRESET", "Semua status action pemain (Fold, Raise, Call, Check, All-in) berhasil dibersihkan untuk ronde baru.", "green");
}

// ══════════════════════════════════════════════════════════
// EDIT PLAYER CUSTOM MODAL (Chips, Medals, Status, Action)
// ══════════════════════════════════════════════════════════
function editPlayer(playerId) {
  const player = GAME_STATE.players.find(p => p.id === playerId);
  if (!player) return;

  document.getElementById('edit-player-id').value = player.id;
  document.getElementById('edit-player-title-name').textContent = player.name;
  document.getElementById('edit-player-chips').value = player.chips != null ? player.chips : 0;
  document.getElementById('edit-player-medals').value = player.medals != null ? player.medals : 0;
  document.getElementById('edit-player-status').value = player.status || 'active';
  document.getElementById('edit-player-action').value = player.currentAction || '';

  openModal('modal-edit-player');
}

async function savePlayerEdit() {
  const id = parseInt(document.getElementById('edit-player-id').value);
  const player = GAME_STATE.players.find(p => p.id === id);
  if (!player) return;

  const chipsVal = parseInt(document.getElementById('edit-player-chips').value);
  const medalsVal = parseInt(document.getElementById('edit-player-medals').value);
  const statusVal = document.getElementById('edit-player-status').value;
  const actionVal = document.getElementById('edit-player-action').value.trim() || null;

  if (!isNaN(chipsVal) && chipsVal >= 0) {
    player.chips = chipsVal;
  }
  if (!isNaN(medalsVal) && medalsVal >= 0) {
    player.medals = medalsVal;
  }
  if (statusVal) {
    player.status = statusVal;
    if (statusVal === 'lasttry') player.lastTryUsed = true;
    if (statusVal === 'active' && player.chips > 0) player.lastTryUsed = false;
  }
  player.currentAction = actionVal;

  saveLocalState();
  renderPlayerCards();
  closeModal('modal-edit-player');

  // Supabase sync
  try {
    await syncPlayerToSupabase(player);
    showOpAlert("DATA TERSIMPAN", `Data pemain ${player.name} berhasil diperbarui dan disinkronkan ke cloud!`, "green");
  } catch (err) {
    console.error("Error saving player edit:", err);
  }
}

// ══════════════════════════════════════════════════════════
// LOG RENDER
// ══════════════════════════════════════════════════════════
function renderLog() {
  $log.innerHTML = '';
  GAME_STATE.recentHands.forEach(h => {
    const item = document.createElement('div');
    item.className = 'op-log-item';

    let lines = h.deltas.map(d => {
      const sign = d.medals > 0 ? '+' : '';
      const cls = d.medals > 0 ? 'pos' : (d.medals < 0 ? 'neg' : '');
      return `<div class="op-log-line ${cls}">${d.name}${d.note ? ' · ' + d.note : ''} ${d.medals !== 0 ? sign + d.medals + ' 🏅' : ''}</div>`;
    }).join('');

    item.innerHTML = `
      <div class="op-log-hand">HAND #${h.hand}</div>
      <div class="op-log-winner">🏆 ${h.winner}</div>
      ${lines}
    `;
    $log.appendChild(item);
  });
}

// ══════════════════════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════════════════════
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ══════════════════════════════════════════════════════════
// TIMER & BLIND SETTINGS CONTROLLER
// ══════════════════════════════════════════════════════════
function openTimerSettings() {
  const levelSelect = document.getElementById('timer-blind-level');
  if (levelSelect && GAME_STATE.blindSchedule) {
    levelSelect.innerHTML = '';
    GAME_STATE.blindSchedule.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.level;
      opt.textContent = `Level ${b.level} (${b.sb} / ${b.bb})`;
      if (b.level === (GAME_STATE.blindLevel || 1)) opt.selected = true;
      levelSelect.appendChild(opt);
    });
  }

  document.getElementById('timer-duration-min').value = Math.round((GAME_STATE.blindIntervalSecs || 900) / 60);

  // Current blind countdown remaining
  const remainSecs = getBlindCountdownSecs();
  document.getElementById('timer-current-min').value = Math.floor(remainSecs / 60);
  document.getElementById('timer-current-sec').value = Math.floor(remainSecs % 60);

  // Current countdown remaining
  const countdownSecs = getEventCountdownSecs();
  document.getElementById('timer-countdown-hour').value = Math.floor(countdownSecs / 3600);
  document.getElementById('timer-countdown-min').value = Math.floor((countdownSecs % 3600) / 60);
  document.getElementById('timer-countdown-sec').value = Math.floor(countdownSecs % 60);

  openModal('modal-timer');
}

async function saveTimerSettings() {
  const newLevel = parseInt(document.getElementById('timer-blind-level').value) || 1;
  const durationMin = parseInt(document.getElementById('timer-duration-min').value) || 15;
  const curMin = parseInt(document.getElementById('timer-current-min').value) || 0;
  const curSec = parseInt(document.getElementById('timer-current-sec').value) || 0;
  const ctdHour = parseInt(document.getElementById('timer-countdown-hour').value) || 0;
  const ctdMin = parseInt(document.getElementById('timer-countdown-min').value) || 0;
  const ctdSec = parseInt(document.getElementById('timer-countdown-sec').value) || 0;

  // Update Game State
  GAME_STATE.blindLevel = newLevel;
  GAME_STATE.blindIntervalSecs = durationMin * 60;

  // Set remaining time on blind countdown
  const desiredRemainSecs = (curMin * 60) + curSec;
  const elapsedInLevel = Math.max(0, GAME_STATE.blindIntervalSecs - desiredRemainSecs);
  GAME_STATE.lastBlindChangeTime = Date.now() - (elapsedInLevel * 1000);

  // Set countdown total and event start time (synchronized for all clients)
  const desiredRemainingCtd = (ctdHour * 3600) + (ctdMin * 60) + ctdSec;
  GAME_STATE.eventStartTime = Date.now() - ((7200 - desiredRemainingCtd) * 1000);

  saveLocalState();
  closeModal('modal-timer');
  renderPlayerCards();
  notifyStateChanged();

  // Sync to Supabase
  await syncTournamentToSupabase();
  showOpAlert("TIMER DISIMPAN", "Pengaturan blind level dan timer countdown turnamen berhasil diperbarui dan disinkronkan ke monitor depan!", "green");
}

function resetBlindTimeToFull() {
  const durationMin = parseInt(document.getElementById('timer-duration-min').value) || 15;
  document.getElementById('timer-current-min').value = durationMin;
  document.getElementById('timer-current-sec').value = 0;
}

function resetTimerToStart() {
  showOpConfirm(
    "RESET TIMER COUNTDOWN",
    "Apakah Anda yakin ingin mereset timer countdown pertandingan ke 2 jam penuh?",
    () => {
      document.getElementById('timer-countdown-hour').value = 2;
      document.getElementById('timer-countdown-min').value = 0;
      document.getElementById('timer-countdown-sec').value = 0;
    },
    'gold'
  );
}

// ── Start ─────────────────────────────────────────────────
init();
