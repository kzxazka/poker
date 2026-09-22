/* ═══════════════════════════════════════════════════════════
   EVENT GOCAP — PUBLIC DISPLAY LOGIC
═══════════════════════════════════════════════════════════ */

loadState();

// ── DOM refs ──────────────────────────────────────────────
const $eventTimer    = document.getElementById('event-timer');
const $blindDisplay  = document.getElementById('blind-display');
const $blindCountdown= document.getElementById('blind-countdown');
const $centerMedals  = document.getElementById('center-medals');
const $centerValue   = document.getElementById('center-value');
const $totalPrize    = document.getElementById('total-prize');
const $handNum       = document.getElementById('hand-num');
const $playerList    = document.getElementById('player-list');
const $footerDate    = document.getElementById('footer-date');

// ── Init ──────────────────────────────────────────────────
function init() {
  renderPlayers();
  tick();
  setInterval(tick, 1000);
  setInterval(() => { loadState(); renderPlayers(); }, 3000);

  const now = new Date();
  $footerDate.textContent = now.toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' }).toUpperCase();
}

// ── Render players ────────────────────────────────────────
function renderPlayers() {
  const list = $playerList;
  const players = GAME_STATE.players;

  // Sort: active first (by chips desc), then lasttry, then eliminated
  const sorted = [...players].sort((a, b) => {
    const rank = { ready: 0, active: 1, lasttry: 2, eliminated: 3 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.chips - a.chips;
  });

  list.innerHTML = '';
  sorted.forEach((player, idx) => {
    list.appendChild(buildPlayerRow(player, idx + 1));
  });

  // Update medal bar
  $centerMedals.innerHTML = `<span class="medal-num">${GAME_STATE.centerMedals}</span> <span class="medal-denom">/ ${GAME_STATE.totalMedals}</span>`;
  $centerValue.textContent = formatRupiah(GAME_STATE.centerValue);
  $totalPrize.textContent  = formatRupiah(GAME_STATE.totalPrize);
  $handNum.textContent     = `#${GAME_STATE.hand}`;
}

function buildPlayerRow(player, rank) {
  const row = document.createElement('div');
  row.className = `player-row status-${player.status}`;
  row.dataset.id = player.id;

  const isElim = player.status === 'eliminated';
  const chipsDisplay = isElim ? 'ELIMINATED' : player.chips.toLocaleString();

  // Medal pips (max 10 shown as circles)
  const maxPips = 10;
  const pipCount = Math.min(player.medals, maxPips);
  let pips = '';
  for (let i = 0; i < maxPips; i++) {
    pips += `<div class="medal-pip ${i < pipCount ? '' : 'empty'}"></div>`;
  }

  let badgeClass = 'badge-active';
  let badgeText  = 'ACTIVE';
  if (player.status === 'ready')      { badgeClass = 'badge-ready';      badgeText = 'READY'; }
  if (player.status === 'lasttry')    { badgeClass = 'badge-lasttry';    badgeText = 'LAST TRY USED'; }
  if (player.status === 'eliminated') { badgeClass = 'badge-eliminated'; badgeText = 'ELIMINATED'; }

  row.innerHTML = `
    <div class="player-rank">${String(rank).padStart(2, '0')}</div>
    <div class="player-name-block">
      <div class="player-name">${player.name}</div>
    </div>
    <div class="player-chips-block">
      <div class="player-chips-label">${isElim ? '' : 'CHIPS'}</div>
      <div class="player-chips-value">${chipsDisplay}</div>
    </div>
    <div class="player-medals-block">
      <div>
        <div class="player-medals-label">MEDALS</div>
        <div class="player-medals-value">${isElim ? '0' : player.medals}</div>
      </div>
      <div class="medal-pips">${pips}</div>
    </div>
    <div class="player-status-block">
      <div class="status-badge ${badgeClass}">
        <span class="status-dot"></span>
        ${badgeText}
      </div>
    </div>
  `;

  return row;
}

// ── Timer tick ────────────────────────────────────────────
function tick() {
  // Event elapsed timer
  const elapsedSecs = Math.floor((Date.now() - GAME_STATE.eventStartTime) / 1000);
  $eventTimer.textContent = formatTime(elapsedSecs);

  // Blind countdown
  const blindSecs = getBlindCountdownSecs();
  $blindCountdown.textContent = formatTime(blindSecs);

  // Flash red when < 60s on blind countdown
  const countdownEl = $blindCountdown;
  if (blindSecs < 60) {
    countdownEl.style.color = 'var(--red)';
  } else {
    countdownEl.style.color = 'var(--amber)';
  }

  // Blind info
  const blind = getCurrentBlind();
  const next  = getNextBlind();
  if (blind) {
    $blindDisplay.textContent = `${blind.sb} / ${blind.bb}`;
  }
}

// ── Storage listener (cross-tab sync) ────────────────────
window.addEventListener('storage', (e) => {
  if (e.key === 'gocap_state') {
    loadState();
    renderPlayers();
  }
});

// ── Start ─────────────────────────────────────────────────
init();
