const { SlashCommandBuilder } = require('discord.js');
const { getBalance } = require('../utils/flux');
const { getConfig } = require('../config');
const { fluxLabel } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your Flux balance')
    .setDMPermission(false),

  async execute(interaction) {
    const config = await getConfig(interaction.guild.id);
    const bal = await getBalance(interaction.guild.id, interaction.user.id);
    await interaction.reply({ content: `You have **${bal} ${fluxLabel(config)}**.`, ephemeral: true });
  }
};
