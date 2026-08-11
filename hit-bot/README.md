# Flop / Flux Discord Bot

A Discord bot combining a "Flop" approval workflow (formerly "Hit" — renamed,
same functionality) with a full **Flux** points economy: transfers, a bank,
casino games (Coinflip, Blackjack, Mines), and a server lottery.

Built with **Node.js**, **discord.js v14**, and **MongoDB** (via **Mongoose**).
Flux balances are stored permanently in MongoDB Atlas, so they survive
restarts, redeploys, and even moving the bot to a new host.

---

## 1. Commands

### Setup
- **`/config`** (Administrator only) — 5-step wizard:
  1. Minimum role(s) allowed to use `/flop`
  2. Channel(s) where `/flop` can be used
  3. Power role(s) — accept/reject flops, open tickets
  4. Banker role(s) — add/withdraw Flux
  5. The Flux emoji (shown after the word "Flux" everywhere)

### Flop (formerly `/hit` — same functionality, new name)
- **`/flop`** — only usable by allowed roles, in allowed channels. Walks
  through: Hitter → Middleman → description → Milk? → Victim joined?, then
  posts an embed (yellow = pending) with **Accept** / **Open Ticket** buttons,
  and DMs a copy to the Hitter.
  - **Accept** → embed turns green, Hitter gets **+100 Flux** and a DM.
  - **Open Ticket** → private channel with the Power-role member, Hitter, and
    Middleman, containing **Accept Hit** / **Reject & Close Ticket** buttons.
    Reject turns the embed red, deducts **-50 Flux** from the Hitter (DM
    sent), and the ticket auto-closes.

### Flux economy (anyone)
- **`/balance`** — check your Flux balance.
- **`/transfer user amount`** — send Flux to another user.
- **`/leaderboard`** — top Flux holders.

### Banker only
- **`/addflux user amount`**
- **`/withdrawflux user amount`**

### Prefix gambling commands (`.`)
In addition to the slash commands below, the three games can be started with
quick text commands using a `.` prefix — handy for fast betting without
opening the Discord command picker:

| Command | Meaning |
|---|---|
| `.bj <bet>` | Start Blackjack, e.g. `.bj 100` |
| `.mines <bet> [mines]` | Start Mines, e.g. `.mines 10` (defaults to 5 mines) or `.mines 10 8` |
| `.cf <bet> <h\|t>` | Start a Coinflip with your side pre-picked, e.g. `.cf 10 h` |
| `.cashout` | Cash out your active Mines game (once unlocked — see below) |

These require the **Message Content** privileged intent to be enabled for
your bot (see setup step 2 below) — without it, Discord won't deliver
message text to the bot and these commands won't work.

### Flux games — `/flux ...`
> Discord doesn't allow a command group name to be invoked bare once it has
> other subcommands, so each game uses an explicit `start`/`tutorial` (or
> `view`/`set`/`cancel`) subcommand rather than a literal `/flux coinflip`
> with no further word.

- **`/flux coinflip start bet:<amount>`** / **`/flux coinflip tutorial`**
  (or `.cf <bet> <h|t>` to start with your side pre-picked)
  Minimum bet **50 Flux**. A second player clicks **Join**, sides are picked
  (or auto-assigned the opposite of whatever the host locked in via `.cf`),
  then both press **Bet** — Flux is deducted immediately and a true 50/50
  flip decides the winner, who takes the pot.

- **`/flux bj start bet:<amount>`** / **`/flux bj tutorial`** (or `.bj <bet>`)
  Minimum bet **50 Flux**. Standard Blackjack vs. the dealer with Hit / Stand
  / Double Down buttons. Natural blackjack pays 2.5x, a normal win pays 2x, a
  push returns your bet.

- **`/flux mine start bet:<amount> [mines:<count>]`** / **`/flux mine tutorial`**
  (or `.mines <bet> [mines]`)
  Minimum bet **50 Flux**. Full **5x5 grid (25 tiles)**, default **5 mines**
  (1-24 configurable). Each safe tile raises your multiplier. Because the
  full grid fills every available button slot, **Cash Out doesn't have a
  button** — it unlocks only after you've revealed **10 safe tiles**, and is
  then collected by typing **`.cashout`**. Hit a mine before cashing out and
  you lose the whole bet.

- **`/flux lottery view`** — shows the active lottery (prize pool, time left,
  participants, min/max entry) with an **Enter Lottery** button. Clicking it
  opens a modal asking how much Flux to contribute (min-max are enforced,
  and each unique participant always has an **equal chance of winning**
  regardless of how much they put in — a bigger contribution only grows the
  jackpot).
- **`/flux lottery set`** (Administrator only) — starting prize, draw
  duration (minutes), min entry, max entry (hard cap **20,000 Flux**).
  Replies "Lottery Created Successfully".
- **`/flux lottery cancel`** (Administrator only) — refunds every participant
  and cancels the draw.

  Lotteries are scheduled with a timer and also **persisted in MongoDB**, so
  if the bot restarts before the draw time, it reschedules (or immediately
  runs) the draw on startup instead of losing it.

### Presence
The bot sets its status to **Online**, activity **"Watching the Flux Economy"**.

---

## 2. Create the Discord Application

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** tab → **Reset Token** → copy it. This is your `DISCORD_TOKEN`. Keep it secret.
3. **General Information** tab → copy the **Application ID** → this is your `CLIENT_ID`.
4. **Bot** tab → **Privileged Gateway Intents** → turn on **Message Content Intent**.
   This is required for the `.` prefix gambling commands to be able to read
   message text. (Slash commands, buttons, and modals don't need it, but the
   prefix commands do.)
5. **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Manage Channels`,
     `Read Message History`, `View Channels`, `Use Application Commands`
   - Open the generated URL and invite the bot to your server.

---

## 3. Set up MongoDB Atlas

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user (username + password).
3. Under **Network Access**, allow access from anywhere (`0.0.0.0/0`) so
   Railway can connect, or add Railway's egress IPs if you prefer to restrict it.
4. Under **Database → Connect → Drivers**, copy the connection string, e.g.:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/hitbot?retryWrites=true&w=majority
   ```
   This is your `MONGODB_URI`. Make sure it includes a database name (e.g. `/hitbot`).

---

## 4. Local setup (optional, for testing)

```bash
npm install
cp .env.example .env
# fill in DISCORD_TOKEN, CLIENT_ID, MONGODB_URI, and (optionally) GUILD_ID

npm run deploy   # registers the slash commands with Discord
npm start        # starts the bot
```

`GUILD_ID` registers commands instantly to one test server; leaving it blank
registers globally (can take up to an hour).

---

## 5. Deploying on Railway

1. Push this project to a **GitHub repository**.
2. In [Railway](https://railway.app): **New Project → Deploy from GitHub repo**.
3. Under **Variables**, add:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `MONGODB_URI`
   - `GUILD_ID` (optional)
4. Railway runs `npm install` then `npm start` automatically.
5. **Register the slash commands once**: run `npm run deploy` locally (or via
   a one-off Railway shell command: `node src/deployCommands.js`). Re-run it
   whenever you add or change a command's definition.
6. In your server, run `/config` as an administrator to finish setup.

Because Flux balances now live in MongoDB, they persist across redeploys,
Railway account changes, or moving to a different host — no volume needed.

---

## 6. Project structure

```
src/
  index.js               # bot entry point (connects Mongo, sets presence, restores lotteries)
  deployCommands.js      # registers slash commands with Discord
  db.js                  # Mongoose connection
  config.js              # per-guild config get/save helpers
  models/
    GuildConfig.js
    FluxBalance.js
    Flop.js               # flop records (formerly "Hit")
    Lottery.js
  commands/
    config.js              # /config
    flop.js                 # /flop (renamed from /hit)
    balance.js              # /balance
    transfer.js             # /transfer
    leaderboard.js          # /leaderboard
    addflux.js              # /addflux
    withdrawflux.js         # /withdrawflux
    flux.js                  # /flux coinflip | bj | mine | lottery
  games/
    coinflip.js
    blackjack.js
    mines.js
    lottery.js
  handlers/
    interactionCreate.js  # routes all button/select/modal interactions
    messageCreate.js      # "." prefix gambling commands (.bj, .mines, .cf, .cashout)
  utils/
    embeds.js
    flux.js                 # balance read/write helpers (atomic ops for games)
    permissions.js
```

---

## 7. Troubleshooting

- **Slash commands don't show up** — run `npm run deploy`; global registration
  can take up to an hour, guild-specific (`GUILD_ID`) is instant.
- **"You do not have permission..."** — re-run `/config` and confirm the
  right roles were picked at each step.
- **Buttons say "session has expired"** — `/config` and `/flop` flows time
  out after 10 minutes of inactivity; just start the command again.
- **Bot won't start / crashes on boot** — almost always a bad or missing
  `MONGODB_URI`. Check the connection string, database user password, and
  that your IP allowlist includes Railway.
- **Lottery didn't draw while the bot was offline** — it will run the draw
  immediately on the next startup once it reconnects, rather than being lost.
