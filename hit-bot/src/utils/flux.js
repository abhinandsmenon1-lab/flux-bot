const FluxBalance = require('../models/FluxBalance');

async function getBalance(guildId, userId) {
  const doc = await FluxBalance.findOne({ guildId, userId });
  return doc ? doc.balance : 0;
}

async function setBalance(guildId, userId, balance) {
  await FluxBalance.findOneAndUpdate({ guildId, userId }, { balance }, { upsert: true });
}

// amount can be negative. Balance is clamped at 0 minimum. Not atomic - fine for
// admin/DM-driven flows (addflux, withdrawflux, transfer, flop accept/reject).
async function addBalance(guildId, userId, amount) {
  const current = await getBalance(guildId, userId);
  const updated = Math.max(0, current + amount);
  await setBalance(guildId, userId, updated);
  return updated;
}

// Atomically deducts `amount` only if the balance is currently sufficient.
// Returns the updated document, or null if funds were insufficient (no changes made).
// Used for game bets to prevent double-spend / race-condition exploits.
async function tryDeduct(guildId, userId, amount) {
  const doc = await FluxBalance.findOneAndUpdate(
    { guildId, userId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true }
  );
  return doc;
}

// Atomically adds `amount` (can be used for payouts). Creates the balance doc if needed.
async function increment(guildId, userId, amount) {
  const doc = await FluxBalance.findOneAndUpdate(
    { guildId, userId },
    { $inc: { balance: amount } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (doc.balance < 0) {
    doc.balance = 0;
    await doc.save();
  }
  return doc.balance;
}

async function getLeaderboard(guildId, limit = 10) {
  const rows = await FluxBalance.find({ guildId }).sort({ balance: -1 }).limit(limit);
  return rows.map((r) => ({ user_id: r.userId, balance: r.balance }));
}

module.exports = { getBalance, setBalance, addBalance, tryDeduct, increment, getLeaderboard };
