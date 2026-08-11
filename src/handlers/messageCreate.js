const blackjack = require('../games/blackjack');
const mines = require('../games/mines');
const coinflip = require('../games/coinflip');

const PREFIX = '.';

// .bj <bet>            e.g. .bj 100
// .mines <bet> [mines] e.g. .mines 10  or  .mines 10 8
// .cf <bet> <h|t>      e.g. .cf 10 h
// .cashout             collect a Mines game once unlocked
module.exports = function registerMessageHandler(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;

    const parts = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (parts.shift() || '').toLowerCase();
    const args = parts;

    if (!cmd) return;

    try {
      if (cmd === 'bj') return await blackjack.startMessage(message, args);
      if (cmd === 'mines' || cmd === 'mine') return await mines.startMessage(message, args);
      if (cmd === 'cf' || cmd === 'coinflip') return await coinflip.startMessage(message, args);
      if (cmd === 'cashout') return await mines.cashoutMessage(message);
    } catch (err) {
      console.error(err);
      message.reply('Something went wrong with that command.').catch(() => {});
    }
  });
};
