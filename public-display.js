/* ═══════════════════════════════════════════════════════════
   POKER MES — PUBLIC DISPLAY LOGIC (SUPABASE REALTIME)
═══════════════════════════════════════════════════════════ */

// ── DOM refs ──────────────────────────────────────────────
const $eventTimer     = document.getElementById('event-timer');
const $blindDisplay   = document.getElementById('blind-display');
const $blindLevelInfo = document.getElementById('blind-level-info');
const $blindCountdown = document.getElementById('blind-countdown');
const $centerMedals   = document.getElementById('center-medals');
const $centerValue    = document.getElementById('center-value');
const $totalPrize     = document.getElementById('total-prize');
const $handNum        = document.getElementById('hand-num');
const $roundIndicator = document.getElementById('round-indicator');
const $dealerIndicator= document.getElementById('dealer-indicator');
const $sideRoundStatus= document.getElementById('side-round-status');
const $playerList     = document.getElementById('player-list');
const $footerMeta     = document.getElementById('footer-meta');

// Table Positions
const $posDealer      = document.getElementById('pos-dealer');
const $posSb          = document.getElementById('pos-sb');
const $posBb          = document.getElementById('pos-bb');

// Last Hand & Events
const $lastHandTitle  = document.getElementById('last-hand-title');
const $lastHandWinner = document.getElementById('last-hand-winner');
const $lastHandDeltas = document.getElementById('last-hand-deltas');
const $recentEventsLog= document.getElementById('recent-events-log');
const $blindScheduleList = document.getElementById('blind-schedule-list');

// ── Init ──────────────────────────────────────────────────
async function init() {
  renderBlindSchedule();
  
  // Register state change listener
  onGameStateChange(() => {
    renderUI();
  });

  // 1. Initial fetch from Supabase
  await fetchSupabaseState();

  // 2. Subscribe to Supabase real-time
  subscribeToSupabase();

  // 3. Start ticker
  tick();
  setInterval(tick, 1000);

  // 4. Polling fallback every 5s just in case network reconnects
  setInterval(() => {
    fetchSupabaseState();
  }, 5000);

  const now = new Date();
  $footerMeta.textContent = `POKER MES · PRIVATE TOURNAMENT · ${now.toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' }).toUpperCase()}`;
}

// ── Render Full UI ────────────────────────────────────────
function renderUI() {
  renderHeaderMetrics();
  renderPlayers();
  renderPositions();
  renderLastHand();
  renderRecentEvents();
  renderBlindSchedule();
}

function renderHeaderMetrics() {
  $centerMedals.innerHTML = `<span class="text-brand-gold-bright">${GAME_STATE.centerMedals}</span> <span class="text-[#3c4b62] font-normal">/</span> ${GAME_STATE.totalMedals}`;
  $centerValue.textContent = formatRupiah(GAME_STATE.centerValue);
  $totalPrize.textContent  = formatRupiah(GAME_STATE.totalPrize);
  $handNum.textContent     = `#${GAME_STATE.hand}`;

  const currentBlind = getCurrentBlind();
  const nextBlind = getNextBlind();
  if (currentBlind) {
    $blindDisplay.innerHTML = `${currentBlind.sb} <span class="text-[#4e5d75] font-light">/</span> ${currentBlind.bb}`;
    $blindLevelInfo.innerHTML = `Level ${GAME_STATE.blindLevel} <span class="text-[#3f4f66]">•</span> Next: ${nextBlind ? `${nextBlind.sb} / ${nextBlind.bb}` : 'END'}`;
  }

  $roundIndicator.textContent = GAME_STATE.currentRound || 'PRE-FLOP';
  $sideRoundStatus.textContent = `ROUND: ${GAME_STATE.currentRound || 'PRE-FLOP'}`;
}

// ── Render Players Table (Stitch design fidelity) ─────────
function renderPlayers() {
  const list = $playerList;
  const players = [...GAME_STATE.players];

  if (!players || players.length === 0) {
    list.innerHTML = `<div class="p-8 text-center text-slate-500 font-mono">Loading players from Supabase...</div>`;
    return;
  }

  // Sort order: by rank/order specified or chips
  const sorted = players.sort((a, b) => {
    const statusWeight = { ready: 0, active: 1, lasttry: 2, eliminated: 3 };
    if (statusWeight[a.status] !== statusWeight[b.status]) {
      return statusWeight[a.status] - statusWeight[b.status];
    }
    return (a.sortOrder || 0) - (b.sortOrder || 0) || (b.chips - a.chips);
  });

  list.innerHTML = '';
  sorted.forEach((player, idx) => {
    list.appendChild(buildPlayerCard(player, idx + 1));
  });
}

function buildPlayerCard(player, rankNum) {
  const article = document.createElement('article');
  
  const isElim = player.status === 'eliminated';
  const isLastTry = player.status === 'lasttry';
  const isReady = player.status === 'ready';

  // Indicator classes
  let indicatorClass = 'active-row-indicator';
  let bgClass = 'bg-[#0b1019] hover:bg-[#0d1421] border-[#141f30]';
  
  if (isLastTry) {
    indicatorClass = 'warning-row-indicator';
    bgClass = 'bg-[#0c1017] hover:bg-[#0f1420] border-[#1e261a]';
  } else if (isElim) {
    indicatorClass = 'eliminated-row-indicator opacity-50';
    bgClass = 'bg-[#090b10] border-[#141720]';
  }

  article.className = `${bgClass} transition-colors border rounded-sm px-4 md:px-5 py-3 flex flex-wrap md:flex-nowrap items-center justify-between gap-3 ${indicatorClass}`;
  article.setAttribute('data-purpose', 'player-row');

  // Role Badge (D / SB / BB)
  let roleBadge = '<span class="w-7"></span>';
  if (player.positionRole === 'D') {
    roleBadge = `<span class="px-2 py-0.5 rounded text-xs font-mono font-extrabold bg-[#eab308] text-black shadow-[0_0_8px_rgba(251,191,36,0.5)] tracking-wider" title="Dealer Button">D</span>`;
  } else if (player.positionRole === 'SB') {
    roleBadge = `<span class="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-[#0e2a47] border border-[#1e4976] text-[#38bdf8] tracking-wider" title="Small Blind">SB</span>`;
  } else if (player.positionRole === 'BB') {
    roleBadge = `<span class="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-[#291b4d] border border-[#4c2889] text-[#c084fc] tracking-wider" title="Big Blind">BB</span>`;
  }

  // Medals Dots
  const maxDots = 10;
  const count = Math.min(player.medals || 0, maxDots);
  let dotsHtml = '';
  for (let i = 0; i < count; i++) {
    dotsHtml += `<span class="w-3 h-3 rounded-full bg-brand-gold-bright shadow-[0_0_8px_rgba(251,191,36,0.6)]"></span>`;
  }

  // Action badge / Status pill
  let actionHtml = '';
  if (isElim) {
    actionHtml = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[#451a1a] bg-[#1a0a0a] text-[#ef4444] text-xs font-mono font-bold tracking-widest"><span class="w-1.5 h-1.5 rounded-full bg-[#ef4444]"></span> ELIMINATED</span>`;
  } else if (isLastTry) {
    actionHtml = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[#854d0e] bg-[#221706] text-[#eab308] text-xs font-mono font-bold tracking-widest"><span class="w-1.5 h-1.5 rounded-full bg-[#eab308]"></span> LAST TRY USED</span>`;
  } else if (player.currentAction) {
    const act = player.currentAction.toUpperCase();
    if (act.includes('RAISE')) {
      actionHtml = `<span class="inline-flex items-center px-2.5 py-1 rounded border border-[#854d0e] bg-[#221706] text-[#fbbf24] text-xs font-mono font-bold tracking-wider">${player.currentAction}</span>`;
    } else if (act.includes('CALL')) {
      actionHtml = `<span class="inline-flex items-center px-2.5 py-1 rounded border border-[#166534] bg-[#052014] text-[#22c55e] text-xs font-mono font-bold tracking-wider">${player.currentAction}</span>`;
    } else if (act.includes('CHECK')) {
      actionHtml = `<span class="inline-flex items-center px-2.5 py-1 rounded border border-[#1d2a40] bg-[#0c121d] text-[#8ed5ff] text-xs font-mono font-bold tracking-wider">${player.currentAction}</span>`;
    } else if (act.includes('FOLD')) {
      actionHtml = `<span class="inline-flex items-center px-2.5 py-1 rounded border border-[#172233] bg-[#0c1017] text-[#5e708a] text-xs font-mono font-bold tracking-wider">FOLD</span>`;
    } else {
      actionHtml = `<span class="inline-flex items-center px-2.5 py-1 rounded border border-[#1d2a40] bg-[#0c121d] text-slate-300 text-xs font-mono font-bold tracking-wider">${player.currentAction}</span>`;
    }
  } else {
    actionHtml = `<span class="inline-flex items-center px-2.5 py-1 rounded border border-[#12593b] bg-[#092218] text-[#10b981] text-xs font-mono font-bold tracking-wider">ACTIVE</span>`;
  }

  // Action badge next to name
  let nameActionBadge = '';
  if (!isElim && player.currentAction) {
    const act = player.currentAction.toUpperCase();
    if (act.includes('RAISE')) {
      nameActionBadge = `<span class="ml-2 px-2.5 py-0.5 rounded text-xs font-mono font-extrabold bg-[#451a03] border border-[#d97706] text-[#fbbf24] shadow-[0_0_10px_rgba(245,158,11,0.3)] animate-pulse tracking-wide">${player.currentAction}</span>`;
    } else if (act.includes('CALL')) {
      nameActionBadge = `<span class="ml-2 px-2.5 py-0.5 rounded text-xs font-mono font-extrabold bg-[#064e3b] border border-[#059669] text-[#34d399] shadow-[0_0_10px_rgba(16,185,129,0.3)] tracking-wide">${player.currentAction}</span>`;
    } else if (act.includes('CHECK')) {
      nameActionBadge = `<span class="ml-2 px-2.5 py-0.5 rounded text-xs font-mono font-extrabold bg-[#082f49] border border-[#0284c7] text-[#38bdf8] tracking-wide">${player.currentAction}</span>`;
    } else if (act.includes('FOLD')) {
      nameActionBadge = `<span class="ml-2 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-[#1e293b] border border-[#64748b] text-[#94a3b8] tracking-wide">FOLD</span>`;
    } else if (act.includes('ALL-IN') || act.includes('ALLIN')) {
      nameActionBadge = `<span class="ml-2 px-2.5 py-0.5 rounded text-xs font-mono font-extrabold bg-[#3b0764] border border-[#9333ea] text-[#c084fc] shadow-[0_0_12px_rgba(192,132,252,0.4)] animate-bounce tracking-wide">${player.currentAction}</span>`;
    } else if (!act.includes('DEALER') && !act.includes('BLIND')) {
      nameActionBadge = `<span class="ml-2 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-[#141e2e] border border-[#23354e] text-slate-300 tracking-wide">${player.currentAction}</span>`;
    }
  }

  const nameClass = isElim ? 'text-[#475569] line-through' : (player.currentAction === 'FOLD' ? 'text-slate-400' : 'text-white');

  article.innerHTML = `
    <!-- Left: Rank, Role, Name, Action Badge -->
    <div class="flex items-center gap-3 md:gap-4 min-w-[200px] md:min-w-[260px] flex-wrap">
      <span class="text-sm font-mono font-bold text-[#44546d] w-6">${String(rankNum).padStart(2, '0')}</span>
      ${roleBadge}
      <span class="text-2xl md:text-3xl font-display font-bold tracking-wider ${nameClass}">${player.name}</span>
      ${nameActionBadge}
    </div>

    <!-- Center: Chips & Medals -->
    <div class="flex items-center gap-6 md:gap-10 flex-1 justify-end md:mr-6">
      <div class="text-right min-w-[100px]">
        <div class="text-[10px] font-mono uppercase tracking-widest text-[#51637c] font-semibold">Chips</div>
        <div class="text-xl md:text-2xl font-bold font-mono text-white tabular-numbers">
          ${isElim ? '<span class="text-xs font-mono font-bold text-[#ef4444] uppercase tracking-widest">ELIMINATED</span>' : (player.chips || 0).toLocaleString()}
        </div>
      </div>

      <div class="min-w-[150px] md:min-w-[180px] flex items-center gap-3">
        <div>
          <div class="text-[10px] font-mono uppercase tracking-widest text-[#51637c] font-semibold">Medals</div>
          <div class="text-xl md:text-2xl font-bold font-mono text-brand-gold-bright tabular-numbers">${player.medals || 0}</div>
        </div>
        <div class="flex items-center gap-1.5 pt-3">
          ${dotsHtml}
        </div>
      </div>
    </div>

    <!-- Right: Action / Status Badge -->
    <div class="min-w-[120px] flex items-center justify-end gap-2 text-right">
      ${actionHtml}
    </div>
  `;

  return article;
}

// ── Render Positions Widget ───────────────────────────────
function renderPositions() {
  const dealer = GAME_STATE.players.find(p => p.positionRole === 'D');
  const sb = GAME_STATE.players.find(p => p.positionRole === 'SB');
  const bb = GAME_STATE.players.find(p => p.positionRole === 'BB');

  $posDealer.textContent = dealer ? dealer.name : '—';
  $posSb.textContent     = sb ? sb.name : '—';
  $posBb.textContent     = bb ? bb.name : '—';
  $dealerIndicator.textContent = dealer ? `D: ${dealer.name}` : '';
}

// ── Render Last Hand Widget ───────────────────────────────
function renderLastHand() {
  const last = GAME_STATE.recentHands[0];
  if (!last) {
    $lastHandTitle.textContent = 'Last Hand';
    $lastHandWinner.textContent = '—';
    $lastHandDeltas.innerHTML = `<div class="text-slate-500 py-1">No hands recorded yet</div>`;
    return;
  }

  $lastHandTitle.textContent = `Last Hand · #${last.hand}`;
  $lastHandWinner.textContent = last.winner;

  let html = '';
  (last.deltas || []).forEach(d => {
    const isPos = d.medals > 0;
    const isNeg = d.medals < 0;
    const colorClass = isPos ? 'text-brand-gold-bright' : (isNeg ? 'text-[#ef4444]' : 'text-slate-400');
    const sign = isPos ? '+' : '';
    html += `
      <div class="flex justify-between items-center py-0.5 border-b border-[#121b2a]">
        <span class="text-[#8ba2be]">${d.name}</span>
        <span class="${colorClass} font-bold flex items-center gap-1">${sign}${d.medals} <span class="text-sm">🏅</span></span>
      </div>
    `;
  });
  $lastHandDeltas.innerHTML = html;
}

// ── Recent Events Collapsible & Dropdown State ────────────
let isRecentEventsOpen = true;
let selectedHandFilter = 'all';

function toggleRecentEvents(forceState = null) {
  if (forceState !== null) {
    isRecentEventsOpen = forceState;
  } else {
    isRecentEventsOpen = !isRecentEventsOpen;
  }
  const body = document.getElementById('recent-events-collapsible');
  const chevron = document.getElementById('recent-events-chevron');
  const filterSelect = document.getElementById('recent-events-filter');

  if (body) {
    if (isRecentEventsOpen) {
      body.classList.remove('hidden');
      if (chevron) chevron.classList.remove('-rotate-90');
      if (filterSelect && filterSelect.value === 'hide') {
        filterSelect.value = 'all';
        selectedHandFilter = 'all';
      }
    } else {
      body.classList.add('hidden');
      if (chevron) chevron.classList.add('-rotate-90');
      if (filterSelect) filterSelect.value = 'hide';
    }
  }
}

function onSelectEventHand(val) {
  if (val === 'hide') {
    toggleRecentEvents(false);
    return;
  }
  // If previously hidden, re-open
  if (!isRecentEventsOpen) {
    toggleRecentEvents(true);
  }
  selectedHandFilter = val;
  renderRecentEvents();
}

// ── Render Recent Events Widget ───────────────────────────
function renderRecentEvents() {
  const container = $recentEventsLog;
  const countEl = document.getElementById('recent-events-count');
  const filterSelect = document.getElementById('recent-events-filter');

  const allHands = GAME_STATE.recentHands || [];
  if (countEl) countEl.textContent = allHands.length;

  // Populate dropdown options if changed
  if (filterSelect) {
    const currentVal = filterSelect.value || 'all';
    let optionsHtml = `<option value="all">Semua Hand (${Math.min(allHands.length, 5)})</option>`;
    allHands.forEach(h => {
      optionsHtml += `<option value="${h.hand}">Hand #${h.hand} (${h.winner})</option>`;
    });
    optionsHtml += `<option value="hide">✕ Sembunyikan (Hide Events)</option>`;
    filterSelect.innerHTML = optionsHtml;
    
    // Restore selection if still present
    if (currentVal === 'hide') {
      filterSelect.value = 'hide';
    } else if (allHands.some(h => String(h.hand) === String(currentVal))) {
      filterSelect.value = currentVal;
    } else {
      filterSelect.value = selectedHandFilter;
    }
  }

  if (allHands.length === 0) {
    container.innerHTML = `<div class="text-slate-500 py-2 text-center text-xs">Belum ada hand tercatat</div>`;
    return;
  }

  let handsToDisplay = allHands;
  if (selectedHandFilter !== 'all') {
    handsToDisplay = allHands.filter(h => String(h.hand) === String(selectedHandFilter));
  } else {
    handsToDisplay = allHands.slice(0, 5);
  }

  let html = '';
  handsToDisplay.forEach(h => {
    let lines = '';
    lines += `<div class="text-slate-200 font-bold flex items-center gap-1.5"><span class="text-brand-gold">🏆</span> ${h.winner} WON POT</div>`;
    (h.deltas || []).forEach(d => {
      if (d.name !== h.winner) {
        if (d.note) {
          lines += `<div class="text-[#ef4444] font-bold text-[10px] pl-5 flex items-center gap-1"><span>❌</span> ${d.name} ${d.note}</div>`;
        } else if (d.medals !== 0) {
          lines += `<div class="text-[#f59e0b] text-[10px] pl-5 flex items-center gap-1"><span>🏅</span> ${d.name} ${d.medals} MEDAL${Math.abs(d.medals) > 1 ? 'S' : ''}</div>`;
        }
      }
    });

    html += `
      <div class="border-l-2 border-[#22354f] hover:border-brand-gold pl-2.5 py-1 bg-[#0b121e]/50 rounded-r transition">
        <div class="text-[10px] text-[#556d8f] uppercase font-bold flex items-center justify-between">
          <span>HAND #${h.hand}</span>
          <span class="text-[9px] text-slate-500 font-mono">COMPLETE</span>
        </div>
        ${lines}
      </div>
    `;
  });

  container.innerHTML = html;
}

// ── Render Blind Schedule ─────────────────────────────────
function renderBlindSchedule() {
  const container = $blindScheduleList;
  container.innerHTML = '';

  GAME_STATE.blindSchedule.forEach(b => {
    const isCurrent = b.level === GAME_STATE.blindLevel;
    const isPast = b.level < GAME_STATE.blindLevel;

    const row = document.createElement('div');
    if (isCurrent) {
      row.className = 'flex items-center justify-between bg-[#1f1a09] border border-[#854d0e] text-brand-gold-bright font-bold px-2 py-1 rounded shadow-sm';
      row.innerHTML = `
        <span><span class="text-brand-gold-light">L${b.level}</span> ${b.sb} / ${b.bb}</span>
        <span class="bg-[#10b981] text-black text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider">NOW</span>
      `;
    } else {
      row.className = `flex items-center justify-between ${isPast ? 'text-[#364459]' : 'text-[#50637f]'} px-2 py-0.5`;
      row.innerHTML = `<span><span class="${isPast ? 'text-[#2a3648]' : 'text-[#364459]'}">L${b.level}</span> ${b.sb} / ${b.bb}</span>`;
    }
    container.appendChild(row);
  });
}

// ── Timer tick ────────────────────────────────────────────
function tick() {
  if (GAME_STATE.isPaused) return;

  const countdownSecs = getEventCountdownSecs();
  $eventTimer.textContent = formatTime(countdownSecs);

  if (countdownSecs < 300) {
    $eventTimer.classList.add('text-amber-400');
  } else {
    $eventTimer.classList.remove('text-amber-400');
  }

  const blindSecs = getBlindCountdownSecs();
  $blindCountdown.textContent = formatTime(blindSecs);

  if (blindSecs < 60) {
    $blindCountdown.classList.add('text-[#ef4444]', 'animate-pulse');
  } else {
    $blindCountdown.classList.remove('text-[#ef4444]', 'animate-pulse');
  }
}

// ── Start ─────────────────────────────────────────────────
init();
