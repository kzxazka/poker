/* ═══════════════════════════════════════════════════════════
   POKER MES — OPERATOR REMOTE CONTROLLER LOGIC
   Mobile-First • Tactile D-Pad • Lightweight & Real-Time Sync
═══════════════════════════════════════════════════════════ */

loadLocalFallback();

// ── State ─────────────────────────────────────────────────
let isPaused = false;
let convertPlayerId = null;
let convertAmount = 1;
let currentTab = 'players';

const MEDAL_VALUE = 400; // Chips per medal
const LAST_TRY_CHIPS = 400;

// ── DOM refs ──────────────────────────────────────────────
const $opHand           = document.getElementById('op-hand');
const $opBarRound       = document.getElementById('op-bar-round');
const $opBarPot         = document.getElementById('op-bar-pot');
const $opBarBet         = document.getElementById('op-bar-bet');
const $opBlindLevelNum  = document.getElementById('op-blind-level-num');
const $opBlind          = document.getElementById('op-blind');
const $opBlindStepVal   = document.getElementById('op-blind-step-val');
const $opBlindTimer     = document.getElementById('op-blind-timer');
const $opTimer          = document.getElementById('op-timer');
const $opCenter         = document.getElementById('op-center');
const $syncBadge        = document.getElementById('op-sync-status');
const $syncText         = document.getElementById('op-sync-text');
const $roundSelect      = document.getElementById('op-round-select');
const $playerGrid       = document.getElementById('op-player-grid');
const $opLog            = document.getElementById('op-log');

// Remote Showcase DOM refs
const $activePlayerSeat = document.getElementById('active-player-seat');
const $activePlayerName = document.getElementById('active-player-name');
const $activePlayerRole = document.getElementById('active-player-role');
const $activePlayerChips= document.getElementById('active-player-chips');
const $activePlayerMedals=document.getElementById('active-player-medals');
const $activeToCallBadge= document.getElementById('active-to-call-badge');
const $remoteCallAmt    = document.getElementById('remote-call-amt');
const $remoteCheckBtn   = document.getElementById('remote-check-btn');
const $showdownBanner   = document.getElementById('op-showdown-banner');
const $showdownPot      = document.getElementById('op-showdown-pot');
const $showdownPlayerBtns = document.getElementById('op-showdown-player-btns');

// ── Custom Alert & Confirmation System ────────────────────
function showOpAlert(title, message, type = 'gold') {
  const iconBox = document.getElementById('op-alert-icon-box');
  const iconEl = document.getElementById('op-alert-icon');
  const titleEl = document.getElementById('op-alert-title');
  const msgEl = document.getElementById('op-alert-msg');
  const actionsEl = document.getElementById('op-alert-actions');

  if (!titleEl || !msgEl) return;
  titleEl.textContent = title;
  msgEl.textContent = message;

  if (iconBox) {
    iconBox.className = `modal-alert-icon ${type}`;
    if (type === 'red') iconEl.textContent = '✕';
    else if (type === 'green') iconEl.textContent = '✓';
    else iconEl.textContent = 'ℹ';
  }

  if (actionsEl) {
    actionsEl.innerHTML = `<button type="button" class="op-btn op-btn-gold" style="width:100%;" onclick="closeModal('modal-alert')">MENGERTI</button>`;
  }
  openModal('modal-alert');
}

function showOpConfirm(title, message, onConfirm, type = 'gold') {
  const iconBox = document.getElementById('op-alert-icon-box');
  const iconEl = document.getElementById('op-alert-icon');
  const titleEl = document.getElementById('op-alert-title');
  const msgEl = document.getElementById('op-alert-msg');
  const actionsEl = document.getElementById('op-alert-actions');

  if (!titleEl || !msgEl) return;
  titleEl.textContent = title;
  msgEl.textContent = message;

  if (iconBox) {
    iconBox.className = `modal-alert-icon ${type}`;
    if (type === 'red') iconEl.textContent = '⚠️';
    else iconEl.textContent = '❓';
  }

  if (actionsEl) {
    actionsEl.innerHTML = `
      <button type="button" class="op-btn op-btn-secondary" style="flex:1;" onclick="closeModal('modal-alert')">BATAL</button>
      <button type="button" class="op-btn op-btn-gold" id="op-confirm-btn-yes" style="flex:1;">YA, LANJUTKAN</button>
    `;
    const btnYes = document.getElementById('op-confirm-btn-yes');
    if (btnYes) {
      btnYes.onclick = () => {
        closeModal('modal-alert');
        if (typeof onConfirm === 'function') onConfirm();
      };
    }
  }

  openModal('modal-alert');
}

function updateSyncStatus(connected, text = null) {
  if (!$syncBadge) return;
  if (connected) {
    $syncBadge.style.background = 'rgba(16, 185, 129, 0.12)';
    $syncBadge.style.borderColor = 'rgba(16, 185, 129, 0.35)';
    $syncBadge.style.color = 'var(--emerald-light)';
    if ($syncText) $syncText.textContent = text || 'LIVE';
  } else {
    $syncBadge.style.background = 'rgba(239, 68, 68, 0.12)';
    $syncBadge.style.borderColor = 'rgba(239, 68, 68, 0.35)';
    $syncBadge.style.color = 'var(--red)';
    if ($syncText) $syncText.textContent = text || 'OFFLINE';
  }
}

async function loadActiveGame() {
  if ($syncText) $syncText.textContent = 'SYNCING...';
  try {
    await fetchSupabaseState();
    renderRemoteUI();
    updateSyncStatus(true, 'LIVE');
    showOpAlert('KONEKSI BERHASIL', `Berhasil menyambung ke game aktif Supabase!\nHand #${GAME_STATE.hand} • Level ${GAME_STATE.blindLevel} • ${GAME_STATE.players.length} Pemain`, 'green');
  } catch (err) {
    updateSyncStatus(false, 'ERROR');
    showOpAlert('KONEKSI GAGAL', 'Tidak dapat mengambil game dari cloud:\n' + err.message, 'red');
  }
}

// ── Tab Controller ─────────────────────────────────────────
function switchRemoteTab(tabName) {
  currentTab = tabName;
  const tabs = ['players', 'controls', 'history'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const pane = document.getElementById(`tab-pane-${t}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (pane) pane.classList.toggle('active', t === tabName);
  });
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  onGameStateChange(() => {
    renderRemoteUI();
    tick();
  });

  try {
    updateSyncStatus(true, 'CONNECTING...');
    await fetchSupabaseState();
    updateSyncStatus(true, 'LIVE');
  } catch (e) {
    console.error("Operator Supabase init error:", e);
    updateSyncStatus(false, 'LOCAL');
  }

  subscribeToSupabase();

  renderRemoteUI();
  tick();
  setInterval(tick, 1000);

  // Fallback quiet polling every 20s (Realtime WebSocket handles instant sync)
  setInterval(() => {
    fetchSupabaseState(false);
  }, 20000);
}

// ── Main UI Renderer ──────────────────────────────────────
function renderRemoteUI() {
  const curBlind = getCurrentBlind() || { sb: 25, bb: 50 };

  // 1. Status Bar updates
  if ($opHand) $opHand.textContent = `#${GAME_STATE.hand}`;
  if ($opBarRound) $opBarRound.textContent = GAME_STATE.currentRound || 'PRE-FLOP';
  if ($opBarPot) $opBarPot.textContent = (GAME_STATE.pot || 0).toLocaleString();
  if ($opBarBet) $opBarBet.textContent = (GAME_STATE.currentBet || 0).toLocaleString();
  if ($opBlindLevelNum) $opBlindLevelNum.textContent = `L${GAME_STATE.blindLevel}`;
  if ($opBlind) $opBlind.textContent = `${curBlind.sb}/${curBlind.bb}`;
  if ($opBlindStepVal) $opBlindStepVal.textContent = `Level ${GAME_STATE.blindLevel} (${curBlind.sb}/${curBlind.bb})`;
  if ($opCenter) $opCenter.textContent = `${GAME_STATE.centerMedals} 🏅`;

  if ($roundSelect && document.activeElement !== $roundSelect) {
    if (GAME_STATE.currentRound) $roundSelect.value = GAME_STATE.currentRound;
  }

  // 2. Showdown Winner Selection Banner
  const eligible = typeof getEligibleTurnPlayers === 'function' ? getEligibleTurnPlayers() : GAME_STATE.players;
  const isShowdown = GAME_STATE.currentRound === 'SHOWDOWN' || (eligible.length === 1 && GAME_STATE.players.filter(p => p.status !== 'eliminated').length > 1);

  if ($showdownBanner && $showdownPlayerBtns) {
    if (isShowdown) {
      $showdownBanner.style.display = 'flex';
      if ($showdownPot) $showdownPot.textContent = (GAME_STATE.pot || 0).toLocaleString();
      $showdownPlayerBtns.innerHTML = '';
      eligible.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'showdown-pick-btn';
        btn.innerHTML = `🏆 ${p.name} (+${(GAME_STATE.pot || 0).toLocaleString()})`;
        btn.onclick = () => handleOpWinnerPick(p.id);
        $showdownPlayerBtns.appendChild(btn);
      });
    } else {
      $showdownBanner.style.display = 'none';
    }
  }

  // 3. Active Turn Player Showcase & D-Pad State
  const turnPlayer = GAME_STATE.players.find(p => p.id === GAME_STATE.activeTurnPlayerId);

  if (turnPlayer && !isShowdown) {
    const curPaid = (GAME_STATE.roundBets && GAME_STATE.roundBets[turnPlayer.id]) || 0;
    const minBet = GAME_STATE.currentRound === 'PRE-FLOP' ? curBlind.bb : 0;
    const curBet = Math.max(GAME_STATE.currentBet || 0, minBet);
    const toCall = Math.max(0, curBet - curPaid);

    if ($activePlayerSeat) $activePlayerSeat.textContent = `SEAT ${turnPlayer.sortOrder || turnPlayer.id}`;
    if ($activePlayerName) $activePlayerName.textContent = turnPlayer.name;

    // Role badge
    if ($activePlayerRole) {
      if (turnPlayer.positionRole === 'D') {
        $activePlayerRole.className = 'active-role-badge role-d';
        $activePlayerRole.textContent = 'D';
      } else if (turnPlayer.positionRole === 'SB') {
        $activePlayerRole.className = 'active-role-badge role-sb';
        $activePlayerRole.textContent = `SB (${curBlind.sb})`;
      } else if (turnPlayer.positionRole === 'BB') {
        $activePlayerRole.className = 'active-role-badge role-bb';
        $activePlayerRole.textContent = `BB (${curBlind.bb})`;
      } else {
        $activePlayerRole.className = 'active-role-badge';
        $activePlayerRole.textContent = '';
      }
    }

    if ($activePlayerChips) $activePlayerChips.textContent = (turnPlayer.chips || 0).toLocaleString();
    if ($activePlayerMedals) $activePlayerMedals.textContent = `${turnPlayer.medals || 0} 🏅`;

    // To call prompt
    if ($activeToCallBadge) {
      if (toCall > 0) {
        $activeToCallBadge.className = 'prompt-badge call-needed';
        $activeToCallBadge.textContent = `TO CALL: ${toCall.toLocaleString()} CHIPS`;
      } else {
        $activeToCallBadge.className = 'prompt-badge can-check';
        $activeToCallBadge.textContent = `FREE TO CHECK / BET`;
      }
    }

    // D-Pad dynamic state
    if ($remoteCallAmt) {
      $remoteCallAmt.textContent = toCall > 0 ? toCall.toLocaleString() : '0';
    }
    if ($remoteCheckBtn) {
      if (toCall > 0) {
        $remoteCheckBtn.classList.add('disabled');
        $remoteCheckBtn.title = `Harus Call ${toCall.toLocaleString()} chips (Tidak bisa Check)`;
      } else {
        $remoteCheckBtn.classList.remove('disabled');
        $remoteCheckBtn.title = 'Check (Bebas tanpa taruhan)';
      }
    }
  } else {
    // No active player or Showdown
    if ($activePlayerSeat) $activePlayerSeat.textContent = isShowdown ? 'SHOWDOWN' : 'STANDBY';
    if ($activePlayerName) $activePlayerName.textContent = isShowdown ? 'TENTUKAN PEMENANG' : 'MENUNGGU GAME';
    if ($activePlayerRole) $activePlayerRole.textContent = '';
    if ($activePlayerChips) $activePlayerChips.textContent = '—';
    if ($activePlayerMedals) $activePlayerMedals.textContent = '—';
    if ($activeToCallBadge) {
      $activeToCallBadge.className = 'prompt-badge';
      $activeToCallBadge.textContent = isShowdown ? 'PILIH PEMENANG DI ATAS' : '—';
    }
    if ($remoteCallAmt) $remoteCallAmt.textContent = '0';
    if ($remoteCheckBtn) $remoteCheckBtn.classList.add('disabled');
  }

  // 4. Render Compact Players List (Tab 1)
  renderCompactPlayers();

  // 5. Render History Log (Tab 3)
  renderLog();
}

function renderCompactPlayers() {
  if (!$playerGrid) return;
  $playerGrid.innerHTML = '';

  const curBlind = getCurrentBlind() || { sb: 25, bb: 50 };
  const sorted = [...(GAME_STATE.players || [])].sort((a, b) => (a.sortOrder || a.id) - (b.sortOrder || b.id));

  sorted.forEach(p => {
    const isTurn = GAME_STATE.activeTurnPlayerId === p.id && GAME_STATE.currentRound !== 'SHOWDOWN';
    const isFolded = (GAME_STATE.foldedPlayerIds || []).includes(p.id) || p.currentAction === 'FOLD';
    const isElim = p.status === 'eliminated';

    const row = document.createElement('div');
    row.className = `player-strip-row ${isTurn ? 'is-current-turn' : ''} ${isFolded ? 'is-folded' : ''}`;

    let roleHtml = '';
    if (p.positionRole === 'D') roleHtml = `<span class="player-strip-role role-d">D</span>`;
    else if (p.positionRole === 'SB') roleHtml = `<span class="player-strip-role role-sb">SB (${curBlind.sb})</span>`;
    else if (p.positionRole === 'BB') roleHtml = `<span class="player-strip-role role-bb">BB (${curBlind.bb})</span>`;

    let actionLabel = '';
    if (p.currentAction) {
      actionLabel = `<span style="font-size:9px;color:var(--text-secondary);font-family:var(--font-mono);margin-left:4px;">(${p.currentAction})</span>`;
    }

    let lastTryBtn = '';
    if (p.chips <= 0 && !p.lastTryUsed && !isElim) {
      lastTryBtn = `<button type="button" class="btn-mini gold" onclick="activatePlayerLastTry(${p.id})">⚡ Last Try</button>`;
    }

    row.innerHTML = `
      <div class="player-strip-left">
        <span class="seat-num">${p.sortOrder || p.id}</span>
        ${roleHtml}
        <span class="player-strip-name" style="${isElim ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${p.name}</span>
        ${actionLabel}
      </div>

      <div class="player-strip-right">
        <span class="strip-stat">${isElim ? 'OUT' : (p.chips || 0).toLocaleString()}</span>
        <span class="strip-stat gold">${p.medals || 0} 🏅</span>
        <div class="strip-action-btns">
          ${lastTryBtn}
          <button type="button" class="btn-mini" onclick="openConvert(${p.id})">🔄</button>
          <button type="button" class="btn-mini" onclick="editPlayer(${p.id})">✏</button>
        </div>
      </div>
    `;

    $playerGrid.appendChild(row);
  });
}

// ── Remote D-Pad Move Handler ──────────────────────────────
async function handleDpadMove(actionType) {
  const playerId = GAME_STATE.activeTurnPlayerId;
  if (!playerId) {
    showOpAlert('TIDAK ADA TURN AKTIF', 'Tidak ada pemain yang sedang giliran bermain saat ini.', 'gold');
    return;
  }

  const player = GAME_STATE.players.find(p => p.id === playerId);
  if (!player) return;

  const curPaid = (GAME_STATE.roundBets && GAME_STATE.roundBets[playerId]) || 0;
  const curBlind = getCurrentBlind() || { sb: 25, bb: 50 };
  const minBet = GAME_STATE.currentRound === 'PRE-FLOP' ? curBlind.bb : 0;
  const curBet = Math.max(GAME_STATE.currentBet || 0, minBet);
  const toCall = Math.max(0, curBet - curPaid);

  if (actionType === 'CHECK') {
    if (toCall > 0) {
      showOpAlert(
        'TIDAK BISA CHECK!',
        `Pemain harus Call ${toCall.toLocaleString()} chips untuk melanjutkan hand ini, atau lakukan Fold/Raise!`,
        'red'
      );
      return;
    }
  } else if (actionType === 'RAISE') {
    triggerRaiseModal(player);
    return;
  }

  const success = await processPlayerMove(playerId, actionType);
  if (success) {
    renderRemoteUI();
    tick();
  }
}

// ── Showdown Winner Pick Handler ───────────────────────────
async function handleOpWinnerPick(winnerId) {
  const winner = GAME_STATE.players.find(p => p.id === winnerId);
  if (!winner) return;

  showOpConfirm(
    "KONFIRMASI PEMENANG HAND",
    `Tentukan ${winner.name} sebagai pemenang Pot (${(GAME_STATE.pot || 0).toLocaleString()} chips)?\nMedal, chips, rotasi dealer, dan hand berikutnya akan dijalankan secara otomatis!`,
    async () => {
      await resolveHandWinner(winnerId);
      renderRemoteUI();
      tick();
      showOpAlert(
        "HAND SELESAI & DEALER DIROTASI 🏆",
        `Pemenang: ${winner.name}\nPot telah ditambahkan. Dealer, SB, dan BB otomatis berputar dan Hand #${GAME_STATE.hand} telah dimulai!`,
        "green"
      );
    },
    'gold'
  );
}

// ── Last Try Activation ────────────────────────────────────
async function activatePlayerLastTry(playerId) {
  const p = GAME_STATE.players.find(x => x.id === playerId);
  if (!p) return;

  p.lastTryUsed = true;
  p.status = 'lasttry';
  p.chips = (p.chips || 0) + LAST_TRY_CHIPS;
  const retMedals = p.medals || 0;
  p.medals = 0;
  GAME_STATE.centerMedals += retMedals;
  GAME_STATE.centerValue = GAME_STATE.centerMedals * (GAME_STATE.rupiahPerMedal || 2000);

  saveLocalState();
  notifyStateChanged();
  renderRemoteUI();
  syncFullStateToSupabase().catch(console.error);

  showOpAlert(
    "LAST TRY DIAKTIFKAN",
    `${p.name} berhasil mengaktifkan Last Try dan menerima +400 chips!\n${retMedals > 0 ? `${retMedals} medal milik ${p.name} otomatis dikembalikan ke Center Medals.` : ''}`,
    "green"
  );
}

// ── Dealer Rolling System ──────────────────────────────────
function rollDealerPositions(silent = false) {
  const activePlayers = GAME_STATE.players.filter(p => p.status !== 'eliminated');
  if (activePlayers.length < 2) return;

  const curBlind = getCurrentBlind() || { sb: 25, bb: 50 };

  let curDealerIdx = activePlayers.findIndex(p => p.positionRole === 'D');
  if (curDealerIdx === -1) curDealerIdx = 0;

  GAME_STATE.players.forEach(p => {
    p.positionRole = null;
    if (p.currentAction && (p.currentAction === 'DEALER' || p.currentAction.startsWith('SB') || p.currentAction.startsWith('BB') || p.currentAction.includes('BLIND'))) {
      p.currentAction = null;
    }
  });

  const nextDealerIdx = (curDealerIdx + 1) % activePlayers.length;
  const nextSbIdx = (nextDealerIdx + 1) % activePlayers.length;
  const nextBbIdx = (nextDealerIdx + 2) % activePlayers.length;

  activePlayers[nextDealerIdx].positionRole = 'D';
  activePlayers[nextDealerIdx].currentAction = 'DEALER';

  activePlayers[nextSbIdx].positionRole = 'SB';
  activePlayers[nextSbIdx].currentAction = `SB ${curBlind.sb}`;

  if (activePlayers.length > 2) {
    activePlayers[nextBbIdx].positionRole = 'BB';
    activePlayers[nextBbIdx].currentAction = `BB ${curBlind.bb}`;
  } else {
    activePlayers[nextDealerIdx].positionRole = 'D';
    activePlayers[nextSbIdx].positionRole = 'BB';
    activePlayers[nextSbIdx].currentAction = `BB ${curBlind.bb}`;
  }

  saveLocalState();
  notifyStateChanged();
  renderRemoteUI();
  syncFullStateToSupabase().catch(console.error);

  if (!silent) {
    const dName = activePlayers[nextDealerIdx].name;
    const sbName = activePlayers[nextSbIdx].name;
    const bbName = activePlayers.length > 2 ? activePlayers[nextBbIdx].name : '-';
    showOpAlert(
      "ROLLING DEALER SUKSES",
      `Posisi meja berhasil dirotasi!\n• DEALER (D): ${dName}\n• SMALL BLIND (SB): ${sbName} (${curBlind.sb})\n• BIG BLIND (BB): ${bbName} (${curBlind.bb})`,
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

// ── Time & Blind Controls ──────────────────────────────────
async function addTournamentTime(seconds) {
  GAME_STATE.eventStartTime = (GAME_STATE.eventStartTime || Date.now()) + (seconds * 1000);
  saveLocalState();
  broadcastState('TIME_UPDATE', {
    eventStartTime: GAME_STATE.eventStartTime,
    lastBlindChangeTime: GAME_STATE.lastBlindChangeTime
  });
  notifyStateChanged();
  tick();
  await syncTournamentToSupabase();
  const mins = Math.round(seconds / 60);
  showOpAlert("WAKTU MATCH DITAMBAHKAN", `Berhasil menambahkan +${mins} menit ke hitung mundur turnamen!\nMonitor publik langsung tersinkronisasi.`, "green");
}

async function addBlindTime(seconds) {
  const curRemain = getBlindCountdownSecs();
  const interval = GAME_STATE.blindIntervalSecs || 900;
  if (curRemain <= 0) {
    const elapsed = Math.max(0, interval - seconds);
    GAME_STATE.lastBlindChangeTime = Date.now() - (elapsed * 1000);
  } else {
    GAME_STATE.lastBlindChangeTime = (GAME_STATE.lastBlindChangeTime || Date.now()) + (seconds * 1000);
  }
  saveLocalState();
  broadcastState('TIME_UPDATE', {
    eventStartTime: GAME_STATE.eventStartTime,
    lastBlindChangeTime: GAME_STATE.lastBlindChangeTime
  });
  notifyStateChanged();
  tick();
  await syncTournamentToSupabase();
  const mins = Math.round(seconds / 60);
  showOpAlert("WAKTU BLIND DITAMBAHKAN", `Berhasil menambahkan +${mins} menit ke sisa waktu level blind saat ini!\nMonitor publik langsung tersinkronisasi.`, "green");
}

async function changeBlindLevel(delta) {
  const maxLevel = GAME_STATE.blindSchedule ? GAME_STATE.blindSchedule.length : 12;
  const newLevel = (GAME_STATE.blindLevel || 1) + delta;
  if (newLevel < 1 || newLevel > maxLevel) return;

  GAME_STATE.blindLevel = newLevel;
  GAME_STATE.lastBlindChangeTime = Date.now();
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
    if (btn) btn.textContent = '▶';
  } else {
    if (pauseTimestamp) {
      const pausedMs = Date.now() - pauseTimestamp;
      GAME_STATE.eventStartTime = (GAME_STATE.eventStartTime || Date.now()) + pausedMs;
      GAME_STATE.lastBlindChangeTime = (GAME_STATE.lastBlindChangeTime || Date.now()) + pausedMs;
      pauseTimestamp = null;
    }
    if (btn) btn.textContent = '⏸';
  }
  saveLocalState();
  notifyStateChanged();
  await syncTournamentToSupabase();
}

async function changePokerRound(roundName) {
  GAME_STATE.currentRound = roundName;
  saveLocalState();
  notifyStateChanged();
  await syncTournamentToSupabase();
}

async function clearAllPlayerActions() {
  showOpConfirm(
    "RESET ACTIONS",
    "Bersihkan semua label aksi pemain (Check, Call, Raise, Fold) kembali ke status standby?",
    async () => {
      GAME_STATE.players.forEach(p => {
        if (p.status !== 'eliminated') {
          p.currentAction = null;
        }
      });
      saveLocalState();
      notifyStateChanged();
      syncAllPlayersToSupabase().catch(console.error);
      showOpAlert("RESET BERHASIL", "Semua label aksi pemain telah dibersihkan!", "green");
    }
  );
}

// ── Timer tick ────────────────────────────────────────────
async function tick() {
  if (isPaused) return;

  if (checkAndAdvanceBlindLevel()) {
    saveLocalState();
    notifyStateChanged();
    await syncTournamentToSupabase();
    playBlindChime();
    const curBlind = getCurrentBlind();
    showOpAlert(
      "BLIND LEVEL NAIK! 🔔",
      `Waktu blind habis! Level otomatis naik ke Level ${GAME_STATE.blindLevel}\nSmall Blind: ${curBlind.sb} • Big Blind: ${curBlind.bb}`,
      "gold"
    );
  }

  const countdownSecs = getEventCountdownSecs();
  if ($opTimer) $opTimer.textContent = formatTime(countdownSecs);

  const blindSecs = getBlindCountdownSecs();
  if ($opBlindTimer) {
    $opBlindTimer.textContent = formatTime(blindSecs);
    if (blindSecs < 60) {
      $opBlindTimer.style.color = 'var(--red)';
      $opBlindTimer.style.fontWeight = 'bold';
    } else {
      $opBlindTimer.style.color = '';
      $opBlindTimer.style.fontWeight = 'normal';
    }
  }
}

// ── Log Renderer ──────────────────────────────────────────
function renderLog() {
  if (!$opLog) return;
  $opLog.innerHTML = '';

  const hands = GAME_STATE.recentHands || [];
  if (hands.length === 0) {
    $opLog.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:14px;font-size:11px;">Belum ada hand tercatat</div>`;
    return;
  }

  hands.slice(0, 6).forEach(h => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const medalsGained = h.winnerMedalsGained || 0;
    const medalText = medalsGained > 0 ? `• +${medalsGained} 🏅` : '';

    item.innerHTML = `
      <div class="history-header">
        <span>HAND #${h.hand}</span>
        <span>COMPLETE</span>
      </div>
      <div class="history-winner">🏆 ${h.winner}</div>
      <div class="history-sub">POT: ${(h.totalPot || 0).toLocaleString()} ${medalText}</div>
    `;
    $opLog.appendChild(item);
  });
}

// ── Modal Utilities ────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// ── Raise Modal ────────────────────────────────────────────
function triggerRaiseModal(player) {
  const curPaid = (GAME_STATE.roundBets && GAME_STATE.roundBets[player.id]) || 0;
  const curBlind = getCurrentBlind() || { sb: 25, bb: 50 };
  const minBet = GAME_STATE.currentRound === 'PRE-FLOP' ? curBlind.bb : 0;
  const curBet = Math.max(GAME_STATE.currentBet || 0, minBet);
  const minRaise = curBet + (curBlind.bb || 50);

  const pIdInput = document.getElementById('raise-player-id');
  const pName = document.getElementById('raise-player-name');
  const pAmt = document.getElementById('raise-amount-input');
  const pInfo = document.getElementById('raise-player-info');
  const pPresets = document.getElementById('raise-quick-presets');

  if (pIdInput) pIdInput.value = player.id;
  if (pName) pName.textContent = player.name;
  if (pAmt) {
    pAmt.value = minRaise;
    pAmt.min = minRaise;
    pAmt.max = curPaid + (player.chips || 0);
  }
  if (pInfo) {
    pInfo.textContent = `Chips saat ini: ${(player.chips || 0).toLocaleString()} • Min Raise: ${minRaise}`;
  }

  // Generate Quick Presets
  if (pPresets) {
    pPresets.innerHTML = '';
    const presets = [
      { label: `Min (${minRaise})`, val: minRaise },
      { label: `2x BB (${curBlind.bb * 2})`, val: curBlind.bb * 2 },
      { label: `3x BB (${curBlind.bb * 3})`, val: curBlind.bb * 3 },
      { label: `Pot (${(GAME_STATE.pot || curBlind.bb)})`, val: Math.max(minRaise, (GAME_STATE.pot || curBlind.bb)) },
      { label: `All-In (${curPaid + (player.chips || 0)})`, val: curPaid + (player.chips || 0) }
    ];

    presets.forEach(pr => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'preset-pill';
      pill.textContent = pr.label;
      pill.onclick = () => {
        if (pAmt) pAmt.value = pr.val;
      };
      pPresets.appendChild(pill);
    });
  }

  openModal('modal-raise');
}

async function confirmRaiseAction() {
  const pIdInput = document.getElementById('raise-player-id');
  const pAmt = document.getElementById('raise-amount-input');
  if (!pIdInput || !pAmt) return;

  const playerId = parseInt(pIdInput.value);
  const amount = parseInt(pAmt.value) || 0;
  if (!playerId || amount <= 0) return;

  closeModal('modal-raise');

  const success = await processPlayerMove(playerId, 'RAISE', amount);
  if (success) {
    renderRemoteUI();
    tick();
  }
}

// ── Convert Medal Modal ────────────────────────────────────
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
  const afterChips = (player.chips || 0) + chipsGain;
  const afterMedals = (player.medals || 0) - convertAmount;

  const body = document.getElementById('convert-body');
  if (!body) return;

  body.innerHTML = `
    <div style="background:var(--bg-input);padding:10px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);margin-bottom:8px;">
      <div style="font-family:var(--font-display);font-size:18px;font-weight:800;color:#fff;">${player.name}</div>
      <div style="font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);">
        Chips: <strong>${(player.chips || 0).toLocaleString()}</strong> • Medals: <strong>${player.medals || 0} 🏅</strong>
      </div>
    </div>
    <div class="form-row">
      <label class="form-label">JUMLAH MEDAL UNTUK DIKONVERSI (1 MEDAL = 400 CHIPS)</label>
      <div style="display:flex;align-items:center;gap:8px;">
        <button type="button" class="step-btn" style="padding:6px 14px;font-size:14px;" onclick="adjustConvert(-1)">−</button>
        <div style="font-family:var(--font-mono);font-size:18px;font-weight:900;color:var(--gold-light);min-width:30px;text-align:center;">${convertAmount}</div>
        <button type="button" class="step-btn" style="padding:6px 14px;font-size:14px;" onclick="adjustConvert(+1)">+</button>
      </div>
    </div>
    <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);padding:8px 12px;border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:11px;">
      <div style="color:var(--emerald-light);font-weight:700;">+${chipsGain.toLocaleString()} Chips Baru</div>
      <div style="color:var(--text-secondary);margin-top:2px;">Chips akhir: ${afterChips.toLocaleString()} • Sisa medal: ${afterMedals} 🏅</div>
    </div>
  `;
}

function adjustConvert(delta) {
  const player = GAME_STATE.players.find(p => p.id === convertPlayerId);
  if (!player) return;
  convertAmount = Math.max(1, Math.min(player.medals || 1, convertAmount + delta));
  renderConvertModal();
}

async function confirmConvert() {
  const player = GAME_STATE.players.find(p => p.id === convertPlayerId);
  if (!player || (player.medals || 0) < convertAmount) return;

  player.chips = (player.chips || 0) + (convertAmount * MEDAL_VALUE);
  player.medals = Math.max(0, (player.medals || 0) - convertAmount);

  saveLocalState();
  notifyStateChanged();
  closeModal('modal-convert');
  renderRemoteUI();

  syncPlayerToSupabase(player).catch(console.error);
  showOpAlert(
    "KONVERSI BERHASIL",
    `${player.name} menukar ${convertAmount} medal dengan +${(convertAmount * MEDAL_VALUE).toLocaleString()} chips!`,
    "green"
  );
}

// ── Edit Player Modal ──────────────────────────────────────
function editPlayer(playerId) {
  const player = GAME_STATE.players.find(p => p.id === playerId);
  if (!player) return;

  const idInput = document.getElementById('edit-player-id');
  const titleName = document.getElementById('edit-player-title-name');
  const chipsInput = document.getElementById('edit-player-chips');
  const medalsInput = document.getElementById('edit-player-medals');
  const statusSelect = document.getElementById('edit-player-status');
  const actionSelect = document.getElementById('edit-player-action');

  if (idInput) idInput.value = player.id;
  if (titleName) titleName.textContent = player.name;
  if (chipsInput) chipsInput.value = player.chips || 0;
  if (medalsInput) medalsInput.value = player.medals || 0;
  if (statusSelect) statusSelect.value = player.status || 'active';
  if (actionSelect) actionSelect.value = player.currentAction || '';

  openModal('modal-edit-player');
}

async function savePlayerEdit() {
  const idInput = document.getElementById('edit-player-id');
  if (!idInput) return;
  const playerId = parseInt(idInput.value);
  const player = GAME_STATE.players.find(p => p.id === playerId);
  if (!player) return;

  const chipsInput = document.getElementById('edit-player-chips');
  const medalsInput = document.getElementById('edit-player-medals');
  const statusSelect = document.getElementById('edit-player-status');
  const actionSelect = document.getElementById('edit-player-action');

  if (chipsInput) player.chips = parseInt(chipsInput.value) || 0;
  if (medalsInput) player.medals = parseInt(medalsInput.value) || 0;
  if (statusSelect) player.status = statusSelect.value;
  if (actionSelect) player.currentAction = actionSelect.value || null;

  saveLocalState();
  notifyStateChanged();
  closeModal('modal-edit-player');
  renderRemoteUI();

  syncPlayerToSupabase(player).catch(console.error);
  showOpAlert("DATA TERSIMPAN", `Data pemain ${player.name} berhasil diperbarui!`, "green");
}

// ── Timer Settings Modal ───────────────────────────────────
function openTimerSettings() {
  const blindSelect = document.getElementById('timer-blind-level');
  const durInput = document.getElementById('timer-duration-min');
  if (blindSelect) blindSelect.value = String(GAME_STATE.blindLevel || 1);
  if (durInput) durInput.value = Math.round((GAME_STATE.blindIntervalSecs || 900) / 60);

  const blindSecs = Math.round(getBlindCountdownSecs());
  const bMin = Math.floor(blindSecs / 60);
  const bSec = blindSecs % 60;
  const curMinInput = document.getElementById('timer-current-min');
  const curSecInput = document.getElementById('timer-current-sec');
  if (curMinInput) curMinInput.value = bMin;
  if (curSecInput) curSecInput.value = bSec;

  const ctdSecs = Math.round(getEventCountdownSecs());
  const ctdH = Math.floor(ctdSecs / 3600);
  const ctdM = Math.floor((ctdSecs % 3600) / 60);
  const ctdS = ctdSecs % 60;
  const ctdHInput = document.getElementById('timer-countdown-hour');
  const ctdMInput = document.getElementById('timer-countdown-min');
  const ctdSInput = document.getElementById('timer-countdown-sec');
  if (ctdHInput) ctdHInput.value = ctdH;
  if (ctdMInput) ctdMInput.value = ctdM;
  if (ctdSInput) ctdSInput.value = ctdS;

  openModal('modal-timer');
}

async function saveTimerSettings() {
  const blindSelect = document.getElementById('timer-blind-level');
  const durInput = document.getElementById('timer-duration-min');
  const curMinInput = document.getElementById('timer-current-min');
  const curSecInput = document.getElementById('timer-current-sec');
  const ctdHInput = document.getElementById('timer-countdown-hour');
  const ctdMInput = document.getElementById('timer-countdown-min');
  const ctdSInput = document.getElementById('timer-countdown-sec');

  if (blindSelect) GAME_STATE.blindLevel = parseInt(blindSelect.value) || 1;
  if (durInput) {
    const dMin = parseInt(durInput.value) || 15;
    GAME_STATE.blindIntervalSecs = dMin * 60;
  }

  if (curMinInput && curSecInput) {
    const setRemainSecs = ((parseInt(curMinInput.value) || 0) * 60) + (parseInt(curSecInput.value) || 0);
    const interval = GAME_STATE.blindIntervalSecs || 900;
    const elapsed = Math.max(0, interval - setRemainSecs);
    GAME_STATE.lastBlindChangeTime = Date.now() - (elapsed * 1000);
  }

  if (ctdHInput && ctdMInput && ctdSInput) {
    const setMatchSecs = ((parseInt(ctdHInput.value) || 0) * 3600) + ((parseInt(ctdMInput.value) || 0) * 60) + (parseInt(ctdSInput.value) || 0);
    const baseline = 7200;
    const elapsed = Math.max(0, baseline - setMatchSecs);
    GAME_STATE.eventStartTime = Date.now() - (elapsed * 1000);
  }

  saveLocalState();
  notifyStateChanged();
  closeModal('modal-timer');
  renderRemoteUI();
  tick();

  await syncTournamentToSupabase();
  showOpAlert("TIMER TERSINKRONISASI", "Pengaturan waktu dan level blind berhasil disimpan dan disinkronkan ke monitor depan!", "green");
}

function modalAddBlindTime(sec) {
  const curMinInput = document.getElementById('timer-current-min');
  const curSecInput = document.getElementById('timer-current-sec');
  if (!curMinInput || !curSecInput) return;
  const currentTotal = ((parseInt(curMinInput.value) || 0) * 60) + (parseInt(curSecInput.value) || 0);
  const newTotal = currentTotal + sec;
  curMinInput.value = Math.floor(newTotal / 60);
  curSecInput.value = newTotal % 60;
}

function resetBlindTimeToFull() {
  const curMinInput = document.getElementById('timer-current-min');
  const curSecInput = document.getElementById('timer-current-sec');
  const durInput = document.getElementById('timer-duration-min');
  if (curMinInput && curSecInput && durInput) {
    curMinInput.value = parseInt(durInput.value) || 15;
    curSecInput.value = 0;
  }
}

function modalAddTournamentTime(sec) {
  const ctdHInput = document.getElementById('timer-countdown-hour');
  const ctdMInput = document.getElementById('timer-countdown-min');
  const ctdSInput = document.getElementById('timer-countdown-sec');
  if (!ctdHInput || !ctdMInput || !ctdSInput) return;
  const curTotal = ((parseInt(ctdHInput.value) || 0) * 3600) + ((parseInt(ctdMInput.value) || 0) * 60) + (parseInt(ctdSInput.value) || 0);
  const newTotal = curTotal + sec;
  ctdHInput.value = Math.floor(newTotal / 3600);
  ctdMInput.value = Math.floor((newTotal % 3600) / 60);
  ctdSInput.value = newTotal % 60;
}

function resetTimerToStart() {
  showOpConfirm(
    "RESET WAKTU TURNAMEN",
    "Apakah Anda yakin ingin mereset timer countdown pertandingan ke 2 jam penuh?",
    () => {
      const ctdHInput = document.getElementById('timer-countdown-hour');
      const ctdMInput = document.getElementById('timer-countdown-min');
      const ctdSInput = document.getElementById('timer-countdown-sec');
      if (ctdHInput) ctdHInput.value = 2;
      if (ctdMInput) ctdMInput.value = 0;
      if (ctdSInput) ctdSInput.value = 0;
    },
    'gold'
  );
}

// ── New Hand Modal ─────────────────────────────────────────
function openNewHand() {
  showOpConfirm(
    "MULAI HAND BARU",
    `Mulai Hand #${GAME_STATE.hand + 1}?\nDealer, SB, dan BB akan otomatis dirotasi ke pemain berikutnya, dan taruhan blind akan dipasang.`,
    async () => {
      await startNewHand(true);
      renderRemoteUI();
      tick();
      showOpAlert("HAND BARU DIMULAI", `Hand #${GAME_STATE.hand} telah aktif!\nDealer, SB, dan BB otomatis berputar.`, "green");
    },
    'gold'
  );
}

// ── Start ─────────────────────────────────────────────────
init();
