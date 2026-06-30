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
| **Borrow to buy** | Pay later — the cost becomes a loan (no cash now) and the shares are its collateral |
| **REPAY LOAN** | Pay a loan back from tabletop cash (per player, on their tab) |

**Dividends** are paid into each player's P&L every round, equal to shares held × the stock's current price × its yield. Short positions do not pay or receive dividends.

**Margin call:** a loan is force-liquidated on the next round if it exceeds **80%** of its collateral's value. Selling all the collateral repays the loan; any remaining debt is paid from the player's tabletop Monopoly cash. Each player's tab shows their loan, collateral and ratio.

---

## Stocks Reference

| Ticker | Company | Sector | Yield / Round | Volatility |
|--------|---------|--------|-----------|-----------|
| BPI | Boardwalk Properties | Real Estate | 3.0% | Medium |
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

## Multiplayer (cloud)

Players join one game from their own phones, watch the market live, and **queue
orders the host approves** — nothing is filled automatically. It uses a
host-authoritative model on [PartyKit](https://www.partykit.io/) (Cloudflare
Durable Objects): the server holds the only copy of the game state and runs the
same `src/engine.js` rules; clients only *propose*.

**The flow** (Kahoot-style — no need to pre-enter players)

1. On one screen (laptop/tablet), click **📡 HOST ONLINE** — a lobby opens with a big **QR code** and a 4-character room code.
2. Players **scan the QR** on their phones (or open the game URL and type the code), enter **their own name**, and land in the lobby. The host sees everyone arrive.
3. The host clicks **START GAME**.
4. Players get a phone-friendly view — market, news, leaderboard, their own positions/P&L — and **queue** buy / sell / short / cover / repay orders. Nothing fills automatically.
5. The host sees a **Pending Approvals** panel and approves or rejects each one; approved orders fill at the current price. The host drives **Advance Round**.

A dropped phone that reconnects rejoins its own player (a stable per-device id is kept in `localStorage`), so it won't spawn a duplicate.

**How it's built**

- `src/room.js` — room reducer (dynamic join / start / queue / approve / reject / advance), pure and unit-tested; orders are server-stamped with the member's player (anti-spoof)
- `party/server.js` — PartyKit server: one Durable Object per room, wraps the reducer, persists across hibernation, sends each connection its own view
- `src/net.js` — the client's dependency-free reconnecting WebSocket
- `src/qrcode.js` — vendored MIT QR encoder (no runtime dependency)
- Lobby / host / phone views all live in the same `index.html` (no separate build)
- **Concurrency is safe by construction:** each room is single-threaded and the server is the only writer

### Setting it up

Requires **Node 18+** (PartyKit's CLI needs it).

```bash
npm install
npm run party:dev           # server + client at http://127.0.0.1:1999
# deploy to the cloud (one-time GitHub login, free tier):
npx partykit login
npm run party:deploy        # → https://monopoly-markets.<your-user>.partykit.dev
```

**Pointing the client at the server.** The client auto-uses its own origin, so
the simplest path is to serve `index.html` from the same place as the server
(PartyKit can host static assets). Otherwise open the client with
`?host=<your-app>.<user>.partykit.dev` (or set `window.PARTYKIT_HOST`); it
defaults to `127.0.0.1:1999` for local dev.

---

## Future Work

- **Offline LAN multiplayer (no internet).** Same host-authoritative model, but
  the host runs a small local `server.js` (Node + WebSocket) on one machine and
  phones connect over the same Wi-Fi at `http://<host-ip>:<port>`. Keeps data
  private and needs no third-party account; state is persisted to a JSON file on
  the host so games survive restarts. Single-device pass-and-play still works by
  just opening `index.html` with no server.
- Round summary modal
- More stocks / news events
- Sound effects

---

## License

MIT — see `LICENSE` file. Free to use, modify, and distribute.

---

## Contributing

Pull requests welcome — see **Future Work** above for good starting points.
