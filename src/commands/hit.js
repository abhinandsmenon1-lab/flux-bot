const { SlashCommandBuilder, UserSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { getConfig } = require('../config');
const { hasAnyRole, isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hit')
    .setDescription('Submit a hit request')
    .setDMPermission(false),

  async execute(interaction, ctx) {
    const config = getConfig(interaction.guild.id);

    if (!isAdmin(interaction.member) && !hasAnyRole(interaction.member, config.hitRoles)) {
      return interaction.reply({ content: 'You do not have permission to use `/hit`.', ephemeral: true });
    }

    if (config.hitChannels.length > 0 && !config.hitChannels.includes(interaction.channelId)) {
      return interaction.reply({ content: 'The `/hit` command cannot be used in this channel.', ephemeral: true });
    }

    const sessionKey = `${interaction.guild.id}:${interaction.user.id}`;
    ctx.hitSessions.set(sessionKey, {
      channelId: interaction.channelId,
      creatorId: interaction.user.id
    });

    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('hit_select_hitter')
        .setPlaceholder('Select the Hitter')
        .setMinValues(1)
        .setMaxValues(1)
    );

    await interaction.reply({
      content: '**Step 1/5:** Who is the Hitter?',
      components: [row],
      ephemeral: true
    });
  }
};
