# 📈 Monopoly Markets

A Bloomberg-style stock trading module for Monopoly. Players trade fictional stocks using their Monopoly money, adding a full financial layer to the board game.

> **Open source. No install. No server. Just open `index.html`.**

> **Note on cash:** the app does **not** track a spendable balance. Players pay and
> collect with their **real tabletop Monopoly money** — the app tracks positions,
> profit/loss, loans and a leaderboard, and tells you what to collect or pay.

---

## Features

- **8 fictional stocks** — Boardwalk Properties (BPI), Community Chest Financial (CCF), Railroad Continental (RAIL), Utility Monopoly Corp (UTIL), Park Place Ventures (PPV), Mayfair Capital Group (MCG), Go Free Holdings (GOFH), Chance & Associates (CHCA)
- **Full trading** — Buy, Sell, Short Sell, Cover, Borrow-to-buy, Repay
- **Live leaderboard** — players ranked by net worth (realized P&L + holdings − shorts − loans)
- **Margin calls & liquidation** — borrowed shares are collateral; a loan above 80% of its collateral value is force-sold on the next round, with any shortfall billed to the player
- **Save & load** — export the whole game to a `{game-name}_{date}.json` file and load it back later
- **Configurable rounding** — keep cents, round to whole dollars (default), or round to the nearest $5 so amounts are payable with real notes
- **Dividend payouts** — paid each round from holdings
- **Random news events** — 30+ Monopoly-themed headlines that move stocks each round
- **Live sparkline charts** — per-stock price history
- **Multi-player** — 2–8 players, each with their own portfolio + margin view
- **Transaction log** — full history of all trades
- **Bloomberg terminal aesthetic** — dark, data-dense, monospace

---

## How to Play

1. Open `index.html` in any modern browser — no server needed.
2. Name the game, pick a **rounding mode**, set the number of players and their names. (Or **load a saved game**.)
3. Click **LAUNCH MARKET**.
4. Trade between Monopoly turns — buy, sell, short, cover, or borrow-to-buy. Players move their own tabletop cash to match.
5. Click **ADVANCE ROUND** after each Monopoly round to:
   - Trigger 1–2 random market news events
   - Update all stock prices
   - Pay dividends into each player's P&L
   - Run margin calls / liquidate any under-collateralised loans
6. Click **💾 SAVE** any time to download the game state.

---

## Trading Guide

| Action | Description |
|--------|-------------|
| **BUY** | Buy shares at the current price (pay from your tabletop cash) |
| **SELL** | Sell shares; proceeds first pay down any loan, the rest is your profit |
| **SHORT** | Borrow and sell shares now; profit if the price falls |
| **COVER** | Buy back shorted shares to close the position (the panel shows the cover cost) |
| **Borrow to buy** | Buy on credit — the cost becomes a loan and the shares are its collateral |
| **REPAY LOAN** | Pay a loan back from tabletop cash (per player, on their tab) |

**Dividends** are paid each round based on shares held × the stock's annual yield (prorated per round). Short positions do not pay or receive dividends.

**Margin call:** a loan is force-liquidated on the next round if it exceeds **80%** of its collateral's value. Selling all the collateral repays the loan; any remaining debt is paid from the player's tabletop Monopoly cash. Each player's tab shows their loan, collateral and ratio.

---

## Stocks Reference

| Ticker | Company | Sector | Div. Yield | Volatility |
|--------|---------|--------|-----------|-----------|
| BPI | Boardwalk Properties Inc | Real Estate | 3.0% | Medium |
| CCF | Community Chest Financial | Finance | 5.0% | Medium-High |
| RAIL | Railroad Continental | Transport | 2.0% | Low-Medium |
| UTIL | Utility Monopoly Corp | Utilities | 4.0% | Low |
| PPV | Park Place Ventures | Real Estate | 2.5% | Medium-High |
| MCG | Mayfair Capital Group | Finance | 1.5% | High |
| GOFH | Go Free Holdings | Leisure | 6.0% | High |
| CHCA | Chance & Associates | Diversified | 3.5% | Very High |

---

## Technical

`index.html` ships as a **single self-contained bundle** (fonts + runtime + app
inlined) so it runs offline with no install or server. The app is **not** edited
inside that bundle, though — the editable sources live in `src/` and are spliced
back in by a build step:

```
src/engine.js     # all game rules — pure, DOM-free, fully unit-tested
src/component.js  # UI shell: holds state, calls the engine, maps it to bindings
src/markup.html   # the on-screen markup (DC-framework {{ }} bindings)
build.js          # splices src/ back into index.html (re-bundles)
tests/            # zero-dependency Node tests for the engine
```

### Development

```bash
npm test     # run the engine test suite (node tests/engine.test.js)
npm run build # rebuild index.html from src/
```

The economic rules (trades, dividends, margin calls/liquidation, rounding, net
worth, save/load) all live in `src/engine.js` and are covered by tests — change
rules there, not in the bundle.

- Works offline after first load
- Tested in Chrome, Firefox, Safari, Edge

---

## License

MIT — see `LICENSE` file. Free to use, modify, and distribute.

---

## Contributing

Pull requests welcome! Ideas:
- Queued/asynchronous multi-device trading
- Round summary modal
- More stocks / news events
- Sound effects
