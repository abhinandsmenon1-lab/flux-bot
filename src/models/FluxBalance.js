const mongoose = require('mongoose');

const fluxBalanceSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  balance: { type: Number, default: 0 }
});

fluxBalanceSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('FluxBalance', fluxBalanceSchema);
