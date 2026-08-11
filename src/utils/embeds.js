const { EmbedBuilder } = require('discord.js');

const STATUS_INFO = {
  pending: { color: 0xfee75c, dot: '🟡', label: 'Pending' },
  accepted: { color: 0x57f287, dot: '🟢', label: 'Accepted' },
  rejected: { color: 0xed4245, dot: '🔴', label: 'Rejected' }
};

function buildFlopEmbed(flop) {
  const info = STATUS_INFO[flop.status] || STATUS_INFO.pending;
  const embed = new EmbedBuilder()
    .setTitle('🎯 New Flop')
    .setColor(info.color)
    .addFields(
      { name: 'Hitter', value: `<@${flop.hitterId}>`, inline: true },
      { name: 'Middleman', value: `<@${flop.middlemanId}>`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Hit', value: flop.description || 'N/A' },
      { name: 'Milk?', value: flop.milk || 'N/A', inline: true },
      { name: 'Victim Joined?', value: flop.victimJoined || 'N/A', inline: true },
      { name: 'Hit Status', value: `${info.dot} ${info.label}` }
    )
    .setFooter({ text: `Flop ID: ${flop._id}` })
    .setTimestamp();

  if (flop.imageUrl) embed.setImage(flop.imageUrl);
  return embed;
}

function fluxLabel(config) {
  return `Flux${config.fluxEmoji || ''}`;
}

module.exports = { buildFlopEmbed, fluxLabel, STATUS_INFO };
