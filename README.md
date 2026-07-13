# Hit / Flux Discord Bot

A Discord bot for running "hit" requests with an approval workflow (accept / open a
private ticket / reject) and a server-wide "Flux" points economy.

Built with **Node.js**, **discord.js v14**, and **SQLite** (via `better-sqlite3`).

---

## 1. What it does

- **`/config`** (Administrator only) — walks you through a 5-step setup:
  1. Minimum role(s) allowed to use `/hit`
  2. Channel(s) where `/hit` can be used
  3. Power role(s) — can accept / reject hits and open tickets
  4. Banker role(s) — can add/withdraw Flux
  5. The Flux emoji (shown after the word "Flux" everywhere in the bot)

- **`/hit`** — only usable by allowed roles, in allowed channels. Walks the user
  through: Hitter → Middleman → Hit description → Milk? (Yes/No) → Victim joined?
  (Yes/No), then posts an embed (yellow = pending) with **Accept** and **Open
  Ticket** buttons. A copy is also DMed to the Hitter.
  - **Accept** → embed turns green, status becomes Accepted, buttons disappear,
    Hitter gets **+100 Flux** and a DM.
  - **Open Ticket** → creates a private channel with the clicking Power-role
    member, the Hitter, and the Middleman. Inside: **Accept Hit** / **Reject &
    Close Ticket** buttons (Power role only).
    - Accept → same as above, then the ticket auto-closes.
    - Reject → embed turns red, status becomes Rejected, Hitter loses **-50
      Flux** (DM sent), ticket auto-closes.

- **`/balance`** — anyone can check their own Flux balance.
- **`/transfer`** — anyone can send Flux to another user.
- **`/leaderboard`** — shows the top Flux holders.
- **`/addflux`** / **`/withdrawflux`** — Banker role only.

All Flux transactions that affect a user DM that user with the details.

---

## 2. Create the Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Under **Bot**, click **Reset Token** and copy it — this is your `DISCORD_TOKEN`.
   Keep it secret.
3. Under **General Information**, copy the **Application ID** — this is your `CLIENT_ID`.
4. Under **Bot**, you do **not** need to enable any privileged intents (this bot only
   uses slash commands, buttons, and modals).
5. Under **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Manage Channels`,
     `Read Message History`, `View Channels`, `Use Application Commands`
   - Open the generated URL and invite the bot to your server.

---

## 3. Local setup (optional, for testing)

```bash
npm install
cp .env.example .env
# fill in DISCORD_TOKEN, CLIENT_ID, and (optionally) GUILD_ID in .env

npm run deploy   # registers the slash commands with Discord
npm start        # starts the bot
```

Setting `GUILD_ID` registers commands instantly to a single test server. Leaving
it blank registers them globally (can take up to an hour to show up everywhere).

---

## 4. Deploying on Railway

1. Push this project to a **GitHub repository**.
2. In [Railway](https://railway.app), click **New Project → Deploy from GitHub repo**
   and select your repo.
3. Under the service's **Variables** tab, add:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID` (optional, for instant command updates on one server)
4. Railway will run `npm install` and then `npm start` automatically (from
   `package.json`).
5. **Register the slash commands once** before or after your first deploy. Easiest
   way: run it locally —
   ```bash
   npm run deploy
   ```
   (or open a one-off shell/command on Railway and run `node src/deployCommands.js`).
   You only need to re-run this when you add/change a command's definition.
6. Once the service is running, go to your Discord server and run `/config` as an
   administrator to set everything up.

> **Note on the database:** this bot stores everything in a local SQLite file
> (`data.sqlite`), which is created automatically. On Railway's default
> filesystem this file persists as long as the service isn't redeployed from
> scratch; for guaranteed persistence across redeploys, attach a Railway
> **Volume** to the service and mount it at the project root.

---

## 5. Project structure

```
src/
  index.js               # bot entry point
  deployCommands.js      # registers slash commands with Discord
  database.js            # SQLite connection + schema
  config.js              # per-guild config get/save helpers
  commands/               
    config.js             # /config
    hit.js                 # /hit
    balance.js             # /balance
    transfer.js            # /transfer
    leaderboard.js         # /leaderboard
    addflux.js             # /addflux
    withdrawflux.js        # /withdrawflux
  handlers/
    interactionCreate.js  # routes all button/select/modal interactions
  utils/
    embeds.js              # embed builders + flux label helper
    flux.js                 # balance read/write helpers
    permissions.js          # role/permission checks
```

---

## 6. Troubleshooting

- **Slash commands don't show up** — make sure you ran `npm run deploy`, and if
  you registered globally, wait up to an hour (guild-specific registration via
  `GUILD_ID` is instant).
- **"You do not have permission..." errors** — run `/config` again and make sure
  the right roles were selected in each step.
- **Buttons say "session has expired"** — the multi-step `/config` or `/hit` flow
  times out after 10 minutes of inactivity; just start the command again.
- **`better-sqlite3` fails to build on deploy** — this is a native module; Railway's
  build system (Nixpacks) normally compiles it automatically for Node projects. If
  it fails, check the build logs for missing build tools and retry the deploy.
