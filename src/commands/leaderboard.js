const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getLeaderboard, getLeaderboardCount } = require('../utils/flux');
const { getConfig } = require('../config');
const { fluxLabel } = require('../utils/embeds');

const PAGE_SIZE = 10;

function buildLeaderboardEmbed(config, rows, page, totalPages) {
  const startRank = page * PAGE_SIZE + 1;
  const desc = rows.map((r, i) => `**${startRank + i}.** <@${r.user_id}> — ${r.balance} ${fluxLabel(config)}`).join('\n');

  return new EmbedBuilder()
    .setTitle(`🏆 ${fluxLabel(config)} Leaderboard`)
    .setColor(0xfee75c)
    .setDescription(desc || 'No Flux holders on this page.')
    .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
}

function buildButtons(page, totalPages, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lb_prev_${userId}_${page}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`lb_next_${userId}_${page}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages - 1)
  );
}

async function getPage(guildId, page) {
  const [rows, total] = await Promise.all([
    getLeaderboard(guildId, PAGE_SIZE, page * PAGE_SIZE),
    getLeaderboardCount(guildId)
  ]);
  return { rows, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the Flux leaderboard, page by page')
    .setDMPermission(false),

  PAGE_SIZE,
  async getPage(guildId, page) {
    return getPage(guildId, page);
  },
  buildLeaderboardEmbed,
  buildButtons,

  async execute(interaction) {
    const config = await getConfig(interaction.guild.id);
    const { rows, total, totalPages } = await getPage(interaction.guild.id, 0);

    if (total === 0) {
      return interaction.reply({ content: 'No Flux holders recorded yet.', ephemeral: true });
    }

    const embed = buildLeaderboardEmbed(config, rows, 0, totalPages);
    const components = totalPages > 1 ? [buildButtons(0, totalPages, interaction.user.id)] : [];
    await interaction.reply({ embeds: [embed], components });
  }
};
