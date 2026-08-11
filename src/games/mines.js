const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getBalance, tryDeduct, increment } = require('../utils/flux');
const { getConfig } = require('../config');
const { fluxLabel } = require('../utils/embeds');

const MIN_BET = 1;
const TOTAL_TILES = 25; // full 5x5 grid
const COLS = 5;
const DEFAULT_MINES = 5;
const MIN_SAFE_FOR_CASHOUT = 10; // must clear 10 safe tiles before Cash Out unlocks
const HOUSE_EDGE = 0.97;
const games = new Map(); // gameId -> session

function newGameId() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

function pickMinePositions(count) {
  const positions = new Set();
  while (positions.size < count) {
    positions.add(Math.floor(Math.random() * TOTAL_TILES));
  }
  return positions;
}

function currentPayout(session) {
  return Math.floor(session.bet * session.multiplier * HOUSE_EDGE);
}

function buildEmbed(session, fluxTag) {
  const embed = new EmbedBuilder().setTitle('💣 Flux Mines (5x5)').setColor(0xfee75c).addFields(
    { name: 'Bet', value: `${session.bet} ${fluxTag}`, inline: true },
    { name: 'Mines', value: `${session.mineCount}`, inline: true },
    { name: 'Multiplier', value: `${session.multiplier.toFixed(2)}x`, inline: true }
  );

  if (session.status === 'playing') {
    if (session.revealedSafe < MIN_SAFE_FOR_CASHOUT) {
      embed.setDescription(
        `Safe tiles found: **${session.revealedSafe}/${MIN_SAFE_FOR_CASHOUT}** needed to unlock Cash Out.\n` +
        `Once unlocked, type \`.cashout\` at any time to collect your winnings.`
      );
    } else {
      embed.setDescription(
        `Safe tiles found: **${session.revealedSafe}**\n` +
        `✅ Cash Out is unlocked! Type \`.cashout\` to collect **${currentPayout(session)} ${fluxTag}**.`
      );
    }
  } else if (session.status === 'won') {
    embed.setColor(0x57f287).setDescription(`💰 Cashed out! You won **${session.payout} ${fluxTag}**.`);
  } else if (session.status === 'lost') {
    embed.setColor(0xed4245).setDescription(`💥 You hit a mine! You lost your bet of **${session.bet} ${fluxTag}**.`);
  }

  return embed;
}

function buildComponents(session, revealAll = false) {
  const rows = [];
  for (let r = 0; r < TOTAL_TILES / COLS; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const isMine = session.minePositions.has(idx);
      const isRevealed = session.revealed.has(idx);

      const btn = new ButtonBuilder().setCustomId(`mn_tile_${session.id}_${idx}`);

      if (revealAll) {
        if (isMine) {
          btn.setEmoji('💣').setStyle(ButtonStyle.Danger).setDisabled(true);
        } else if (isRevealed) {
          btn.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
        } else {
          btn.setEmoji('⬜').setStyle(ButtonStyle.Secondary).setDisabled(true);
        }
      } else if (isRevealed) {
        btn.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
      } else {
        btn.setEmoji('🟦').setStyle(ButtonStyle.Secondary).setDisabled(session.status !== 'playing');
      }

      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

function buildSession(guildId, playerId, bet, mineCount) {
  const id = newGameId();
  return {
    id,
    guildId,
    playerId,
    bet,
    mineCount,
    minePositions: pickMinePositions(mineCount),
    revealed: new Set(),
    revealedSafe: 0,
    remainingTiles: TOTAL_TILES,
    multiplier: 1,
    status: 'playing'
  };
}

function validateBetAndMines(bet, mineCount) {
  if (!Number.isInteger(bet) || bet < MIN_BET) return `The bet must be at least **1 Flux**.`;
  if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > TOTAL_TILES - 1) {
    return `Mine count must be between 1 and ${TOTAL_TILES - 1}.`;
  }
  return null;
}

// ---------------------------------------------------------------------
// Slash command entry point: /flux mine start
// ---------------------------------------------------------------------
async function start(interaction) {
  const bet = interaction.options.getInteger('bet');
  const mineCount = interaction.options.getInteger('mines') ?? DEFAULT_MINES;

  const error = validateBetAndMines(bet, mineCount);
  if (error) return interaction.reply({ content: error, ephemeral: true });

  const balance = await getBalance(interaction.guild.id, interaction.user.id);
  if (balance < bet) {
    return interaction.reply({ content: `You don't have enough Flux. Your balance: **${balance}**.`, ephemeral: true });
  }

  const deducted = await tryDeduct(interaction.guild.id, interaction.user.id, bet);
  if (!deducted) return interaction.reply({ content: 'You do not have enough Flux for that bet.', ephemeral: true });

  const session = buildSession(interaction.guild.id, interaction.user.id, bet, mineCount);
  games.set(session.id, session);

  const config = await getConfig(interaction.guild.id);
  const reply = await interaction.reply({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session), fetchReply: true });
  session.messageId = reply.id;
  session.channelId = interaction.channelId;
}

// ---------------------------------------------------------------------
// Prefix command entry point: .mines <bet> [mineCount]
// ---------------------------------------------------------------------
async function startMessage(message, args) {
  const bet = parseInt(args[0], 10);
  const mineCount = args[1] !== undefined ? parseInt(args[1], 10) : DEFAULT_MINES;

  const error = validateBetAndMines(bet, mineCount);
  if (error) return message.reply(`${error} Usage: \`.mines <bet> [mines]\` (default ${DEFAULT_MINES} mines).`);

  const balance = await getBalance(message.guild.id, message.author.id);
  if (balance < bet) {
    return message.reply(`You don't have enough Flux. Your balance: **${balance}**.`);
  }

  const deducted = await tryDeduct(message.guild.id, message.author.id, bet);
  if (!deducted) return message.reply('You do not have enough Flux for that bet.');

  const session = buildSession(message.guild.id, message.author.id, bet, mineCount);
  games.set(session.id, session);

  const config = await getConfig(message.guild.id);
  const sent = await message.channel.send({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session) });
  session.messageId = sent.id;
  session.channelId = message.channel.id;
}

async function handleTile(interaction, gameId, idx) {
  const session = games.get(gameId);
  if (!session) return interaction.reply({ content: 'This mines game is no longer active.', ephemeral: true });
  if (interaction.user.id !== session.playerId) return interaction.reply({ content: 'This is not your game.', ephemeral: true });
  if (session.status !== 'playing') return interaction.reply({ content: 'This game has already ended.', ephemeral: true });
  if (session.revealed.has(idx)) return interaction.deferUpdate();

  const config = await getConfig(session.guildId);

  if (session.minePositions.has(idx)) {
    session.status = 'lost';
    games.delete(gameId);
    return interaction.update({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session, true) });
  }

  session.revealed.add(idx);
  session.revealedSafe++;
  const factor = session.remainingTiles / (session.remainingTiles - session.mineCount);
  session.multiplier *= factor;
  session.remainingTiles--;

  // Auto-win if every non-mine tile has been revealed
  if (session.revealedSafe === TOTAL_TILES - session.mineCount) {
    session.status = 'won';
    session.payout = currentPayout(session);
    await increment(session.guildId, session.playerId, session.payout);
    games.delete(gameId);
    return interaction.update({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session, true) });
  }

  await interaction.update({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session) });
}

// ---------------------------------------------------------------------
// Prefix command: .cashout (Cash Out no longer fits as a button on a full
// 5x5 grid, so it's done via text command once unlocked)
// ---------------------------------------------------------------------
async function cashoutMessage(message) {
  const session = [...games.values()].find(
    (s) => s.guildId === message.guild.id && s.playerId === message.author.id && s.status === 'playing'
  );

  if (!session) return message.reply("You don't have an active Mines game.");

  if (session.revealedSafe < MIN_SAFE_FOR_CASHOUT) {
    return message.reply(
      `Cash Out unlocks after revealing **${MIN_SAFE_FOR_CASHOUT}** safe tiles. You're at **${session.revealedSafe}**.`
    );
  }

  session.status = 'won';
  session.payout = currentPayout(session);
  await increment(session.guildId, session.playerId, session.payout);
  games.delete(session.id);

  const config = await getConfig(session.guildId);

  try {
    const channel = await message.guild.channels.fetch(session.channelId);
    const msg = await channel.messages.fetch(session.messageId);
    await msg.edit({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session, true) });
  } catch (e) {
    // original message may have been deleted - ignore
  }

  await message.reply(`💰 Cashed out! You won **${session.payout} ${fluxLabel(config)}**.`);
}

async function tutorial(interaction) {
  const config = await getConfig(interaction.guild.id);
  const embed = new EmbedBuilder()
    .setTitle('💣 Mines — How to Play')
    .setColor(0xfee75c)
    .setDescription(
      `**No minimum bet:** any positive amount of ${fluxLabel(config)}\n` +
      `**Grid:** 5x5 (25 tiles), default **${DEFAULT_MINES} mines** (configurable 1-${TOTAL_TILES - 1}).\n\n` +
      `1. Start with \`/flux mine start\` or \`.mines <bet> [mines]\`.\n` +
      `2. Click tiles to reveal them. Each safe tile increases your multiplier.\n` +
      `3. **Cash Out only unlocks after revealing ${MIN_SAFE_FOR_CASHOUT} safe tiles** — before that you must keep going. ` +
      `Once unlocked, type \`.cashout\` at any time to collect your bet × current multiplier.\n` +
      `4. If you reveal a mine, you lose your entire bet — game over.\n` +
      `5. More mines = higher risk, but a bigger multiplier per safe tile.`
    );
  await interaction.reply({ embeds: [embed] });
}

module.exports = { start, startMessage, tutorial, handleTile, cashoutMessage, MIN_BET, TOTAL_TILES, DEFAULT_MINES, MIN_SAFE_FOR_CASHOUT };
