const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  hit_roles TEXT DEFAULT '[]',
  hit_channels TEXT DEFAULT '[]',
  power_roles TEXT DEFAULT '[]',
  banker_roles TEXT DEFAULT '[]',
  flux_emoji TEXT DEFAULT '💠'
);

CREATE TABLE IF NOT EXISTS flux_balances (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  balance INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  message_id TEXT,
  channel_id TEXT,
  hitter_id TEXT,
  middleman_id TEXT,
  creator_id TEXT,
  description TEXT,
  milk TEXT,
  victim_joined TEXT,
  status TEXT DEFAULT 'pending',
  ticket_channel_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
