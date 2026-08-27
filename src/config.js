const GuildConfig = require('./models/GuildConfig');

async function getConfig(guildId) {
  let doc = await GuildConfig.findOne({ guildId });
  if (!doc) {
    doc = await GuildConfig.create({ guildId });
  }
  return {
    guildId,
    hitRoles: doc.hitRoles || [],
    hitChannels: doc.hitChannels || [],
    powerRoles: doc.powerRoles || [],
    bankerRoles: doc.bankerRoles || [],
    fluxEmoji: doc.fluxEmoji || '💠'
  };
}

async function saveConfig(guildId, data) {
  await GuildConfig.findOneAndUpdate(
    { guildId },
    {
      guildId,
      hitRoles: data.hitRoles || [],
      hitChannels: data.hitChannels || [],
      powerRoles: data.powerRoles || [],
      bankerRoles: data.bankerRoles || [],
      fluxEmoji: data.fluxEmoji || '💠'
    },
    { upsert: true, new: true }
  );
}

module.exports = { getConfig, saveConfig };
