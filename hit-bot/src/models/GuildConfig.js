const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  hitRoles: { type: [String], default: [] }, // roles allowed to use /flop
  hitChannels: { type: [String], default: [] }, // channels where /flop can be used
  powerRoles: { type: [String], default: [] }, // can accept/reject flops
  bankerRoles: { type: [String], default: [] }, // can add/withdraw flux
  fluxEmoji: { type: String, default: '💠' }
});

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
