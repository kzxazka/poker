// Automated verification test of all user requested rules & fixes
const fs = require('fs');

// Mock localStorage and window
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
global.window = {
  addEventListener: () => {},
  BroadcastChannel: class {
    constructor() {}
    postMessage() {}
  }
};
global.supabaseClient = null;
global.getSupabase = () => null;

// Load game-state logic
const vm = require('vm');
const gameStateCode = fs.readFileSync('d:/OneDrive/Documents/POKER/game-state.js', 'utf8');
vm.runInThisContext(gameStateCode);

async function runTests() {
  console.log('=== RUNNING TESTS FOR USER SPECIFICATIONS ===\n');

  // Test 1: Blind schedule & following current blinds
  console.log('Test 1: SB and BB strictly follow current blind level');
  GAME_STATE.blindLevel = 2; // Level 2: sb=50, bb=100
  const curBlind = getCurrentBlind();
  if (curBlind.sb !== 50 || curBlind.bb !== 100) {
    throw new Error(`Expected Level 2 blind to be 50/100, got ${curBlind.sb}/${curBlind.bb}`);
  }
  console.log('  ✓ Level 2 blind is 50 / 100');

  // Test 2: Mandatory medal conversion before hand starts if chips < BB
  console.log('\nTest 2: Mandatory medal conversion before hand starts if chips < BB');
  // Player 4 has 40 chips (< 100 BB) and 2 medals
  const p4 = GAME_STATE.players.find(p => p.id === 4);
  p4.chips = 40;
  p4.medals = 2;
  p4.status = 'active';

  await startNewHand(false);
  if (p4.chips < 100) {
    throw new Error(`Expected Player 4 chips >= 100, but got ${p4.chips}`);
  }
  if (p4.medals !== 1) {
    throw new Error(`Expected Player 4 medals to be 1 after converting 1 medal, got ${p4.medals}`);
  }
  console.log(`  ✓ Player 4 had 40 chips & 2 medals. Converted 1 medal → chips=${p4.chips}, medals=${p4.medals}`);

  // Test 3: Player bust automatically gets Last Try (+400 chips) and returns medals to center
  console.log('\nTest 3: Bust player with medals returns all medals to center and gets +400 chips');
  const initialCenter = GAME_STATE.centerMedals;
  const p5 = GAME_STATE.players.find(p => p.id === 5);
  p5.chips = 0;
  p5.medals = 3;
  p5.lastTryUsed = false;
  p5.status = 'active';

  await startNewHand(false);
  if (p5.chips !== 400 || !p5.lastTryUsed || p5.status !== 'lasttry') {
    throw new Error(`Expected Player 5 to have 400 chips and lastTryUsed=true, got chips=${p5.chips}, used=${p5.lastTryUsed}`);
  }
  if (p5.medals !== 0) {
    throw new Error(`Expected Player 5 medals to be 0, got ${p5.medals}`);
  }
  if (GAME_STATE.centerMedals !== initialCenter + 3) {
    throw new Error(`Expected centerMedals to increase by 3 from ${initialCenter}, got ${GAME_STATE.centerMedals}`);
  }
  console.log(`  ✓ Player 5 had 0 chips & 3 medals. Received +400 chips Last Try, 3 medals returned to Center.`);

  // Test 4: Pre-flop Check is strictly forbidden if toCall > 0
  console.log('\nTest 4: Pre-flop Check bug fix: UTG and players facing BB cannot check');
  // At level 2, BB is 100
  const turnPlayerId = GAME_STATE.activeTurnPlayerId;
  const turnPlayer = GAME_STATE.players.find(p => p.id === turnPlayerId);
  const checkResult = await processPlayerMove(turnPlayerId, 'CHECK');
  if (checkResult !== false) {
    throw new Error('Expected CHECK to fail for player who has paid 0 when BB is 100!');
  }
  console.log(`  ✓ UTG (${turnPlayer.name}) attempted CHECK: correctly REJECTED`);

  // Call the BB
  const callResult = await processPlayerMove(turnPlayerId, 'CALL');
  if (!callResult || !turnPlayer.currentAction.startsWith('CALL')) {
    throw new Error(`Expected CALL to succeed with action 'CALL 100', got ${turnPlayer.currentAction}`);
  }
  console.log(`  ✓ UTG (${turnPlayer.name}) performed CALL: succeeded with action '${turnPlayer.currentAction}'`);

  // Test 5: Small Blind player must call the difference (BB - SB) to match Big Blind
  console.log('\nTest 5: Small blind player cannot check, must call the difference to match BB');
  // Advance turns until turn reaches SB player
  const sbPlayer = GAME_STATE.players.find(p => p.positionRole === 'SB');
  GAME_STATE.activeTurnPlayerId = sbPlayer.id;

  const sbCheckResult = await processPlayerMove(sbPlayer.id, 'CHECK');
  if (sbCheckResult !== false) {
    throw new Error('Expected SB player CHECK to be rejected when BB is 100 and SB only paid 50!');
  }
  console.log(`  ✓ SB (${sbPlayer.name}) attempted CHECK: correctly REJECTED`);

  const sbCallResult = await processPlayerMove(sbPlayer.id, 'CALL');
  if (!sbCallResult) {
    throw new Error('Expected SB player CALL to succeed');
  }
  console.log(`  ✓ SB (${sbPlayer.name}) called the difference: succeeded with action '${sbPlayer.currentAction}'`);

  // Test 6: Big Blind player can check if nobody raised
  console.log('\nTest 6: Big Blind player CAN check if nobody raised (option check)');
  const bbPlayer = GAME_STATE.players.find(p => p.positionRole === 'BB');
  GAME_STATE.activeTurnPlayerId = bbPlayer.id;
  const bbCheckResult = await processPlayerMove(bbPlayer.id, 'CHECK');
  if (!bbCheckResult) {
    throw new Error('Expected Big Blind to be able to CHECK when currentBet === bbPaid');
  }
  console.log(`  ✓ BB (${bbPlayer.name}) performed CHECK: succeeded (valid option)`);

  // Test 7: Raise action updates currentBet and next players cannot check
  console.log('\nTest 7: Raise sets nominal beside name and forces subsequent players to CALL');
  GAME_STATE.currentRound = 'FLOP';
  GAME_STATE.currentBet = 0;
  GAME_STATE.roundBets = {};
  GAME_STATE.actedInRound = [];
  const p1 = GAME_STATE.players[0];
  const p2 = GAME_STATE.players[1];
  p1.chips = 2000;
  p2.chips = 2000;
  GAME_STATE.activeTurnPlayerId = p1.id;

  // P1 raises to 300
  await processPlayerMove(p1.id, 'RAISE', 300);
  if (p1.currentAction !== 'RAISE 300' || GAME_STATE.currentBet !== 300) {
    throw new Error(`Expected P1 action 'RAISE 300', got ${p1.currentAction}, bet=${GAME_STATE.currentBet}`);
  }
  console.log(`  ✓ Player 1 raised to 300: action is '${p1.currentAction}', bet is ${GAME_STATE.currentBet}`);

  // P2 turn: cannot check!
  GAME_STATE.activeTurnPlayerId = p2.id;
  const p2Check = await processPlayerMove(p2.id, 'CHECK');
  if (p2Check !== false) {
    throw new Error('P2 should NOT be able to check after P1 raised!');
  }
  console.log(`  ✓ Player 2 attempted CHECK after 300 raise: correctly REJECTED`);

  // Test 8: Center medals deduction when > 0
  console.log('\nTest 8: Automatic center medal transfer to winner when centerMedals > 0');
  GAME_STATE.centerMedals = 5;
  const winner = GAME_STATE.players[0];
  const winMedalsBefore = winner.medals || 0;
  await resolveHandWinner(winner.id);
  if (winner.medals !== winMedalsBefore + 1) {
    throw new Error(`Expected winner to gain 1 medal, got ${winner.medals}`);
  }
  if (GAME_STATE.centerMedals !== 4) {
    throw new Error(`Expected centerMedals to be 4, got ${GAME_STATE.centerMedals}`);
  }
  console.log(`  ✓ Winner took 1 medal from center: centerMedals=4, winner.medals=${winner.medals}`);

  // Test 9: Real-time 400 chips contribution medal forfeiture when centerMedals === 0
  console.log('\nTest 9: Every 400 chips contributed forfeits 1 medal when centerMedals === 0');
  GAME_STATE.centerMedals = 0;
  GAME_STATE.pot = 0;
  GAME_STATE.currentHandContributions = {};
  GAME_STATE.roundBets = {};
  GAME_STATE.actedInRound = [];
  GAME_STATE.forfeitedInHand = {};
  GAME_STATE.forfeitedMedalsInPot = 0;

  const testRaiser = GAME_STATE.players[1];
  testRaiser.chips = 2000;
  testRaiser.medals = 5;
  GAME_STATE.activeTurnPlayerId = testRaiser.id;

  // Raiser bets 800 chips -> should forfeit 2 medals in real time!
  await processPlayerMove(testRaiser.id, 'RAISE', 800);
  if (testRaiser.medals !== 3) {
    throw new Error(`Expected testRaiser medals to drop from 5 to 3 (800 chips spent), got ${testRaiser.medals}`);
  }
  if (GAME_STATE.forfeitedMedalsInPot !== 2) {
    throw new Error(`Expected 2 medals in pot from forfeiture, got ${GAME_STATE.forfeitedMedalsInPot}`);
  }
  console.log(`  ✓ Player spent 800 chips with centerMedals=0: forfeited 2 medals real-time (medals=3, potMedals=2)`);

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
