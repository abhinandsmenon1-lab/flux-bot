const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getBalance, tryDeduct, increment } = require('../utils/flux');
const { getConfig } = require('../config');
const { fluxLabel } = require('../utils/embeds');

const MIN_BET = 1;
const games = new Map(); // gameId -> session

function newGameId() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

function freshDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

function handValue(hand) {
  let total = hand.reduce((sum, c) => sum + cardValue(c), 0);
  let aces = hand.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function formatHand(hand, hideSecond = false) {
  if (hideSecond) return `${hand[0].rank}${hand[0].suit} 🂠`;
  return hand.map((c) => `${c.rank}${c.suit}`).join(' ');
}

function buildEmbed(session, fluxTag) {
  const playerVal = handValue(session.player);
  const embed = new EmbedBuilder().setTitle('🃏 Flux Blackjack').setColor(0xfee75c);

  const dealerHidden = session.status === 'playing';
  const dealerVal = dealerHidden ? '?' : handValue(session.dealer);

  embed.addFields(
    { name: `Your Hand (${playerVal})`, value: formatHand(session.player), inline: false },
    { name: `Dealer's Hand (${dealerVal})`, value: formatHand(session.dealer, dealerHidden), inline: false },
    { name: 'Bet', value: `${session.bet} ${fluxTag}`, inline: true }
  );

  if (session.status === 'done') {
    embed.setColor(session.outcome === 'win' || session.outcome === 'blackjack' ? 0x57f287 : session.outcome === 'push' ? 0xfee75c : 0xed4245);
    embed.addFields({ name: 'Result', value: session.resultText, inline: false });
  }

  return embed;
}

function buildComponents(session) {
  if (session.status !== 'playing') return [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj_hit_${session.id}`).setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bj_stand_${session.id}`).setLabel('Stand').setStyle(ButtonStyle.Secondary)
  );
  if (session.canDouble) {
    row.addComponents(new ButtonBuilder().setCustomId(`bj_double_${session.id}`).setLabel('Double Down').setStyle(ButtonStyle.Danger));
  }
  return [row];
}

async function settle(session, guildId) {
  const playerVal = handValue(session.player);
  const dealerVal = handValue(session.dealer);
  const playerBJ = playerVal === 21 && session.player.length === 2;
  const dealerBJ = dealerVal === 21 && session.dealer.length === 2;

  let outcome; // win | lose | push | blackjack
  let payout = 0;

  if (playerVal > 21) {
    outcome = 'lose';
  } else if (playerBJ && !dealerBJ) {
    outcome = 'blackjack';
    payout = Math.floor(session.bet * 2.5);
  } else if (dealerBJ && !playerBJ) {
    outcome = 'lose';
  } else if (dealerVal > 21) {
    outcome = 'win';
    payout = session.bet * 2;
  } else if (playerVal > dealerVal) {
    outcome = 'win';
    payout = session.bet * 2;
  } else if (playerVal < dealerVal) {
    outcome = 'lose';
  } else {
    outcome = 'push';
    payout = session.bet; // return original bet
  }

  if (payout > 0) await increment(guildId, session.playerId, payout);

  const resultLines = {
    win: `You win! You receive **${payout} Flux**.`,
    blackjack: `Blackjack! You receive **${payout} Flux**.`,
    push: `Push — your bet of **${payout} Flux** is returned.`,
    lose: `You lose. Better luck next time.`
  };

  session.status = 'done';
  session.outcome = outcome;
  session.resultText = resultLines[outcome];
  session.payout = payout;
  games.delete(session.id);
}

async function dealerPlay(session, guildId) {
  while (handValue(session.dealer) < 17) {
    session.dealer.push(session.deck.pop());
  }
  await settle(session, guildId);
}

function buildSession(guildId, playerId, bet) {
  const deck = freshDeck();
  return {
    id: newGameId(),
    guildId,
    playerId,
    bet,
    deck,
    player: [deck.pop(), deck.pop()],
    dealer: [deck.pop(), deck.pop()],
    status: 'playing',
    canDouble: true
  };
}

// ---------------------------------------------------------------------
// Slash command entry point: /flux bj start
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

  const deducted = await tryDeduct(interaction.guild.id, interaction.user.id, bet);
  if (!deducted) {
    return interaction.reply({ content: 'You do not have enough Flux for that bet.', ephemeral: true });
  }

  const session = buildSession(interaction.guild.id, interaction.user.id, bet);
  games.set(session.id, session);

  const config = await getConfig(interaction.guild.id);

  // natural blackjack check
  if (handValue(session.player) === 21) {
    await dealerPlay(session, interaction.guild.id);
    return interaction.reply({ embeds: [buildEmbed(session, fluxLabel(config))], components: [] });
  }

  const reply = await interaction.reply({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session), fetchReply: true });
  session.messageId = reply.id;
  session.channelId = interaction.channelId;
}

// ---------------------------------------------------------------------
// Prefix command entry point: .bj <bet>
// ---------------------------------------------------------------------
async function startMessage(message, args) {
  const bet = parseInt(args[0], 10);
  if (!Number.isInteger(bet) || bet < MIN_BET) {
    return message.reply(`The bet must be at least **1 Flux**. Usage: \`.bj <bet>\``);
  }

  const balance = await getBalance(message.guild.id, message.author.id);
  if (balance < bet) {
    return message.reply(`You don't have enough Flux. Your balance: **${balance}**.`);
  }

  const deducted = await tryDeduct(message.guild.id, message.author.id, bet);
  if (!deducted) {
    return message.reply('You do not have enough Flux for that bet.');
  }

  const session = buildSession(message.guild.id, message.author.id, bet);
  games.set(session.id, session);

  const config = await getConfig(message.guild.id);

  if (handValue(session.player) === 21) {
    await dealerPlay(session, message.guild.id);
    return message.channel.send({ embeds: [buildEmbed(session, fluxLabel(config))], components: [] });
  }

  const sent = await message.channel.send({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session) });
  session.messageId = sent.id;
  session.channelId = message.channel.id;
}

async function handleHit(interaction, gameId) {
  const session = games.get(gameId);
  if (!session) return interaction.reply({ content: 'This blackjack game is no longer active.', ephemeral: true });
  if (interaction.user.id !== session.playerId) return interaction.reply({ content: 'This is not your game.', ephemeral: true });
  if (session.status !== 'playing') return interaction.reply({ content: 'This game has already ended.', ephemeral: true });

  session.canDouble = false;
  session.player.push(session.deck.pop());
  const config = await getConfig(session.guildId);

  if (handValue(session.player) > 21) {
    await settle(session, session.guildId);
    return interaction.update({ embeds: [buildEmbed(session, fluxLabel(config))], components: [] });
  }

  await interaction.update({ embeds: [buildEmbed(session, fluxLabel(config))], components: buildComponents(session) });
}

async function handleStand(interaction, gameId) {
  const session = games.get(gameId);
  if (!session) return interaction.reply({ content: 'This blackjack game is no longer active.', ephemeral: true });
  if (interaction.user.id !== session.playerId) return interaction.reply({ content: 'This is not your game.', ephemeral: true });
  if (session.status !== 'playing') return interaction.reply({ content: 'This game has already ended.', ephemeral: true });

  await dealerPlay(session, session.guildId);
  const config = await getConfig(session.guildId);
  await interaction.update({ embeds: [buildEmbed(session, fluxLabel(config))], components: [] });
}

async function handleDouble(interaction, gameId) {
  const session = games.get(gameId);
  if (!session) return interaction.reply({ content: 'This blackjack game is no longer active.', ephemeral: true });
  if (interaction.user.id !== session.playerId) return interaction.reply({ content: 'This is not your game.', ephemeral: true });
  if (session.status !== 'playing' || !session.canDouble) {
    return interaction.reply({ content: 'You can no longer double down on this game.', ephemeral: true });
  }

  const deducted = await tryDeduct(session.guildId, session.playerId, session.bet);
  if (!deducted) {
    return interaction.reply({ content: 'You do not have enough Flux to double down.', ephemeral: true });
  }

  session.bet *= 2;
  session.canDouble = false;
  session.player.push(session.deck.pop());

  const config = await getConfig(session.guildId);

  if (handValue(session.player) > 21) {
    await settle(session, session.guildId);
    return interaction.update({ embeds: [buildEmbed(session, fluxLabel(config))], components: [] });
  }

  await dealerPlay(session, session.guildId);
  await interaction.update({ embeds: [buildEmbed(session, fluxLabel(config))], components: [] });
}

async function tutorial(interaction) {
  const config = await getConfig(interaction.guild.id);
  const embed = new EmbedBuilder()
    .setTitle('🃏 Blackjack — How to Play')
    .setColor(0xfee75c)
    .setDescription(
      `**No minimum bet:** any positive amount of ${fluxLabel(config)}\n\n` +
      `**Slash:** \`/flux bj start bet:<amount>\`  **Prefix:** \`.bj <bet>\`\n\n` +
      `1. Your bet is deducted immediately.\n` +
      `2. You and the dealer are each dealt 2 cards (one dealer card is hidden).\n` +
      `3. **Hit** to draw another card, **Stand** to hold, or **Double Down** (first turn only) ` +
      `to double your bet and draw exactly one more card.\n` +
      `4. Go over 21 and you bust — instant loss.\n` +
      `5. After you stand, the dealer draws until reaching 17 or higher.\n` +
      `6. A natural blackjack (21 on the first 2 cards) pays **2.5x** your bet. A regular win pays **2x**. ` +
      `A push (tie) returns your bet.`
    );
  await interaction.reply({ embeds: [embed] });
}

module.exports = { start, startMessage, tutorial, handleHit, handleStand, handleDouble, MIN_BET };
