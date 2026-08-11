const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const Lottery = require('../models/Lottery');
const { getBalance, tryDeduct, increment } = require('../utils/flux');
const { getConfig } = require('../config');
const { fluxLabel } = require('../utils/embeds');

const MAX_ENTRY_CAP = 20000;
const timers = new Map(); // guildId -> Timeout

function buildViewEmbed(lottery, fluxTag) {
  const remainingMs = lottery.drawAt.getTime() - Date.now();
  const timeText = remainingMs > 0 ? `<t:${Math.floor(lottery.drawAt.getTime() / 1000)}:R>` : 'Drawing soon...';

  return new EmbedBuilder()
    .setTitle('🎟️ Flux Lottery')
    .setColor(0xfee75c)
    .addFields(
      { name: 'Current Prize Pool', value: `${lottery.prizePool} ${fluxTag}`, inline: true },
      { name: 'Time Remaining', value: timeText, inline: true },
      { name: 'Participants', value: `${lottery.participants.length}`, inline: true },
      { name: 'Minimum Entry', value: `${lottery.minEntry} ${fluxTag}`, inline: true },
      { name: 'Maximum Entry', value: `${lottery.maxEntry} ${fluxTag}`, inline: true }
    )
    .setFooter({ text: 'Contributing more Flux only grows the jackpot — every participant has an equal chance of winning.' });
}

async function set(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Only administrators can use this command.', ephemeral: true });
  }

  const startingPrize = interaction.options.getInteger('starting_prize');
  const durationMinutes = interaction.options.getInteger('duration_minutes');
  const minEntry = interaction.options.getInteger('min_entry');
  const maxEntryInput = interaction.options.getInteger('max_entry');

  if (maxEntryInput > MAX_ENTRY_CAP) {
    return interaction.reply({ content: `Maximum entry cannot exceed **${MAX_ENTRY_CAP} Flux**.`, ephemeral: true });
  }
  if (minEntry > maxEntryInput) {
    return interaction.reply({ content: 'Minimum entry cannot be greater than maximum entry.', ephemeral: true });
  }

  const existing = await Lottery.findOne({ guildId: interaction.guild.id, active: true });
  if (existing) {
    return interaction.reply({ content: 'There is already an active lottery in this server. Cancel it first with `/flux lottery cancel`.', ephemeral: true });
  }

  const drawAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  await Lottery.findOneAndUpdate(
    { guildId: interaction.guild.id },
    {
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
      startingPrize,
      prizePool: startingPrize,
      minEntry,
      maxEntry: maxEntryInput,
      drawAt,
      participants: [],
      active: true
    },
    { upsert: true }
  );

  scheduleDraw(interaction.client, interaction.guild.id, durationMinutes * 60 * 1000);

  await interaction.reply('Lottery Created Successfully 🎉');
}

async function view(interaction) {
  const config = await getConfig(interaction.guild.id);
  const lottery = await Lottery.findOne({ guildId: interaction.guild.id, active: true });

  if (!lottery) {
    return interaction.reply({ content: 'There is no active lottery right now. An administrator can start one with `/flux lottery set`.', ephemeral: true });
  }

  const embed = buildViewEmbed(lottery, fluxLabel(config));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lot_enter').setLabel('Enter Lottery').setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleEnterButton(interaction) {
  const lottery = await Lottery.findOne({ guildId: interaction.guild.id, active: true });
  if (!lottery) {
    return interaction.reply({ content: 'There is no active lottery right now.', ephemeral: true });
  }

  const modal = new ModalBuilder().setCustomId('lot_enter_modal').setTitle('Enter the Lottery');
  const input = new TextInputBuilder()
    .setCustomId('lot_amount_input')
    .setLabel(`How much Flux do you want to contribute? (${lottery.minEntry}-${lottery.maxEntry})`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleEnterModal(interaction) {
  const config = await getConfig(interaction.guild.id);
  const lottery = await Lottery.findOne({ guildId: interaction.guild.id, active: true });
  if (!lottery) {
    return interaction.reply({ content: 'This lottery is no longer active.', ephemeral: true });
  }

  const raw = interaction.fields.getTextInputValue('lot_amount_input').trim();
  const amount = parseInt(raw, 10);

  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: 'Please enter a valid whole number of Flux.', ephemeral: true });
  }
  if (amount < lottery.minEntry || amount > lottery.maxEntry) {
    return interaction.reply({ content: `Your entry must be between **${lottery.minEntry}** and **${lottery.maxEntry}** ${fluxLabel(config)}.`, ephemeral: true });
  }

  const balance = await getBalance(interaction.guild.id, interaction.user.id);
  if (balance < amount) {
    return interaction.reply({ content: `You don't have enough Flux. Your balance: **${balance}**.`, ephemeral: true });
  }

  const deducted = await tryDeduct(interaction.guild.id, interaction.user.id, amount);
  if (!deducted) {
    return interaction.reply({ content: 'You do not have enough Flux for that entry.', ephemeral: true });
  }

  const existingEntry = lottery.participants.find((p) => p.userId === interaction.user.id);
  if (existingEntry) {
    existingEntry.amount += amount;
  } else {
    lottery.participants.push({ userId: interaction.user.id, amount });
  }
  lottery.prizePool += amount;
  await lottery.save();

  await interaction.reply({
    content: `✅ You entered the lottery with **${amount} ${fluxLabel(config)}**. Prize pool is now **${lottery.prizePool} ${fluxLabel(config)}**. Remember: every participant has an equal chance of winning, regardless of how much they contributed.`,
    ephemeral: true
  });
}

async function cancel(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Only administrators can use this command.', ephemeral: true });
  }

  const lottery = await Lottery.findOne({ guildId: interaction.guild.id, active: true });
  if (!lottery) {
    return interaction.reply({ content: 'There is no active lottery to cancel.', ephemeral: true });
  }

  await interaction.deferReply();

  for (const p of lottery.participants) {
    await increment(interaction.guild.id, p.userId, p.amount);
    try {
      const user = await interaction.client.users.fetch(p.userId);
      await user.send(`🎟️ The lottery in **${interaction.guild.name}** was cancelled. Your entry of **${p.amount} Flux** has been refunded.`);
    } catch (e) {
      // DMs closed - ignore
    }
  }

  lottery.active = false;
  await lottery.save();
  clearTimer(interaction.guild.id);

  await interaction.editReply(`🚫 Lottery cancelled. ${lottery.participants.length} participant(s) refunded.`);
}

async function runDraw(client, guildId) {
  clearTimer(guildId);
  const lottery = await Lottery.findOne({ guildId, active: true });
  if (!lottery) return;

  lottery.active = false;

  if (lottery.participants.length === 0) {
    await lottery.save();
    return;
  }

  const winnerEntry = lottery.participants[Math.floor(Math.random() * lottery.participants.length)];
  const prize = lottery.prizePool;
  await increment(guildId, winnerEntry.userId, prize);
  await lottery.save();

  const config = await getConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle('🎉 Lottery Ended')
    .setColor(0x57f287)
    .addFields(
      { name: 'Winner', value: `<@${winnerEntry.userId}>`, inline: true },
      { name: 'Prize', value: `${prize} ${fluxLabel(config)}`, inline: true }
    )
    .setDescription('Congratulations!');

  try {
    const channel = await client.channels.fetch(lottery.channelId);
    await channel.send({ embeds: [embed] });
  } catch (e) {
    // channel may have been deleted - ignore
  }

  try {
    const user = await client.users.fetch(winnerEntry.userId);
    await user.send({ content: `🎉 You won the lottery in a server you're in! You received **${prize} ${fluxLabel(config)}**.`, embeds: [embed] });
  } catch (e) {
    // DMs closed - ignore
  }
}

function clearTimer(guildId) {
  const existing = timers.get(guildId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(guildId);
  }
}

function scheduleDraw(client, guildId, delayMs) {
  clearTimer(guildId);
  const timeout = setTimeout(() => runDraw(client, guildId).catch(console.error), Math.max(delayMs, 0));
  timers.set(guildId, timeout);
}

// Called once on bot startup to reschedule (or immediately run) any lotteries
// that were active when the bot last shut down.
async function restoreActiveLotteries(client) {
  const active = await Lottery.find({ active: true });
  for (const lottery of active) {
    const delay = lottery.drawAt.getTime() - Date.now();
    scheduleDraw(client, lottery.guildId, delay);
  }
  if (active.length > 0) {
    console.log(`🎟️  Restored ${active.length} active lotter${active.length === 1 ? 'y' : 'ies'}.`);
  }
}

module.exports = { set, view, cancel, handleEnterButton, handleEnterModal, restoreActiveLotteries };
