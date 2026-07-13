const db = require('./database');

function getConfig(guildId) {
  let row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT INTO guild_config (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  }
  return {
    guildId,
    hitRoles: JSON.parse(row.hit_roles || '[]'),
    hitChannels: JSON.parse(row.hit_channels || '[]'),
    powerRoles: JSON.parse(row.power_roles || '[]'),
    bankerRoles: JSON.parse(row.banker_roles || '[]'),
    fluxEmoji: row.flux_emoji || '💠'
  };
}

function saveConfig(guildId, data) {
  db.prepare(`
    INSERT INTO guild_config (guild_id, hit_roles, hit_channels, power_roles, banker_roles, flux_emoji)
    VALUES (@guildId, @hitRoles, @hitChannels, @powerRoles, @bankerRoles, @fluxEmoji)
    ON CONFLICT(guild_id) DO UPDATE SET
      hit_roles = excluded.hit_roles,
      hit_channels = excluded.hit_channels,
      power_roles = excluded.power_roles,
      banker_roles = excluded.banker_roles,
      flux_emoji = excluded.flux_emoji
  `).run({
    guildId,
    hitRoles: JSON.stringify(data.hitRoles || []),
    hitChannels: JSON.stringify(data.hitChannels || []),
    powerRoles: JSON.stringify(data.powerRoles || []),
    bankerRoles: JSON.stringify(data.bankerRoles || []),
    fluxEmoji: data.fluxEmoji || '💠'
  });
}

module.exports = { getConfig, saveConfig };
