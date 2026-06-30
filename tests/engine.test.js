'use strict';
const { test, run, assert } = require('./harness');
const E = require('../src/engine');

// ── Helpers ───────────────────────────────────────────────────────────────
// A scripted RNG that returns each supplied value in turn (then repeats the
// last one), so randomised mechanics can be tested deterministically.
function seq(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
// Build a minimal stock so tests control prices exactly.
function stock(id, price, opts = {}) {
  return {
    id, name: opts.name || id, sector: opts.sector || 'Test',
    price, prevPrice: opts.prevPrice == null ? price : opts.prevPrice,
    dividendYield: opts.dividendYield || 0, volatility: opts.volatility || 0,
    history: opts.history || [price],
  };
}
function baseState(over = {}) {
  return Object.assign({
    mode: 'none', round: 1,
    stocks: [stock('BPI', 100), stock('GOFH', 80, { dividendYield: 0.06 })],
    players: [E.createPlayer('Maya'), E.createPlayer('Sam')],
    news: [], transactions: [],
  }, over);
}

// ── Rounding (#7) ───────────────────────────────────────────────────────────
test('roundMoney none keeps two decimals', () => {
  assert.strictEqual(E.roundMoney(46.314, 'none'), 46.31);
  assert.strictEqual(E.roundMoney(46.316, 'none'), 46.32);
});
test('roundMoney integer rounds to nearest whole number', () => {
  assert.strictEqual(E.roundMoney(46.3, 'integer'), 46);
  assert.strictEqual(E.roundMoney(46.7, 'integer'), 47);
});
test('roundMoney five rounds to nearest multiple of five', () => {
  assert.strictEqual(E.roundMoney(46, 'five'), 45);
  assert.strictEqual(E.roundMoney(49, 'five'), 50);
  assert.strictEqual(E.roundMoney(42, 'five'), 40);
});

// ── Dynamic players (#8 Kahoot-style join) ──────────────────────────────────
test('createInitialState with an empty name list starts with no players', () => {
  const s = E.createInitialState({ names: [], mode: 'integer' });
  assert.strictEqual(s.players.length, 0);
  assert.strictEqual(s.stocks.length, 8);
});
test('addPlayer appends a fresh player without disturbing existing ones', () => {
  let s = E.createInitialState({ names: [], mode: 'integer' });
  s = E.addPlayer(s, 'Maya');
  s = E.addPlayer(s, 'Sam');
  assert.strictEqual(s.players.length, 2);
  assert.strictEqual(s.players[0].name, 'Maya');
  assert.strictEqual(s.players[1].name, 'Sam');
  assert.strictEqual(s.players[1].realized, 0);
});

// ── Player setup (#5: no cash balance) ──────────────────────────────────────
test('createPlayer starts with zero virtual P&L and no positions', () => {
  const p = E.createPlayer('Maya');
  assert.strictEqual(p.name, 'Maya');
  assert.strictEqual(p.realized, 0);
  assert.strictEqual(p.loan, 0);
  assert.deepStrictEqual(p.portfolio, {});
  assert.deepStrictEqual(p.shorts, {});
});

// ── Buying ───────────────────────────────────────────────────────────────
test('cash buy subtracts cost from realized and adds shares', () => {
  const s = baseState();
  const r = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'buy', qty: 3 });
  assert.strictEqual(r.error, null);
  const p = r.state.players[0];
  assert.strictEqual(p.realized, -300);
  assert.strictEqual(p.portfolio.BPI.shares, 3);
  assert.strictEqual(p.portfolio.BPI.avgCost, 100);
  assert.strictEqual(p.loan, 0);
});
test('margin buy adds a loan instead of touching realized', () => {
  const s = baseState();
  const r = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'buy', qty: 5, margin: true });
  const p = r.state.players[0];
  assert.strictEqual(p.realized, 0);
  assert.strictEqual(p.loan, 500);
  assert.strictEqual(p.portfolio.BPI.shares, 5);
  // Net worth unchanged at the moment of a margin purchase: bought an asset
  // worth exactly what was borrowed.
  assert.strictEqual(E.netWorth(p, r.state.stocks), 0);
});
test('buy rejects a non-positive quantity', () => {
  const s = baseState();
  const r = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'buy', qty: 0 });
  assert.ok(r.error);
  assert.strictEqual(r.state, s); // unchanged
});
test('does not mutate the input state', () => {
  const s = baseState();
  E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'buy', qty: 3 });
  assert.strictEqual(s.players[0].realized, 0);
  assert.deepStrictEqual(s.players[0].portfolio, {});
});

// ── Selling ───────────────────────────────────────────────────────────────
test('sell adds proceeds to realized and reduces shares', () => {
  let s = baseState();
  s = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'buy', qty: 4 }).state;
  const r = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'sell', qty: 1 });
  const p = r.state.players[0];
  assert.strictEqual(p.portfolio.BPI.shares, 3);
  assert.strictEqual(p.realized, -400 + 100);
});
test('sell repays any outstanding margin loan before paying out cash', () => {
  let s = baseState();
  s = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'buy', qty: 5, margin: true }).state; // loan 500
  const r = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'sell', qty: 4 }); // proceeds 400
  const p = r.state.players[0];
  assert.strictEqual(p.loan, 100);      // 500 - 400 repaid
  assert.strictEqual(p.realized, 0);    // nothing left over for cash
});
test('sell rejects more shares than held', () => {
  const s = baseState();
  const r = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'sell', qty: 1 });
  assert.ok(r.error);
});

// ── Shorting (#2 bug fix) ───────────────────────────────────────────────────
test('opening a short adds proceeds but leaves net worth unchanged', () => {
  const s = baseState();
  const r = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'short', qty: 10 });
  const p = r.state.players[0];
  assert.strictEqual(p.realized, 1000);            // received proceeds
  assert.strictEqual(p.shorts.BPI.shares, 10);
  // The bug: net worth used to ignore the short liability and inflate.
  assert.strictEqual(E.netWorth(p, r.state.stocks), 0);
});
test('a short gains value when the price falls', () => {
  let s = baseState();
  s = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'short', qty: 10 }).state;
  const dropped = baseState({ stocks: [stock('BPI', 90), stock('GOFH', 80)] });
  assert.strictEqual(E.netWorth(s.players[0], dropped.stocks), 100); // 10 * (100-90)
});
test('cover subtracts cost from realized and reduces the short', () => {
  let s = baseState();
  s = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'short', qty: 10 }).state;
  const r = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'cover', qty: 4 });
  const p = r.state.players[0];
  assert.strictEqual(p.shorts.BPI.shares, 6);
  assert.strictEqual(p.realized, 1000 - 400);
});
test('cover rejects more than the open short', () => {
  const s = baseState();
  const r = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'cover', qty: 1 });
  assert.ok(r.error);
});
test('coverCost reports the current buy-back cost of a short', () => {
  let s = baseState();
  s = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'short', qty: 10 }).state;
  assert.strictEqual(E.coverCost(s.players[0], 'BPI', s.stocks), 1000);
});

// ── Repaying a loan (response to a margin call) ─────────────────────────────
test('repay reduces both the loan and realized by the amount paid', () => {
  let s = baseState();
  s = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'buy', qty: 5, margin: true }).state;
  const r = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'repay', qty: 200 });
  const p = r.state.players[0];
  assert.strictEqual(p.loan, 300);
  assert.strictEqual(p.realized, -200);
});

// ── Net worth & leaderboard (#5) ────────────────────────────────────────────
test('netWorth combines realized cash, longs, shorts and loans', () => {
  const p = {
    name: 'X', realized: 50, loan: 200,
    portfolio: { BPI: { shares: 3, avgCost: 90 } },
    shorts: { GOFH: { shares: 2, openPrice: 80 } },
  };
  const stocks = [stock('BPI', 100), stock('GOFH', 70)];
  // 50 + (3*100) - (2*70) - 200 = 10
  assert.strictEqual(E.netWorth(p, stocks), 10);
});
test('leaderboard ranks players by net worth, highest first', () => {
  const s = baseState();
  s.players[0].realized = 500;
  s.players[1].realized = 1500;
  const board = E.leaderboard(s);
  assert.strictEqual(board[0].name, 'Sam');
  assert.strictEqual(board[0].netWorth, 1500);
  assert.strictEqual(board[1].name, 'Maya');
});

// ── Advancing a round ───────────────────────────────────────────────────────
test('advanceRound increments the round and records prevPrice', () => {
  const s = baseState();
  const r = E.advanceRound(s, seq([0, 0, 0.46, 0.46]));
  assert.strictEqual(r.state.round, 2);
  assert.strictEqual(r.state.stocks[0].prevPrice, 100);
});
test('advanceRound rounds new prices per the game mode', () => {
  const s = baseState({ mode: 'integer', stocks: [stock('BPI', 100, { volatility: 0.06 })] });
  const r = E.advanceRound(s, seq([0, 0.1, 0.9])); // event on a different idx, then upward drift
  assert.strictEqual(r.state.stocks[0].price, Math.round(r.state.stocks[0].price));
});
test('advanceRound pays dividends into realized for held shares', () => {
  let s = baseState({ mode: 'integer' });
  s = E.applyTrade(s, { playerIdx: 0, stockId: 'GOFH', action: 'buy', qty: 10 }).state; // -800
  // rng: count=1, event idx -> BPI (idx 0), zero drift so GOFH stays 80
  const r = E.advanceRound(s, seq([0, 0, 0.46, 0.46]));
  const p = r.state.players[0];
  // dividend = round(10 * 80 * 0.06) = round(48) = 48
  assert.strictEqual(p.realized, -800 + 48);
});
test('advanceRound liquidates an undercollateralised margin position', () => {
  let s = baseState({ mode: 'integer', stocks: [stock('GOFH', 80, { dividendYield: 0 })] });
  // Borrow far more than the collateral is worth.
  s.players[0].portfolio = { GOFH: { shares: 1, avgCost: 80 } };
  s.players[0].loan = 500;
  // rng: count=1, event idx 0 (the only stock, +ve impact), zero drift.
  const r = E.advanceRound(s, seq([0, 0, 0.46]));
  const p = r.state.players[0];
  assert.strictEqual(p.loan, 0);                       // loan cleared
  assert.deepStrictEqual(p.portfolio, {});             // shares sold off
  assert.strictEqual(p.liquidatedThisRound, true);     // surfaced to the host
  assert.ok(p.realized < 0);                           // shortfall paid from tabletop
});
test('advanceRound does not liquidate a healthy margin position', () => {
  let s = baseState({ mode: 'integer', stocks: [stock('GOFH', 80, { dividendYield: 0 })] });
  s.players[0].portfolio = { GOFH: { shares: 10, avgCost: 80 } }; // collateral 800
  s.players[0].loan = 300;                                        // 300 < 0.8*800
  const r = E.advanceRound(s, seq([0, 0, 0.46]));
  const p = r.state.players[0];
  assert.strictEqual(p.loan, 300);
  assert.strictEqual(p.portfolio.GOFH.shares, 10);
  assert.strictEqual(p.liquidatedThisRound, false);
});

// ── Margin status (#3 surfaced on each player's tab) ────────────────────────
test('marginStatus reports loan, collateral, ratio and call flag', () => {
  const p = { portfolio: { GOFH: { shares: 10, avgCost: 80 } }, shorts: {}, loan: 700, realized: 0 };
  const stocks = [stock('GOFH', 80)];
  const st = E.marginStatus(p, stocks);
  assert.strictEqual(st.loan, 700);
  assert.strictEqual(st.collateral, 800);
  assert.ok(Math.abs(st.ratio - 0.875) < 1e-9);
  assert.strictEqual(st.call, true); // 700 > 0.8 * 800
});

// ── Save / load (#1) ────────────────────────────────────────────────────────
test('serialize then deserialize round-trips the game state', () => {
  let s = baseState({ gameName: 'Friday Night' });
  s = E.applyTrade(s, { playerIdx: 0, stockId: 'BPI', action: 'buy', qty: 2 }).state;
  const restored = E.deserialize(E.serialize(s));
  assert.strictEqual(restored.players[0].portfolio.BPI.shares, 2);
  assert.strictEqual(restored.gameName, 'Friday Night');
  assert.strictEqual(restored.round, s.round);
});
test('saveFilename uses {game_name}_{ISO}.json with no illegal characters', () => {
  const name = E.saveFilename('Friday Night', new Date('2026-06-29T14:30:05.000Z'));
  assert.ok(name.endsWith('.json'));
  assert.ok(!name.includes(':'));
  assert.ok(/^Friday_Night_2026-06-29T14-30-05/.test(name));
});

run();
