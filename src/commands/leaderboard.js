const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../utils/flux');
const { getConfig } = require('../config');
const { fluxLabel } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the Flux leaderboard')
    .setDMPermission(false),

  async execute(interaction) {
    const config = getConfig(interaction.guild.id);
    const rows = getLeaderboard(interaction.guild.id, 10);

    if (rows.length === 0) {
      return interaction.reply({ content: 'No Flux balances recorded yet.', ephemeral: true });
    }

    const desc = rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — ${r.balance} ${fluxLabel(config)}`).join('\n');
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${fluxLabel(config)} Leaderboard`)
      .setColor(0xfee75c)
      .setDescription(desc);

    await interaction.reply({ embeds: [embed] });
  }
};
