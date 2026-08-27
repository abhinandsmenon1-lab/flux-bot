const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  ActionRowBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the Flop / Flux bot (Administrator only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction, ctx) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only administrators can use this command.', ephemeral: true });
    }

    const sessionKey = `${interaction.guild.id}:${interaction.user.id}`;
    ctx.configSessions.set(sessionKey, {
      hitRoles: [],
      hitChannels: [],
      powerRoles: [],
      bankerRoles: [],
      fluxEmoji: '💠'
    });

    const row = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('cfg_hit_roles')
        .setPlaceholder('Select the minimum role(s) allowed to use /flop')
        .setMinValues(1)
        .setMaxValues(25)
    );

    await interaction.reply({
      content: '**Step 1/5:** Select the minimum role(s) that can use `/flop`.',
      components: [row],
      ephemeral: true
    });
  }
};
