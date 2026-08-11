const { SlashCommandBuilder } = require('discord.js');
const { getConfig } = require('../config');
const { addBalance } = require('../utils/flux');
const { hasAnyRole, isAdmin } = require('../utils/permissions');
const { fluxLabel } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addflux')
    .setDescription('Add Flux to a user (Banker only)')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('User to add Flux to').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount of Flux to add').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    const config = await getConfig(interaction.guild.id);
    if (!isAdmin(interaction.member) && !hasAnyRole(interaction.member, config.bankerRoles)) {
      return interaction.reply({ content: 'Only the Banker role can use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const newBal = await addBalance(interaction.guild.id, target.id, amount);

    await interaction.reply({ content: `Added **${amount} ${fluxLabel(config)}** to <@${target.id}>. New balance: **${newBal}**.` });

    try {
      await target.send(`💰 You received **${amount} ${fluxLabel(config)}** from the bank in **${interaction.guild.name}**. New balance: **${newBal}**.`);
    } catch (e) {
      // DMs closed - ignore
    }
  }
};
