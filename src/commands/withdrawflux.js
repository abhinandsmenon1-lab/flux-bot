const { SlashCommandBuilder } = require('discord.js');
const { getConfig } = require('../config');
const { addBalance, getBalance } = require('../utils/flux');
const { hasAnyRole, isAdmin } = require('../utils/permissions');
const { fluxLabel } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('withdrawflux')
    .setDescription('Withdraw Flux from a user (Banker only)')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('User to withdraw Flux from').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount of Flux to withdraw').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    const config = await getConfig(interaction.guild.id);
    if (!isAdmin(interaction.member) && !hasAnyRole(interaction.member, config.bankerRoles)) {
      return interaction.reply({ content: 'Only the Banker role can use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const current = await getBalance(interaction.guild.id, target.id);
    const actual = Math.min(current, amount);
    const newBal = await addBalance(interaction.guild.id, target.id, -actual);

    await interaction.reply({ content: `Withdrew **${actual} ${fluxLabel(config)}** from <@${target.id}>. New balance: **${newBal}**.` });

    try {
      await target.send(`🏦 **${actual} ${fluxLabel(config)}** was withdrawn from your balance by the bank in **${interaction.guild.name}**. New balance: **${newBal}**.`);
    } catch (e) {
      // DMs closed - ignore
    }
  }
};
