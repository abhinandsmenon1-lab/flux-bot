const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getBalance, tryDeduct, increment } = require('../utils/flux');
const { getConfig } = require('../config');
const { fluxLabel } = require('../utils/embeds');

const MIN_BET = 1;
const games = new Map(); // gameId -> session

function newGameId() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

function buildEmbed(session, fluxTag) {
  const embed = new EmbedBuilder().setTitle('🪙 Flux Coinflip').setColor(0xfee75c);

  if (session.status === 'waiting') {
    const fields = [
      { name: 'Host', value: `<@${session.hostId}>`, inline: true },
      { name: 'Bet Amount', value: `${session.bet} ${fluxTag}`, inline: true }
    ];
    if (session.sides[session.hostId]) {
      fields.push({ name: 'Host Picked', value: session.sides[session.hostId], inline: true });
    }
    embed.setDescription('Waiting for a second player to join...').addFields(...fields);
  } else if (session.status === 'picking') {
    embed.setDescription('Both players: click **Pick Side** to privately choose Heads or Tails.').addFields(
      { name: 'Player 1', value: `<@${session.hostId}> ${session.sides[session.hostId] ? '✅ Ready' : '⏳ Choosing...'}`, inline: true },
      { name: 'Player 2', value: `<@${session.opponentId}> ${session.sides[session.opponentId] ? '✅ Ready' : '⏳ Choosing...'}`, inline: true },
      { name: 'Bet Amount', value: `${session.bet} ${fluxTag}`, inline: true }
    );
  } else if (session.status === 'ready') {
    embed.setDescription('Both sides picked! Press **Bet** to confirm and flip the coin.').addFields(
      { name: 'Player 1', value: `<@${session.hostId}> (${session.sides[session.hostId]})`, inline: true },
      { name: 'Player 2', value: `<@${session.opponentId}> (${session.sides[session.opponentId]})`, inline: true },
      { name: 'Bet Amount', value: `${session.bet} ${fluxTag} each`, inline: true }
    );
  } else if (session.status === 'done') {
    embed.setColor(0x57f287).setDescription('🎉 Coinflip complete!').addFields(
      { name: 'Result', value: session.result, inline: true },
      { name: 'Winner', value: `<@${session.winnerId}>`, inline: true },
      { name: 'Total Won', value: `${session.bet * 2} ${fluxTag}`, inline: true }
    );
  } else if (session.status === 'cancelled') {
    embed.setColor(0xed4245).setDescription(session.cancelReason || 'This coinflip was cancelled.');
  }

  return embed;
}

function buildComponents(session) {
  if (session.status === 'waiting') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cf_join_${session.id}`).setLabel('Join').setStyle(ButtonStyle.Primary)
      )
    ];
  }
  if (session.status === 'picking') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cf_pickside_${session.id}`).setLabel('Pick Side').setStyle(ButtonStyle.Secondary)
      )
    ];
  }
  if (session.status === 'ready') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cf_bet_${session.id}`).setLabel('Bet').setStyle(ButtonStyle.Success)
      )
    ];
  }
  return [];
}

function buildSession(guildId, hostId, bet, hostSide) {
  return {
    id: newGameId(),
    guildId,
    hostId,
    opponentId: null,
    bet,
    sides: hostSide ? { [hostId]: hostSide } : {},
    readyToBet: new Set(),
    status: 'waiting'
  };
}

// ---------------------------------------------------------------------
// Slash command entry point: /flux coinflip start
// ---------------------------------------------------------------------
async function start(interaction) {
  const bet = interaction.options.getInteger('bet');
  if (bet < MIN_BET) {
    return interaction.reply({ content: `The bet must be at least **1 Flux**.`, ephemeral: true });
  }

  const balance = await getBalance(interaction.guild.id, interaction.user.id);
  if (balance < bet) {
    return interaction.reply({ content: `You don't have enough Flux. Your balance: **${balance}**.`, ephemeral: true });
  }

  const session = buildSession(interaction.guild.id, interaction.user.id, bet, null);
  games.set(session.id, session);

  const config = await getConfig(interaction.guild.id);
  const reply = await interaction.reply({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session), fetchReply: true });
  session.messageId = reply.id;
  session.channelId = interaction.channelId;
}

// ---------------------------------------------------------------------
// Prefix command entry point: .cf <bet> <h|t>
// ---------------------------------------------------------------------
async function startMessage(message, args) {
  const bet = parseInt(args[0], 10);
  const sideArg = (args[1] || '').toLowerCase();

  if (!Number.isInteger(bet) || bet < MIN_BET) {
    return message.reply(`The bet must be at least **1 Flux**. Usage: \`.cf <bet> <h|t>\``);
  }
  if (!['h', 't', 'heads', 'tails'].includes(sideArg)) {
    return message.reply('Please pick a side. Usage: `.cf <bet> <h|t>` (e.g. `.cf 100 h`).');
  }
  const hostSide = sideArg.startsWith('h') ? 'Heads' : 'Tails';

  const balance = await getBalance(message.guild.id, message.author.id);
  if (balance < bet) {
    return message.reply(`You don't have enough Flux. Your balance: **${balance}**.`);
  }

  const session = buildSession(message.guild.id, message.author.id, bet, hostSide);
  games.set(session.id, session);

  const config = await getConfig(message.guild.id);
  const sent = await message.channel.send({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session) });
  session.messageId = sent.id;
  session.channelId = message.channel.id;
}

async function updateMessage(interaction, session) {
  const config = await getConfig(session.guildId);
  const embed = buildEmbed(session, fluxLabel(config));
  await interaction.update({ embeds: [embed], components: buildComponents(session) });
}

async function handleJoin(interaction, gameId) {
  const session = games.get(gameId);
  if (!session) return interaction.reply({ content: 'This coinflip no longer exists.', ephemeral: true });
  if (session.status !== 'waiting') return interaction.reply({ content: 'This coinflip is no longer accepting players.', ephemeral: true });
  if (interaction.user.id === session.hostId) return interaction.reply({ content: 'You cannot join your own coinflip.', ephemeral: true });

  const balance = await getBalance(session.guildId, interaction.user.id);
  if (balance < session.bet) {
    return interaction.reply({ content: `You don't have enough Flux to join. You need **${session.bet}**.`, ephemeral: true });
  }

  session.opponentId = interaction.user.id;

  const hostSide = session.sides[session.hostId];
  if (hostSide) {
    // Prefix-command flow: host already picked a side, opponent auto-gets the other.
    session.sides[interaction.user.id] = hostSide === 'Heads' ? 'Tails' : 'Heads';
    session.status = 'ready';
  } else {
    session.status = 'picking';
  }

  await updateMessage(interaction, session);
}

async function handlePickSide(interaction, gameId) {
  const session = games.get(gameId);
  if (!session) return interaction.reply({ content: 'This coinflip no longer exists.', ephemeral: true });
  if (![session.hostId, session.opponentId].includes(interaction.user.id)) {
    return interaction.reply({ content: 'Only the two players in this coinflip can pick a side.', ephemeral: true });
  }
  if (session.status !== 'picking') {
    return interaction.reply({ content: 'Side picking has already finished for this coinflip.', ephemeral: true });
  }

  const takenSide = Object.entries(session.sides).find(([uid]) => uid !== interaction.user.id)?.[1];
  const row = new ActionRowBuilder();
  if (takenSide !== 'Heads') row.addComponents(new ButtonBuilder().setCustomId(`cf_side_${gameId}_heads`).setLabel('Heads').setStyle(ButtonStyle.Primary));
  if (takenSide !== 'Tails') row.addComponents(new ButtonBuilder().setCustomId(`cf_side_${gameId}_tails`).setLabel('Tails').setStyle(ButtonStyle.Primary));

  await interaction.reply({ content: 'Pick your side:', components: [row], ephemeral: true });
}

async function handleSideChoice(interaction, gameId, side) {
  const session = games.get(gameId);
  if (!session) return interaction.update({ content: 'This coinflip no longer exists.', components: [] });
  if (session.status !== 'picking') return interaction.update({ content: 'Side picking has already finished.', components: [] });

  const label = side === 'heads' ? 'Heads' : 'Tails';
  const otherUserId = interaction.user.id === session.hostId ? session.opponentId : session.hostId;
  if (session.sides[otherUserId] === label) {
    return interaction.update({ content: 'That side was just taken — please pick the other one.', components: [] });
  }

  session.sides[interaction.user.id] = label;
  await interaction.update({ content: `You picked **${label}**.`, components: [] });

  if (session.sides[session.hostId] && session.sides[session.opponentId]) {
    session.status = 'ready';
    try {
      const channel = await interaction.guild.channels.fetch(session.channelId);
      const msg = await channel.messages.fetch(session.messageId);
      const config = await getConfig(session.guildId);
      await msg.edit({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session) });
    } catch (e) {
      // message may have been deleted - ignore
    }
  }
}

async function handleBet(interaction, gameId) {
  const session = games.get(gameId);
  if (!session) return interaction.reply({ content: 'This coinflip no longer exists.', ephemeral: true });
  if (![session.hostId, session.opponentId].includes(interaction.user.id)) {
    return interaction.reply({ content: 'Only the two players in this coinflip can press Bet.', ephemeral: true });
  }
  if (session.status !== 'ready') {
    return interaction.reply({ content: 'This coinflip is not ready to be settled yet.', ephemeral: true });
  }

  session.readyToBet.add(interaction.user.id);
  if (session.readyToBet.size < 2) {
    return interaction.reply({ content: 'Waiting for the other player to press Bet...', ephemeral: true });
  }

  const hostDeduct = await tryDeduct(session.guildId, session.hostId, session.bet);
  const oppDeduct = await tryDeduct(session.guildId, session.opponentId, session.bet);

  if (!hostDeduct || !oppDeduct) {
    if (hostDeduct) await increment(session.guildId, session.hostId, session.bet);
    if (oppDeduct) await increment(session.guildId, session.opponentId, session.bet);
    session.status = 'cancelled';
    session.cancelReason = 'One of the players no longer has enough Flux. The coinflip was cancelled and any deducted Flux refunded.';
    games.delete(gameId);
    const config = await getConfig(session.guildId);
    return interaction.update({ embeds: [buildEmbed(session, fluxLabel(config))], components: [] });
  }

  const flipResult = Math.random() < 0.5 ? 'Heads' : 'Tails';
  const winnerId = session.sides[session.hostId] === flipResult ? session.hostId : session.opponentId;
  const pot = session.bet * 2;
  await increment(session.guildId, winnerId, pot);

  session.status = 'done';
  session.result = flipResult;
  session.winnerId = winnerId;
  games.delete(gameId);

  const config = await getConfig(session.guildId);
  await interaction.update({ embeds: [buildEmbed(session, fluxLabel(config))], components: [] });

  try {
    const hostUser = await interaction.client.users.fetch(session.hostId);
    const oppUser = await interaction.client.users.fetch(session.opponentId);
    const msg = `🪙 Coinflip result: **${flipResult}**. Winner: <@${winnerId}> — won **${pot} ${fluxLabel(config)}**.`;
    await hostUser.send(msg).catch(() => {});
    await oppUser.send(msg).catch(() => {});
  } catch (e) {
    // ignore
  }
}

async function tutorial(interaction) {
  const config = await getConfig(interaction.guild.id);
  const embed = new EmbedBuilder()
    .setTitle('🪙 Coinflip — How to Play')
    .setColor(0xfee75c)
    .setDescription(
      `**No minimum bet:** any positive amount of ${fluxLabel(config)}\n\n` +
      `**Slash:** \`/flux coinflip start bet:<amount>\` — another player joins and both privately pick Heads/Tails.\n` +
      `**Prefix:** \`.cf <bet> <h|t>\` — instantly lock in your side (e.g. \`.cf 100 h\`); whoever joins auto-gets the other side.\n\n` +
      `1. Another player clicks **Join**.\n` +
      `2. Sides are picked (or auto-assigned if you used \`.cf\`) — you can't both have the same side.\n` +
      `3. Both players press **Bet** to confirm — Flux is deducted immediately.\n` +
      `4. The coin is flipped with a true 50/50 chance, independent every round.\n` +
      `5. Whoever picked the side that comes up wins the **entire pot** (both bets combined).`
    );
  await interaction.reply({ embeds: [embed] });
}

module.exports = { start, startMessage, tutorial, handleJoin, handlePickSide, handleSideChoice, handleBet, MIN_BET };
