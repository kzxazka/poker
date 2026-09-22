// Test script to verify Poker MES engine logic in Node.js environment
global.window = {
  addEventListener: () => {}
};
global.supabaseClient = null;

// Mock localStorage
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = v; }
};

const vm = require('vm');
const fs = require('fs');
const code = fs.readFileSync('./game-state.js', 'utf8');

vm.runInThisContext(code);

async function runTest() {
  console.log('=== TEST 1: Initial Hand Start ===');
  GAME_STATE.blindLevel = 1;
  GAME_STATE.centerMedals = 11;
  GAME_STATE.totalMedals = 25;
  await startNewHand(false);

  console.log('Round:', GAME_STATE.currentRound);
  console.log('Pot:', GAME_STATE.pot);
  console.log('Current Bet:', GAME_STATE.currentBet);
  console.log('Active Turn Player ID:', GAME_STATE.activeTurnPlayerId);

  if (GAME_STATE.currentRound !== 'PRE-FLOP') throw new Error('Expected PRE-FLOP');
  if (GAME_STATE.activeTurnPlayerId !== 4) throw new Error('Expected Player 4 (UTG) to act first');
  if (GAME_STATE.pot !== 75) throw new Error('Expected Pot 75 (SB 25 + BB 50)');

  console.log('\n=== TEST 2: Betting Round Pre-Flop ===');
  // Player 4 calls 50
  console.log('Player 4 CALL 50');
  await processPlayerMove(4, 'CALL');
  console.log('Active Turn after P4:', GAME_STATE.activeTurnPlayerId);

  // Player 5 calls 50
  console.log('Player 5 CALL 50');
  await processPlayerMove(5, 'CALL');
  console.log('Active Turn after P5:', GAME_STATE.activeTurnPlayerId);

  // Player 6 calls 50
  console.log('Player 6 CALL 50');
  await processPlayerMove(6, 'CALL');

  // Player 7 folds
  console.log('Player 7 FOLD');
  await processPlayerMove(7, 'FOLD');

  // Player 8 calls 50
  console.log('Player 8 CALL 50');
  await processPlayerMove(8, 'CALL');

  // Player 1 (Dealer) calls 50
  console.log('Player 1 (D) CALL 50');
  await processPlayerMove(1, 'CALL');

  // Player 2 (SB) calls remaining 25 (to match 50)
  console.log('Player 2 (SB) CALL 25');
  await processPlayerMove(2, 'CALL');

  // Player 3 (BB) checks (already paid 50)
  console.log('Player 3 (BB) CHECK');
  await processPlayerMove(3, 'CHECK');

  console.log('\n=== Street status after BB acts ===');
  console.log('Round:', GAME_STATE.currentRound);
  console.log('Pot:', GAME_STATE.pot);
  console.log('Current Bet:', GAME_STATE.currentBet);
  console.log('Active Turn Player on FLOP:', GAME_STATE.activeTurnPlayerId);

  if (GAME_STATE.currentRound !== 'FLOP') throw new Error('Expected street to advance to FLOP!');

  console.log('\n=== TEST 3: Flop, Turn, River checks to Showdown ===');
  // On Flop, all remaining eligible players check: 2, 3, 4, 5, 6, 8, 1
  const eligibleIds = [2, 3, 4, 5, 6, 8, 1];
  for (const id of eligibleIds) {
    await processPlayerMove(id, 'CHECK');
  }
  console.log('After Flop checks, Round:', GAME_STATE.currentRound);
  if (GAME_STATE.currentRound !== 'TURN') throw new Error('Expected street to advance to TURN!');

  for (const id of eligibleIds) {
    await processPlayerMove(id, 'CHECK');
  }
  console.log('After Turn checks, Round:', GAME_STATE.currentRound);
  if (GAME_STATE.currentRound !== 'RIVER') throw new Error('Expected street to advance to RIVER!');

  for (const id of eligibleIds) {
    await processPlayerMove(id, 'CHECK');
  }
  console.log('After River checks, Round:', GAME_STATE.currentRound);
  if (GAME_STATE.currentRound !== 'SHOWDOWN') throw new Error('Expected street to advance to SHOWDOWN!');

  console.log('\n=== TEST 4: Winner Resolution with centerMedals > 0 ===');
  const initialCenter = GAME_STATE.centerMedals;
  const winnerP1 = GAME_STATE.players.find(p => p.id === 1);
  const p1InitMedals = winnerP1.medals;
  await resolveHandWinner(1);

  console.log('Center Medals after win:', GAME_STATE.centerMedals);
  console.log('P1 Medals after win:', winnerP1.medals);
  console.log('Next Hand #:', GAME_STATE.hand);
  console.log('Next Round after hand ends:', GAME_STATE.currentRound);
  console.log('New Dealer Role:', GAME_STATE.players.find(p => p.positionRole === 'D')?.name);

  if (GAME_STATE.centerMedals !== initialCenter - 1) throw new Error('Winner should take 1 medal from center!');
  if (winnerP1.medals !== p1InitMedals + 1) throw new Error('Winner should have +1 medal!');
  if (GAME_STATE.currentRound !== 'PRE-FLOP') throw new Error('Next hand should automatically start in PRE-FLOP!');

  console.log('\n=== TEST 5: Medal Forfeiture when centerMedals === 0 ===');
  GAME_STATE.centerMedals = 0;
  // Give players medals to test forfeit
  GAME_STATE.players.forEach(p => p.medals = 5);
  await startNewHand(false);

  // Active turn is after BB. Let active player raise to 400!
  const curTurnId = GAME_STATE.activeTurnPlayerId;
  const curTurnP = GAME_STATE.players.find(p => p.id === curTurnId);
  console.log(`Player ${curTurnP.name} (medals: ${curTurnP.medals}) RAISES to 400 chips`);
  await processPlayerMove(curTurnId, 'RAISE', 400);

  console.log(`Player ${curTurnP.name} medals after raising 400 chips:`, curTurnP.medals);
  console.log('Forfeited Medals in Pot:', GAME_STATE.forfeitedMedalsInPot);

  if (curTurnP.medals !== 4) throw new Error('Expected player to forfeit 1 medal upon 400 chips contribution!');
  if (GAME_STATE.forfeitedMedalsInPot !== 1) throw new Error('Expected 1 forfeited medal in pot!');

  console.log('\nALL TESTS PASSED SUCCESSFULLY! ✅');
}

runTest().catch(e => {
  console.error('TEST FAILED ❌:', e);
  process.exit(1);
});
