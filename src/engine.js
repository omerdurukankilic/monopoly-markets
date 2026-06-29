'use strict';
// ============================================================================
// Monopoly Markets — game engine
// ----------------------------------------------------------------------------
// Pure, DOM-free game logic. Every mechanic lives here so it can be unit
// tested (see tests/engine.test.js) and re-used by the bundled UI, which
// inlines this file via build.js. No `window`/`document` references allowed.
//
// Economic model (decided during testing feedback):
//   * Players use their real tabletop Monopoly cash. The app does NOT cap or
//     track a spendable balance (feedback #5). Instead each player has a
//     `realized` virtual P&L that starts at $0 and tracks the cash effect of
//     their trades, so we can rank a leaderboard.
//   * "Borrow to buy" creates a `loan` (uncapped, interest-free — feedback #6).
//     The shares bought are collateral; if a loan exceeds the maintenance
//     fraction of its collateral it is margin-called and liquidated on the
//     next ADVANCE (feedback #3).
//   * Net worth = realized + long value − short liability − loan. Subtracting
//     the short liability is the fix for the old shorting exploit (feedback #2).
// ============================================================================

var MAINTENANCE = 0.8; // a loan above 80% of its collateral value is called

// ── Reference data ──────────────────────────────────────────────────────────
var STOCKS_INIT = [
  { id:'BPI',  name:'Boardwalk Properties', sector:'Real Estate', basePrice:150, dividendYield:0.030, volatility:0.06 },
  { id:'CCF',  name:'Community Chest Fin.',  sector:'Finance',     basePrice:85,  dividendYield:0.050, volatility:0.08 },
  { id:'RAIL', name:'Railroad Continental', sector:'Transport',   basePrice:200, dividendYield:0.020, volatility:0.05 },
  { id:'UTIL', name:'Utility Monopoly Corp', sector:'Utilities',   basePrice:120, dividendYield:0.040, volatility:0.04 },
  { id:'PPV',  name:'Park Place Ventures',  sector:'Real Estate', basePrice:220, dividendYield:0.025, volatility:0.07 },
  { id:'MCG',  name:'Mayfair Capital Group', sector:'Finance',    basePrice:310, dividendYield:0.015, volatility:0.09 },
  { id:'GOFH', name:'Go Free Holdings',     sector:'Leisure',     basePrice:75,  dividendYield:0.060, volatility:0.10 },
  { id:'CHCA', name:'Chance & Associates',  sector:'Diversified', basePrice:98,  dividendYield:0.035, volatility:0.12 },
];

var NEWS_DB = [
  { headline: 'Boardwalk rezoning approved for luxury condos', stock:'BPI', impact: 0.08 },
  { headline: 'Community Chest reports record dividend payouts', stock:'CCF', impact: 0.06 },
  { headline: 'Railroad strike averted after last-minute deal', stock:'RAIL', impact: 0.07 },
  { headline: 'Utility regulator threatens rate freeze', stock:'UTIL', impact: -0.08 },
  { headline: 'Park Place casino expansion greenlit by city council', stock:'PPV', impact: 0.10 },
  { headline: 'Mayfair Capital faces major fraud investigation', stock:'MCG', impact: -0.12 },
  { headline: 'Go Free Holdings launches entertainment mega-complex', stock:'GOFH', impact: 0.09 },
  { headline: 'Chance & Associates diversifies into AI gaming', stock:'CHCA', impact: 0.15 },
  { headline: 'Fed rate cut boosts entire Finance sector', sector:'Finance', impact: 0.05 },
  { headline: 'Housing market crash fears shake Real Estate', sector:'Real Estate', impact: -0.10 },
  { headline: 'Oil spike hammers transport stocks nationwide', stock:'RAIL', impact: -0.07 },
  { headline: 'Boardwalk Properties misses earnings by wide margin', stock:'BPI', impact: -0.09 },
  { headline: 'Utilities outperform amid central bank tightening', stock:'UTIL', impact: 0.06 },
  { headline: 'Go Free Holdings sued for patent infringement', stock:'GOFH', impact: -0.11 },
  { headline: 'Merger rumours swirl around Mayfair Capital', stock:'MCG', impact: 0.08 },
  { headline: 'GDP beats expectations — broad market rally', impact: 0.04 },
  { headline: 'Recession fears trigger broad market selloff', impact: -0.05 },
  { headline: 'Chance & Associates CFO resigns amid accounting scandal', stock:'CHCA', impact: -0.13 },
  { headline: 'Railroad Continental wins $2B government contract', stock:'RAIL', impact: 0.12 },
  { headline: 'Community Chest Financial downgraded by major analyst', stock:'CCF', impact: -0.06 },
  { headline: 'Tech bubble fears spread to diversified funds', sector:'Diversified', impact: -0.06 },
  { headline: 'Leisure sector booms as tourism surges', sector:'Leisure', impact: 0.07 },
  { headline: 'Inflation data surprises sharply to the upside', impact: -0.03 },
  { headline: 'Strong jobs report lifts market sentiment broadly', impact: 0.03 },
  { headline: 'Boardwalk Properties acquires Marvin Gardens Holdings', stock:'BPI', impact: 0.05 },
  { headline: 'Park Place Ventures faces activist investor pressure', stock:'PPV', impact: -0.07 },
  { headline: 'Mayfair Capital announces $500M share buyback', stock:'MCG', impact: 0.06 },
  { headline: 'Community Chest Financial raises full-year dividend guidance', stock:'CCF', impact: 0.04 },
  { headline: 'Utilities sector surges on cold-snap energy demand', sector:'Utilities', impact: 0.06 },
  { headline: 'Real Estate sector rebounds on lower mortgage rates', sector:'Real Estate', impact: 0.08 },
];

// ── Rounding (#7) ─────────────────────────────────────────────────────────
// 'none' keeps cents, 'integer' (default) rounds to whole dollars, 'five'
// rounds to the nearest $5 so amounts are payable with physical notes.
function roundMoney(n, mode) {
  n = n || 0;
  if (mode === 'integer') return Math.round(n);
  if (mode === 'five') return Math.round(n / 5) * 5;
  return Math.round(n * 100) / 100;
}

function makeInitialHistory(base, mode, rng) {
  rng = rng || Math.random;
  var h = [base];
  for (var i = 0; i < 5; i++) {
    var last = h[h.length - 1];
    h.push(Math.max(5, roundMoney(last * (1 + (rng() - 0.47) * 0.05), mode)));
  }
  return h;
}

function createStocks(mode, rng) {
  return STOCKS_INIT.map(function (s) {
    var base = roundMoney(s.basePrice, mode);
    var history = makeInitialHistory(base, mode, rng);
    var price = history[history.length - 1];
    return {
      id: s.id, name: s.name, sector: s.sector,
      dividendYield: s.dividendYield, volatility: s.volatility,
      price: price, prevPrice: price, history: history,
    };
  });
}

function createPlayer(name) {
  return {
    name: name || 'Player',
    realized: 0,
    portfolio: {},
    shorts: {},
    loan: 0,
    liquidatedThisRound: false,
  };
}

function createInitialState(opts) {
  opts = opts || {};
  var mode = opts.mode || 'integer';
  return {
    gameName: opts.gameName || 'Monopoly Markets',
    mode: mode,
    round: 1,
    stocks: createStocks(mode, opts.rng),
    players: (opts.names || ['Player 1', 'Player 2', 'Player 3']).map(createPlayer),
    news: [],
    transactions: [],
  };
}

// ── Derived values ──────────────────────────────────────────────────────────
function findStock(stocks, id) {
  for (var i = 0; i < stocks.length; i++) if (stocks[i].id === id) return stocks[i];
  return null;
}

function longValue(player, stocks) {
  var v = 0;
  Object.keys(player.portfolio).forEach(function (id) {
    var st = findStock(stocks, id);
    if (st) v += player.portfolio[id].shares * st.price;
  });
  return v;
}

function shortLiability(player, stocks) {
  var v = 0;
  Object.keys(player.shorts).forEach(function (id) {
    var st = findStock(stocks, id);
    if (st) v += player.shorts[id].shares * st.price;
  });
  return v;
}

// Net worth = virtual cash + longs − short liability − loan. Subtracting the
// short liability is the fix for the old shorting exploit (#2).
function netWorth(player, stocks) {
  return player.realized + longValue(player, stocks) - shortLiability(player, stocks) - (player.loan || 0);
}

function coverCost(player, id, stocks) {
  var sh = player.shorts[id];
  var st = findStock(stocks, id);
  if (!sh || !st) return 0;
  return sh.shares * st.price;
}

// Loan health against its collateral (the player's long holdings).
function marginStatus(player, stocks) {
  var collateral = longValue(player, stocks);
  var loan = player.loan || 0;
  return {
    loan: loan,
    collateral: collateral,
    ratio: collateral > 0 ? loan / collateral : (loan > 0 ? Infinity : 0),
    call: loan > 0 && loan > MAINTENANCE * collateral,
  };
}

function leaderboard(state) {
  return state.players
    .map(function (p, i) { return { idx: i, name: p.name, netWorth: netWorth(p, state.stocks) }; })
    .sort(function (a, b) { return b.netWorth - a.netWorth; });
}

// ── Trades ──────────────────────────────────────────────────────────────────
function clonePlayer(p) {
  var portfolio = {};
  Object.keys(p.portfolio).forEach(function (k) { portfolio[k] = { shares: p.portfolio[k].shares, avgCost: p.portfolio[k].avgCost }; });
  var shorts = {};
  Object.keys(p.shorts).forEach(function (k) { shorts[k] = { shares: p.shorts[k].shares, openPrice: p.shorts[k].openPrice }; });
  return { name: p.name, realized: p.realized, portfolio: portfolio, shorts: shorts, loan: p.loan || 0, liquidatedThisRound: !!p.liquidatedThisRound };
}

function fail(state, msg) { return { state: state, error: msg, txn: null }; }

// Applies a single order. Pure: returns a NEW state on success, or the
// original state with an `error` string on rejection.
function applyTrade(state, order) {
  var player = state.players[order.playerIdx];
  if (!player) return fail(state, 'Select a player');
  var stock = order.action === 'repay' ? null : findStock(state.stocks, order.stockId);
  if (order.action !== 'repay' && !stock) return fail(state, 'Unknown stock');

  var qty = parseInt(order.qty, 10);
  if (!qty || qty <= 0) return fail(state, 'Enter a valid quantity');

  var p = clonePlayer(player);
  var txn = { round: state.round, player: p.name, stock: order.stockId, qty: qty };

  if (order.action === 'buy') {
    var cost = qty * stock.price;
    var ex = p.portfolio[order.stockId] || { shares: 0, avgCost: 0 };
    var total = ex.shares + qty;
    p.portfolio[order.stockId] = { shares: total, avgCost: (ex.shares * ex.avgCost + qty * stock.price) / total };
    if (order.margin) { p.loan += cost; }            // borrow to buy (#6)
    else { p.realized -= cost; }
    txn.action = 'BUY'; txn.price = stock.price; txn.total = -cost; txn.margin = !!order.margin;

  } else if (order.action === 'sell') {
    var holding = p.portfolio[order.stockId];
    if (!holding || holding.shares < qty) return fail(state, 'Not enough shares to sell');
    var proceeds = qty * stock.price;
    holding.shares -= qty;
    var repaid = Math.min(p.loan, proceeds);          // sells pay down margin first (#3)
    p.loan -= repaid;
    p.realized += proceeds - repaid;
    txn.action = 'SELL'; txn.price = stock.price; txn.total = proceeds;

  } else if (order.action === 'short') {
    var sProceeds = qty * stock.price;
    p.realized += sProceeds;
    var exS = p.shorts[order.stockId] || { shares: 0, openPrice: 0 };
    var totalS = exS.shares + qty;
    p.shorts[order.stockId] = { shares: totalS, openPrice: (exS.shares * exS.openPrice + qty * stock.price) / totalS };
    txn.action = 'SHORT'; txn.price = stock.price; txn.total = sProceeds;

  } else if (order.action === 'cover') {
    var short = p.shorts[order.stockId];
    if (!short || short.shares < qty) return fail(state, 'No short position to cover');
    var cCost = qty * stock.price;
    short.shares -= qty;
    p.realized -= cCost;
    txn.action = 'COVER'; txn.price = stock.price; txn.total = -cCost;

  } else if (order.action === 'repay') {
    // qty is a dollar amount here, not a share count.
    var pay = Math.min(qty, p.loan);
    if (pay <= 0) return fail(state, 'No loan to repay');
    p.loan -= pay;
    p.realized -= pay;
    txn.action = 'REPAY'; txn.price = null; txn.total = -pay; txn.qty = pay;

  } else {
    return fail(state, 'Unknown action');
  }

  var players = state.players.map(function (pl, i) { return i === order.playerIdx ? p : pl; });
  var transactions = [txn].concat(state.transactions).slice(0, 100);
  var newState = Object.assign({}, state, { players: players, transactions: transactions });
  return { state: newState, error: null, txn: txn };
}

// ── Advancing a round ────────────────────────────────────────────────────────
// RNG is consumed in a fixed, documented order so the mechanic is testable:
//   1) event count          2) one index per event          3) one drift per stock
function advanceRound(state, rng) {
  rng = rng || Math.random;
  var mode = state.mode;

  var count = 1 + Math.floor(rng() * 2);
  var events = [];
  for (var e = 0; e < count; e++) {
    var idx = Math.min(Math.floor(rng() * NEWS_DB.length), NEWS_DB.length - 1);
    events.push(NEWS_DB[idx]);
  }

  var newStocks = state.stocks.map(function (s) {
    var chgPct = (rng() - 0.46) * 2 * s.volatility;
    events.forEach(function (ev) {
      if (ev.stock === s.id) chgPct += ev.impact;
      else if (ev.sector && ev.sector === s.sector) chgPct += ev.impact * 0.35;
      else if (!ev.stock && !ev.sector) chgPct += ev.impact;
    });
    var newPrice = Math.max(5, roundMoney(s.price * (1 + chgPct), mode));
    return Object.assign({}, s, { prevPrice: s.price, price: newPrice, history: s.history.concat([newPrice]) });
  });

  var liquidations = [];
  var newPlayers = state.players.map(function (player) {
    var p = clonePlayer(player);
    p.liquidatedThisRound = false;

    // Dividends on long holdings, paid into realized P&L.
    Object.keys(p.portfolio).forEach(function (id) {
      var h = p.portfolio[id];
      if (h.shares > 0) {
        var st = findStock(newStocks, id);
        if (st) p.realized += roundMoney(h.shares * st.price * st.dividendYield, mode);
      }
    });

    // Margin call & liquidation (#3): if the loan now exceeds the maintenance
    // fraction of collateral, force-sell every long, repay the loan, and bill
    // any shortfall to the player's tabletop cash (a negative realized hit).
    var status = marginStatus(p, newStocks);
    if (status.call) {
      var proceeds = 0;
      Object.keys(p.portfolio).forEach(function (id) {
        var h = p.portfolio[id];
        var st = findStock(newStocks, id);
        if (h.shares > 0 && st) proceeds += h.shares * st.price;
      });
      p.portfolio = {};
      var repaid = Math.min(p.loan, proceeds);
      p.loan -= repaid;
      p.realized += proceeds - repaid;     // leftover after clearing the loan
      var shortfall = 0;
      if (p.loan > 0) { shortfall = p.loan; p.realized -= shortfall; p.loan = 0; }
      p.liquidatedThisRound = true;
      liquidations.push({ player: p.name, proceeds: proceeds, shortfall: shortfall });
    }
    return p;
  });

  var newNews = events.map(function (ev) {
    return {
      round: state.round + 1,
      headline: ev.headline,
      impact: ev.impact,
      stockId: ev.stock || ev.sector || 'MKT',
      positive: ev.impact > 0,
    };
  });

  var newState = Object.assign({}, state, {
    stocks: newStocks,
    players: newPlayers,
    round: state.round + 1,
    news: newNews.concat(state.news).slice(0, 25),
  });
  return { state: newState, events: newNews, liquidations: liquidations };
}

// ── Save / load (#1) ──────────────────────────────────────────────────────
function serialize(state) {
  return JSON.stringify({
    version: 1,
    gameName: state.gameName,
    mode: state.mode,
    round: state.round,
    stocks: state.stocks,
    players: state.players,
    news: state.news,
    transactions: state.transactions,
  });
}

function deserialize(json) {
  var data = typeof json === 'string' ? JSON.parse(json) : json;
  return {
    gameName: data.gameName || 'Monopoly Markets',
    mode: data.mode || 'integer',
    round: data.round || 1,
    stocks: data.stocks || [],
    players: data.players || [],
    news: data.news || [],
    transactions: data.transactions || [],
  };
}

// {game_name}_{ISO}.json with characters that are illegal in filenames
// (colons, slashes, spaces) replaced so it saves cleanly on every OS.
function saveFilename(gameName, date) {
  date = date || new Date();
  var iso = date.toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '-');
  var safeName = String(gameName || 'game').trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'game';
  return safeName + '_' + iso + '.json';
}

var ENGINE = {
  MAINTENANCE: MAINTENANCE,
  STOCKS_INIT: STOCKS_INIT,
  NEWS_DB: NEWS_DB,
  roundMoney: roundMoney,
  makeInitialHistory: makeInitialHistory,
  createStocks: createStocks,
  createPlayer: createPlayer,
  createInitialState: createInitialState,
  findStock: findStock,
  longValue: longValue,
  shortLiability: shortLiability,
  netWorth: netWorth,
  coverCost: coverCost,
  marginStatus: marginStatus,
  leaderboard: leaderboard,
  applyTrade: applyTrade,
  advanceRound: advanceRound,
  serialize: serialize,
  deserialize: deserialize,
  saveFilename: saveFilename,
};

// Works both as a CommonJS module (tests) and a browser global (bundled UI).
if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
if (typeof window !== 'undefined') window.GameEngine = ENGINE;
