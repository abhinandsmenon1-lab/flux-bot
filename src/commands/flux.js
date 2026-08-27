const { SlashCommandBuilder } = require('discord.js');
const coinflip = require('../games/coinflip');
const blackjack = require('../games/blackjack');
const mines = require('../games/mines');
const lottery = require('../games/lottery');

// NOTE on structure: Discord's slash command API does not allow a subcommand
// GROUP name to be invoked directly (e.g. a bare "/flux coinflip" cannot both be
// a group AND runnable) once it contains other subcommands like "tutorial". So
// each game is a group with explicit "start" / "tutorial" subcommands:
//   /flux coinflip start | /flux coinflip tutorial
//   /flux bj start       | /flux bj tutorial
//   /flux mine start     | /flux mine tutorial
//   /flux lottery view | /flux lottery set | /flux lottery cancel
module.exports = {
  data: new SlashCommandBuilder()
    .setName('flux')
    .setDescription('Flux games and lottery')
    .setDMPermission(false)

    .addSubcommandGroup((group) =>
      group
        .setName('coinflip')
        .setDescription('Flux Coinflip')
        .addSubcommand((sub) =>
          sub
            .setName('start')
            .setDescription(`Start a coinflip — bet any positive amount of Flux`)
            .addIntegerOption((o) => o.setName('bet').setDescription('Amount of Flux to bet (any positive amount)').setRequired(true).setMinValue(1))
        )
        .addSubcommand((sub) => sub.setName('tutorial').setDescription('How Coinflip works'))
    )

    .addSubcommandGroup((group) =>
      group
        .setName('bj')
        .setDescription('Flux Blackjack')
        .addSubcommand((sub) =>
          sub
            .setName('start')
            .setDescription(`Start a blackjack game — bet any positive amount of Flux`)
            .addIntegerOption((o) => o.setName('bet').setDescription('Amount of Flux to bet (any positive amount)').setRequired(true).setMinValue(1))
        )
        .addSubcommand((sub) => sub.setName('tutorial').setDescription('How Blackjack works'))
    )

    .addSubcommandGroup((group) =>
      group
        .setName('mine')
        .setDescription('Flux Mines')
        .addSubcommand((sub) =>
          sub
            .setName('start')
            .setDescription(`Start a mines game — 5x5 grid (bet any positive amount)`)
            .addIntegerOption((o) => o.setName('bet').setDescription('Amount of Flux to bet (any positive amount)').setRequired(true).setMinValue(1))
            .addIntegerOption((o) =>
              o
                .setName('mines')
                .setDescription(`Number of mines (1-${mines.TOTAL_TILES - 1}, default ${mines.DEFAULT_MINES})`)
                .setMinValue(1)
                .setMaxValue(mines.TOTAL_TILES - 1)
            )
        )
        .addSubcommand((sub) => sub.setName('tutorial').setDescription('How Mines works'))
    )

    .addSubcommandGroup((group) =>
      group
        .setName('lottery')
        .setDescription('Flux Lottery')
        .addSubcommand((sub) => sub.setName('view').setDescription('View the current lottery and enter it'))
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('Create a new lottery (Administrator only)')
            .addIntegerOption((o) => o.setName('starting_prize').setDescription('Starting prize pool').setRequired(true).setMinValue(0))
            .addIntegerOption((o) => o.setName('duration_minutes').setDescription('How long until the draw, in minutes').setRequired(true).setMinValue(1))
            .addIntegerOption((o) => o.setName('min_entry').setDescription('Minimum entry amount').setRequired(true).setMinValue(1))
            .addIntegerOption((o) => o.setName('max_entry').setDescription('Maximum entry amount (cap 20,000)').setRequired(true).setMinValue(1).setMaxValue(20000))
        )
        .addSubcommand((sub) => sub.setName('cancel').setDescription('Cancel the active lottery and refund everyone (Administrator only)'))
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    if (group === 'coinflip') {
      if (sub === 'start') return coinflip.start(interaction);
      if (sub === 'tutorial') return coinflip.tutorial(interaction);
    }

    if (group === 'bj') {
      if (sub === 'start') return blackjack.start(interaction);
      if (sub === 'tutorial') return blackjack.tutorial(interaction);
    }

    if (group === 'mine') {
      if (sub === 'start') return mines.start(interaction);
      if (sub === 'tutorial') return mines.tutorial(interaction);
    }

    if (group === 'lottery') {
      if (sub === 'view') return lottery.view(interaction);
      if (sub === 'set') return lottery.set(interaction);
      if (sub === 'cancel') return lottery.cancel(interaction);
    }
  }
};
