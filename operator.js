/* ═══════════════════════════════════════════════════════════
   EVENT GOCAP — OPERATOR LOGIC
   Full hand resolution, medal conversion, bust handling
═══════════════════════════════════════════════════════════ */

loadState();

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

// ── Init ──────────────────────────────────────────────────
async function init() {
  onGameStateChange(() => {
    renderPlayerCards();
    renderLog();
  });

  await fetchSupabaseState();
  subscribeToSupabase();

  renderPlayerCards();
  renderLog();
  tick();
  setInterval(tick, 1000);
}

function tick() {
  if (isPaused) return;
  const elapsed = Math.floor((Date.now() - GAME_STATE.eventStartTime) / 1000);
  $opTimer.textContent = formatTime(elapsed);
  const blind = getCurrentBlind();
  if (blind) $opBlind.textContent = `${blind.sb} / ${blind.bb}`;
  $opHand.textContent = `#${GAME_STATE.hand}`;
  $opCenter.textContent = `${GAME_STATE.centerMedals} 🏅`;
}

async function togglePause() {
  isPaused = !isPaused;
  GAME_STATE.isPaused = isPaused;
  const btn = document.getElementById('btn-pause');
  btn.textContent = isPaused ? '▶ RESUME' : '⏸ PAUSE';
  btn.style.color = isPaused ? 'var(--amber)' : '';
  await syncTournamentToSupabase();
}

// ══════════════════════════════════════════════════════════
// PLAYER CARDS
// ══════════════════════════════════════════════════════════
function renderPlayerCards() {
  $playerGrid.innerHTML = '';
  GAME_STATE.players.forEach(p => {
    $playerGrid.appendChild(buildPlayerCard(p));
  });
}

function buildPlayerCard(player) {
  const div = document.createElement('div');
  div.className = `op-player-card status-${player.status}`;
  div.dataset.id = player.id;

  let badgeClass = 'badge-active';
  let badgeText = 'ACTIVE';
  if (player.status === 'ready') { badgeClass = 'badge-ready'; badgeText = 'READY'; }
  if (player.status === 'lasttry') { badgeClass = 'badge-lasttry'; badgeText = 'LAST TRY USED'; }
  if (player.status === 'eliminated') { badgeClass = 'badge-eliminated'; badgeText = 'ELIMINATED'; }

  const isElim = player.status === 'eliminated';
  const chipsStr = isElim ? '—' : player.chips.toLocaleString();
  const medalsStr = String(player.medals);

  let actionsHtml = '';
  if (!isElim) {
    actionsHtml = `
      <div class="op-card-actions">
        <button class="op-btn op-btn-secondary op-btn-sm" onclick="openConvert(${player.id})">
          🔄 Convert
        </button>
        <button class="op-btn op-btn-secondary op-btn-sm" onclick="editPlayer(${player.id})">
          ✏ Edit
        </button>
      </div>
    `;
  }

  div.innerHTML = `
    <div class="op-card-top">
      <div class="op-card-name">${player.name}</div>
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
    alert('Please select a winner.');
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

  saveState();
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

  saveState();
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

  saveState();
  renderPlayerCards();
  closeModal('modal-convert');

  // Supabase sync
  syncPlayerToSupabase(player);
}

// ══════════════════════════════════════════════════════════
// EDIT PLAYER (inline chips/medals adjustment)
// ══════════════════════════════════════════════════════════
function editPlayer(playerId) {
  const player = GAME_STATE.players.find(p => p.id === playerId);
  if (!player) return;

  const newChips = prompt(`Edit chips for ${player.name} (current: ${player.chips}):`, player.chips);
  if (newChips === null) return;
  const chips = parseInt(newChips);
  if (!isNaN(chips) && chips >= 0) player.chips = chips;

  const newMedals = prompt(`Edit medals for ${player.name} (current: ${player.medals}):`, player.medals);
  if (newMedals !== null) {
    const medals = parseInt(newMedals);
    if (!isNaN(medals) && medals >= 0) player.medals = medals;
  }

  saveState();
  renderPlayerCards();

  // Supabase sync
  syncPlayerToSupabase(player);
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

// ── Start ─────────────────────────────────────────────────
init();
