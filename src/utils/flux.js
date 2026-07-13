const db = require('../database');

function getBalance(guildId, userId) {
  const row = db.prepare('SELECT balance FROM flux_balances WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return row ? row.balance : 0;
}

function setBalance(guildId, userId, balance) {
  db.prepare(`
    INSERT INTO flux_balances (guild_id, user_id, balance) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET balance = excluded.balance
  `).run(guildId, userId, balance);
}

// amount can be negative. Balance is clamped at 0 minimum.
function addBalance(guildId, userId, amount) {
  const current = getBalance(guildId, userId);
  const updated = Math.max(0, current + amount);
  setBalance(guildId, userId, updated);
  return updated;
}

function getLeaderboard(guildId, limit = 10) {
  return db.prepare('SELECT user_id, balance FROM flux_balances WHERE guild_id = ? ORDER BY balance DESC LIMIT ?').all(guildId, limit);
}

module.exports = { getBalance, setBalance, addBalance, getLeaderboard };
