const { SlashCommandBuilder } = require('discord.js');
const { getBalance, addBalance } = require('../utils/flux');
const { getConfig } = require('../config');
const { fluxLabel } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer Flux to another user')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('User to transfer Flux to').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount of Flux to transfer').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const config = getConfig(interaction.guild.id);

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: 'You cannot transfer Flux to yourself.', ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: 'You cannot transfer Flux to a bot.', ephemeral: true });
    }

    const senderBal = getBalance(interaction.guild.id, interaction.user.id);
    if (senderBal < amount) {
      return interaction.reply({ content: `You do not have enough ${fluxLabel(config)}. Your balance: **${senderBal}**.`, ephemeral: true });
    }

    addBalance(interaction.guild.id, interaction.user.id, -amount);
    const newTargetBal = addBalance(interaction.guild.id, target.id, amount);

    await interaction.reply({ content: `You transferred **${amount} ${fluxLabel(config)}** to <@${target.id}>.`, ephemeral: true });

    try {
      await target.send(`💸 <@${interaction.user.id}> sent you **${amount} ${fluxLabel(config)}** in **${interaction.guild.name}**. New balance: **${newTargetBal}**.`);
    } catch (e) {
      // user has DMs closed - ignore
    }
  }
};
