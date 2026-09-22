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
    tick();
  });

  // 1. Initial fetch from Supabase
  await fetchSupabaseState();

  // 2. Always render after initial fetch (even if fetch returned early due to timestamp guards)
  renderUI();

  // 3. Subscribe to Supabase real-time
  subscribeToSupabase();

  // 4. Start ticker
  tick();
  setInterval(tick, 1000);

  // 5. Fallback polling every 20s (quiet heartbeat in case WebSocket temporarily sleeps)
  setInterval(() => {
    fetchSupabaseState(false);
  }, 20000);

  const now = new Date();
  $footerMeta.textContent = `POKER MES · PRIVATE TOURNAMENT · ${now.toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' }).toUpperCase()}`;
}

// ── Render Full UI ────────────────────────────────────────
let lastRenderedBlindLevel = null;
let blindsToastTimer = null;

function showBlindsUpToast(level) {
  const banner = document.getElementById('blinds-up-banner');
  const text = document.getElementById('blinds-up-text');
  if (!banner || !text) return;

  const curBlind = getCurrentBlind();
  text.textContent = `LEVEL ${level} — ${curBlind ? `${curBlind.sb} / ${curBlind.bb}` : ''}`;

  banner.classList.remove('-translate-y-32', 'opacity-0', 'pointer-events-none');
  banner.classList.add('translate-y-0', 'opacity-100');

  if (blindsToastTimer) clearTimeout(blindsToastTimer);
  blindsToastTimer = setTimeout(() => {
    banner.classList.remove('translate-y-0', 'opacity-100');
    banner.classList.add('-translate-y-32', 'opacity-0', 'pointer-events-none');
  }, 6000);
}

function renderUI() {
  // Check if blind level increased
  if (lastRenderedBlindLevel !== null && GAME_STATE.blindLevel > lastRenderedBlindLevel) {
    showBlindsUpToast(GAME_STATE.blindLevel);
    playBlindChime();
  }
  lastRenderedBlindLevel = GAME_STATE.blindLevel;

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
  if ($totalPrize) $totalPrize.textContent = formatRupiah(GAME_STATE.totalPrize);
  $handNum.textContent     = `#${GAME_STATE.hand}`;

  const currentBlind = getCurrentBlind();
  const nextBlind = getNextBlind();
  if (currentBlind) {
    $blindDisplay.innerHTML = `${currentBlind.sb} <span class="text-[#4e5d75] font-light">/</span> ${currentBlind.bb}`;
    $blindLevelInfo.textContent = `Level ${GAME_STATE.blindLevel}`;
  }

  const $nextBlindDisplay = document.getElementById('next-blind-display');
  if ($nextBlindDisplay) {
    $nextBlindDisplay.textContent = nextBlind ? `${nextBlind.sb} / ${nextBlind.bb}` : 'MAX LEVEL';
  }

  $roundIndicator.textContent = GAME_STATE.currentRound || 'PRE-FLOP';
  $sideRoundStatus.textContent = `ROUND: ${GAME_STATE.currentRound || 'PRE-FLOP'}`;

  const potEl = document.getElementById('main-pot');
  const betEl = document.getElementById('main-bet');
  if (potEl) potEl.textContent = (GAME_STATE.pot || 0).toLocaleString();
  if (betEl) betEl.textContent = (GAME_STATE.currentBet || 0).toLocaleString();
}

// ── Render Players Table (STRICT SEATING ORDER - NO REORDERING) ─────────
function renderPlayers() {
  const list = $playerList;
  const players = [...GAME_STATE.players];

  if (!players || players.length === 0) {
    list.innerHTML = `<div class="p-8 text-center text-slate-500 font-mono">Loading players from Supabase...</div>`;
    return;
  }

  // CRITICAL: NEVER REORDER PLAYERS! Maintain original table seat order:
  const sorted = players.sort((a, b) => (a.sortOrder || a.id) - (b.sortOrder || b.id));

  list.innerHTML = '';
  sorted.forEach((player, idx) => {
    list.appendChild(buildPlayerCard(player, idx + 1));
  });
}

function buildPlayerCard(player, rankNum) {
  const article = document.createElement('article');
  
  const isElim = player.status === 'eliminated';
  const isFolded = (GAME_STATE.foldedPlayerIds || []).includes(player.id) || (player.currentAction === 'FOLD');
  const isTurn = GAME_STATE.activeTurnPlayerId === player.id && GAME_STATE.currentRound !== 'SHOWDOWN' && !isElim;
  const hasActed = (GAME_STATE.actedInRound || []).includes(player.id);

  const curBlind = getCurrentBlind() || { sb: 25, bb: 50 };
  const curPaid = (GAME_STATE.roundBets && GAME_STATE.roundBets[player.id]) || 0;
  const curBet = Math.max(GAME_STATE.currentBet || 0, (GAME_STATE.currentRound === 'PRE-FLOP' ? curBlind.bb : 0));
  const toCall = Math.max(0, curBet - curPaid);

  // ════════ EXACT TURN BORDER SPECIFICATION (GOLD STATIC GLOW) ════════
  let borderClass = 'turn-waiting-blue';
  if (isElim) {
    borderClass = 'turn-folded-grey opacity-30';
  } else if (isFolded) {
    borderClass = 'turn-folded-grey';
  } else if (isTurn) {
    borderClass = 'turn-active-static';
  } else if (hasActed) {
    borderClass = 'turn-acted-green';
  } else {
    borderClass = 'turn-waiting-blue';
  }

  article.className = `${borderClass} transition-all rounded-lg px-4 md:px-5 py-3 flex flex-wrap md:flex-nowrap items-center justify-between gap-3 shadow-md`;
  article.setAttribute('data-purpose', 'player-row');

  // Role Badge (D / SB (amount) / BB (amount))
  let roleBadge = '<span class="w-6"></span>';
  if (player.positionRole === 'D') {
    roleBadge = `<span class="px-2 py-0.5 rounded text-xs font-mono font-extrabold bg-[#eab308] text-black shadow-[0_0_8px_rgba(251,191,36,0.5)] tracking-wider" title="Dealer Button">D</span>`;
  } else if (player.positionRole === 'SB') {
    roleBadge = `<span class="px-2 py-0.5 rounded text-xs font-mono font-extrabold bg-[#0e2a47] border border-[#1e4976] text-[#38bdf8] tracking-wider" title="Small Blind">SB (${curBlind.sb})</span>`;
  } else if (player.positionRole === 'BB') {
    roleBadge = `<span class="px-2 py-0.5 rounded text-xs font-mono font-extrabold bg-[#291b4d] border border-[#4c2889] text-[#c084fc] tracking-wider" title="Big Blind">BB (${curBlind.bb})</span>`;
  }

  // ════════ MEDAL CIRCLES (SCOREBOARD CENTER ATAS-BAWAH FOR <= 10 & BALANCED FOR > 10) ════════
  const medalsCount = player.medals || 0;
  let medalsDisplayHtml = '';
  if (medalsCount <= 10) {
    let dotsHtml = '';
    for (let i = 0; i < medalsCount; i++) {
      dotsHtml += `<span class="w-3.5 h-3.5 rounded-full bg-brand-gold-bright shadow-[0_0_8px_rgba(251,191,36,0.7)] shrink-0"></span>`;
    }
    medalsDisplayHtml = `
      <div class="flex items-center self-center gap-1.5 min-h-[32px]">
        ${dotsHtml}
      </div>
    `;
  } else {
    // When medals > 10: Balanced 2-row layout with compact dots so chips column is never squeezed
    const maxVisualDots = 10;
    let row1Dots = '';
    let row2Dots = '';
    const dotsToShow = Math.min(medalsCount, maxVisualDots);
    const row1Count = Math.ceil(dotsToShow / 2);
    const row2Count = Math.floor(dotsToShow / 2);

    for (let i = 0; i < row1Count; i++) {
      row1Dots += `<span class="w-2.5 h-2.5 rounded-full bg-brand-gold-bright shadow-[0_0_6px_rgba(251,191,36,0.6)] shrink-0"></span>`;
    }
    for (let i = 0; i < row2Count; i++) {
      row2Dots += `<span class="w-2.5 h-2.5 rounded-full bg-brand-gold-bright shadow-[0_0_6px_rgba(251,191,36,0.6)] shrink-0"></span>`;
    }

    const overflowBadge = medalsCount > maxVisualDots
      ? `<span class="text-[9px] font-mono font-black text-brand-gold-bright bg-amber-950/90 px-1 py-0.2 rounded border border-amber-800 shrink-0">+${medalsCount - maxVisualDots}</span>`
      : '';

    medalsDisplayHtml = `
      <div class="flex flex-col justify-center self-center gap-1 min-w-[90px] max-w-[130px]">
        <div class="flex items-center gap-1">${row1Dots} ${overflowBadge}</div>
        <div class="flex items-center gap-1">${row2Dots}</div>
      </div>
    `;
  }

  // ════════ LARGE STATUS MOVE BADGES FOR PUBLIC DISPLAY (RIGHT COLUMN) ════════
  let actionHtml = '';
  if (isElim) {
    actionHtml = `<span class="badge-move-lg bg-[#1a0a0a] border border-[#7f1d1d] text-[#ef4444]">ELIMINATED</span>`;
  } else if (player.currentAction) {
    const act = player.currentAction.toUpperCase();
    if (act.includes('RAISE')) {
      actionHtml = `<span class="badge-move-lg badge-move-raise">${player.currentAction}</span>`;
    } else if (act.includes('CALL')) {
      actionHtml = `<span class="badge-move-lg badge-move-call">${player.currentAction}</span>`;
    } else if (act.includes('CHECK')) {
      actionHtml = `<span class="badge-move-lg badge-move-check">CHECK</span>`;
    } else if (act.includes('FOLD')) {
      actionHtml = `<span class="badge-move-lg badge-move-fold">FOLD</span>`;
    } else if (act.includes('ALL-IN') || act.includes('ALLIN')) {
      actionHtml = `<span class="badge-move-lg badge-move-allin">${player.currentAction}</span>`;
    } else if (act.includes('DEALER') || act.startsWith('SB') || act.startsWith('BB')) {
      actionHtml = `<span class="badge-move-lg bg-[#0c121d] border border-[#22354f] text-slate-300">${player.currentAction}</span>`;
    } else {
      actionHtml = `<span class="badge-move-lg bg-[#0c121d] border border-[#22354f] text-slate-200">${player.currentAction}</span>`;
    }
  } else if (isTurn) {
    actionHtml = `<span class="badge-move-lg bg-[#78350f] border border-[#f59e0b] text-[#fde047] shadow-[0_0_15px_rgba(245,158,11,0.6)]">GILIRAN</span>`;
  } else if (hasActed) {
    actionHtml = `<span class="badge-move-lg bg-[#062419] border border-[#10b981] text-[#10b981]">SELESAI</span>`;
  } else {
    actionHtml = `<span class="badge-move-lg bg-[#081b2e] border border-[#0284c7] text-[#38bdf8]">MENUNGGU</span>`;
  }

  // ════════ NAME BADGES (TO CALL, RAISE NOMINAL, CALL, CHECK) BESIDE NAME ════════
  let nameActionBadge = '';
  if (!isElim) {
    if (isTurn) {
      if (toCall > 0) {
        nameActionBadge = `<span class="ml-2 px-3 py-1 rounded-full text-xs font-mono font-black bg-[#78350f] border border-[#f59e0b] text-[#fde047] shadow-[0_0_14px_rgba(245,158,11,0.6)] tracking-wide">TO CALL: ${toCall.toLocaleString()}</span>`;
      } else {
        nameActionBadge = `<span class="ml-2 px-3 py-1 rounded-full text-xs font-mono font-black bg-[#082f49] border border-[#0284c7] text-[#38bdf8] tracking-wide">CHECK / OPTION</span>`;
      }
    } else if (player.currentAction) {
      const act = player.currentAction.toUpperCase();
      if (act.includes('RAISE')) {
        nameActionBadge = `<span class="ml-2 px-3 py-1 rounded-full text-xs font-mono font-black bg-[#451a03] border border-[#d97706] text-[#fbbf24] shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse tracking-wide">${player.currentAction}</span>`;
      } else if (act.includes('CALL')) {
        nameActionBadge = `<span class="ml-2 px-3 py-1 rounded-full text-xs font-mono font-black bg-[#064e3b] border border-[#059669] text-[#34d399] shadow-[0_0_12px_rgba(16,185,129,0.4)] tracking-wide">${player.currentAction}</span>`;
      } else if (act.includes('CHECK')) {
        nameActionBadge = `<span class="ml-2 px-3 py-1 rounded-full text-xs font-mono font-black bg-[#082f49] border border-[#0284c7] text-[#38bdf8] tracking-wide">CHECK</span>`;
      } else if (act.includes('FOLD')) {
        nameActionBadge = `<span class="ml-2 px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#1e293b] border border-[#64748b] text-[#94a3b8] tracking-wide">FOLD</span>`;
      } else if (act.includes('ALL-IN') || act.includes('ALLIN')) {
        nameActionBadge = `<span class="ml-2 px-3 py-1 rounded-full text-xs font-mono font-black bg-[#3b0764] border border-[#9333ea] text-[#c084fc] shadow-[0_0_14px_rgba(192,132,252,0.5)] animate-bounce tracking-wide">${player.currentAction}</span>`;
      }
    }
  }

  const nameClass = isElim ? 'text-[#475569] line-through' : (isFolded ? 'text-slate-500' : 'text-white');

  article.innerHTML = `
    <!-- Left: Rank, Role, Name, Action Badge -->
    <div class="flex items-center gap-3 md:gap-4 min-w-[220px] md:min-w-[300px] flex-wrap">
      <span class="text-sm font-mono font-bold text-[#44546d] w-6">${String(rankNum).padStart(2, '0')}</span>
      ${roleBadge}
      <span class="text-2xl md:text-3xl font-display font-bold tracking-wider ${nameClass}">${player.name}</span>
      ${nameActionBadge}
    </div>

    <!-- Center: Chips & Medals (Vertically Centered Dots & Protected Chips Column) -->
    <div class="flex items-center gap-6 md:gap-8 flex-1 justify-end md:mr-6">
      <div class="text-right min-w-[110px]">
        <div class="text-[10px] font-mono uppercase tracking-widest text-[#51637c] font-semibold">Chips</div>
        <div class="text-xl md:text-2xl font-bold font-mono text-white tabular-numbers">
          ${isElim ? '<span class="text-xs font-mono font-bold text-[#ef4444] uppercase tracking-widest">ELIMINATED</span>' : (player.chips || 0).toLocaleString()}
        </div>
      </div>

      <div class="min-w-[140px] md:min-w-[170px] flex items-center gap-3 self-center">
        <div>
          <div class="text-[10px] font-mono uppercase tracking-widest text-[#51637c] font-semibold">Medals</div>
          <div class="text-xl md:text-2xl font-bold font-mono text-brand-gold-bright tabular-numbers">${medalsCount}</div>
        </div>
        ${medalsDisplayHtml}
      </div>
    </div>

    <!-- Right: Action / Status Badge (LARGER DISPLAY) -->
    <div class="min-w-[140px] flex items-center justify-end gap-2 text-right">
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

  if ($posDealer) $posDealer.textContent = dealer ? dealer.name : '—';
  if ($posSb) $posSb.textContent     = sb ? sb.name : '—';
  if ($posBb) $posBb.textContent     = bb ? bb.name : '—';
  if ($dealerIndicator) $dealerIndicator.textContent = dealer ? `D: ${dealer.name}` : '';
}

// ── Render Last Hand Widget (Deprecated/Removed) ───────────
function renderLastHand() {
  // Tab last hand is removed according to user requirements
}

// ── Recent Events Collapsible State ───────────────────────
let isRecentEventsOpen = true;

function toggleRecentEvents(forceState = null) {
  if (forceState !== null) {
    isRecentEventsOpen = forceState;
  } else {
    isRecentEventsOpen = !isRecentEventsOpen;
  }
  const body = document.getElementById('recent-events-collapsible');
  const chevron = document.getElementById('recent-events-chevron');

  if (body) {
    if (isRecentEventsOpen) {
      body.classList.remove('hidden');
      if (chevron) chevron.classList.remove('-rotate-90');
    } else {
      body.classList.add('hidden');
      if (chevron) chevron.classList.add('-rotate-90');
    }
  }
}

// ── Render Recent Events Widget (Most recent on top + 3 previous hands below = total 4) ──
function renderRecentEvents() {
  const container = $recentEventsLog;
  const countEl = document.getElementById('recent-events-count');

  const allHands = GAME_STATE.recentHands || [];
  if (countEl) countEl.textContent = `${Math.min(allHands.length, 4)} Hands`;

  if (!container) return;

  if (allHands.length === 0) {
    container.innerHTML = `<div class="text-slate-500 py-2 text-center text-xs">Belum ada hand tercatat</div>`;
    return;
  }

  // Top hand: Most recent hand, followed by 3 previous hands (total up to 4)
  const handsToDisplay = allHands.slice(0, 4);

  let html = '';
  handsToDisplay.forEach((h, idx) => {
    let lines = '';
    lines += `<div class="text-slate-100 font-bold flex items-center gap-1.5"><span class="text-brand-gold">🏆</span> ${h.winner} WON POT ${h.totalPot ? `(+${h.totalPot.toLocaleString()})` : ''}</div>`;
    
    const winDelta = (h.deltas || []).find(d => d.name === h.winner && d.medals > 0);
    const medalsGained = h.winnerMedalsGained || (winDelta ? winDelta.medals : 0);
    if (medalsGained > 0) {
      lines += `<div class="text-[#f59e0b] font-bold text-[11px] pl-5 flex items-center gap-1.5"><span>🏅</span> +${medalsGained} MEDAL${medalsGained > 1 ? 'S' : ''} KE ${h.winner}</div>`;
    }

    (h.deltas || []).forEach(d => {
      if (d.name !== h.winner) {
        if (d.note) {
          lines += `<div class="text-[#ef4444] font-bold text-[10px] pl-5 flex items-center gap-1"><span>❌</span> ${d.name} ${d.note}</div>`;
        } else if (d.medals !== 0) {
          lines += `<div class="text-[#ef4444] text-[10px] pl-5 flex items-center gap-1"><span>❌</span> ${d.name} forfeit ${d.medals} 🏅</div>`;
        }
      }
    });

    const isMostRecent = idx === 0;
    const borderStyle = isMostRecent ? 'border-l-4 border-brand-gold bg-[#0e1726]' : 'border-l-2 border-[#22354f] bg-[#0b121e]/50';

    html += `
      <div class="${borderStyle} hover:border-brand-gold pl-2.5 py-1.5 rounded-r transition">
        <div class="text-[10px] text-[#556d8f] uppercase font-bold flex items-center justify-between mb-0.5">
          <span class="${isMostRecent ? 'text-brand-gold font-black' : ''}">HAND #${h.hand} ${isMostRecent ? '★ TERBARU' : ''}</span>
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
async function tick() {
  if (GAME_STATE.isPaused) return;

  // 1. Auto-advance blind level when countdown reaches 0
  if (checkAndAdvanceBlindLevel()) {
    renderUI();
    syncTournamentToSupabase();
  }

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
