const { EmbedBuilder } = require('discord.js');

const STATUS_INFO = {
  pending: { color: 0xfee75c, dot: '🟡', label: 'Pending' },
  accepted: { color: 0x57f287, dot: '🟢', label: 'Accepted' },
  rejected: { color: 0xed4245, dot: '🔴', label: 'Rejected' }
};

function buildHitEmbed(hit) {
  const info = STATUS_INFO[hit.status] || STATUS_INFO.pending;
  return new EmbedBuilder()
    .setTitle('🎯 New Hit')
    .setColor(info.color)
    .addFields(
      { name: 'Hitter', value: `<@${hit.hitter_id}>`, inline: true },
      { name: 'Middleman', value: `<@${hit.middleman_id}>`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Hit', value: hit.description || 'N/A' },
      { name: 'Milk?', value: hit.milk || 'N/A', inline: true },
      { name: 'Victim Joined?', value: hit.victim_joined || 'N/A', inline: true },
      { name: 'Hit Status', value: `${info.dot} ${info.label}` }
    )
    .setFooter({ text: `Hit ID: ${hit.id}` })
    .setTimestamp();
}

function fluxLabel(config) {
  return `Flux${config.fluxEmoji || ''}`;
}

module.exports = { buildHitEmbed, fluxLabel, STATUS_INFO };
