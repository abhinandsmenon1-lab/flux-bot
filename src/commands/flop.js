const { SlashCommandBuilder, UserSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const Flop = require('../models/Flop');
const { getConfig } = require('../config');
const { hasAnyRole, isAdmin } = require('../utils/permissions');

// Renamed from /hit to /flop - identical functionality, internal custom IDs
// (hit_..., ticket_...) are unchanged since they're not user-facing.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('flop')
    .setDescription("Submit a flop request or count a user's flops")
    .addUserOption((option) =>
      option
        .setName('count')
        .setDescription('Show how many flops this user has registered as the Hitter')
        .setRequired(false)
    )
    .addAttachmentOption((option) =>
      option
        .setName('image')
        .setDescription('Optional image to include with the flop')
        .setRequired(false)
    )
    .setDMPermission(false),

  async execute(interaction, ctx) {
    const config = await getConfig(interaction.guild.id);

    const countUser = interaction.options.getUser('count');
    if (countUser) {
      const totalFlops = await Flop.countDocuments({ guildId: interaction.guild.id, hitterId: countUser.id });
      return interaction.reply({
        content: `🎯 **${countUser.tag}** has registered **${totalFlops}** flop${totalFlops === 1 ? '' : 's'} as the Hitter.`,
        allowedMentions: { users: [] }
      });
    }

    if (!isAdmin(interaction.member) && !hasAnyRole(interaction.member, config.hitRoles)) {
      return interaction.reply({ content: 'You do not have permission to use `/flop`.', ephemeral: true });
    }

    if (config.hitChannels.length > 0 && !config.hitChannels.includes(interaction.channelId)) {
      return interaction.reply({ content: 'The `/flop` command cannot be used in this channel.', ephemeral: true });
    }

    const image = interaction.options.getAttachment('image');
    if (image && !(image.contentType || '').startsWith('image/')) {
      return interaction.reply({ content: 'The `/flop` attachment must be an image (PNG, JPG, GIF, WEBP, etc.).', ephemeral: true });
    }

    const sessionKey = `${interaction.guild.id}:${interaction.user.id}`;
    ctx.hitSessions.set(sessionKey, {
      channelId: interaction.channelId,
      creatorId: interaction.user.id,
      imageUrl: image ? image.url : null
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
