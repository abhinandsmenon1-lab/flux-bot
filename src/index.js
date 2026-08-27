require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
const { connectDB } = require('./db');
const { restoreActiveLotteries } = require('./games/lottery');

// MessageContent + GuildMessages are needed to read the "." prefix gambling
// commands (.bj, .mines, .cf, .cashout). Message Content is a privileged
// intent - it must also be turned on for the bot under the Developer Portal
// -> Bot tab -> Privileged Gateway Intents -> Message Content Intent.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

require('./handlers/interactionCreate')(client);
require('./handlers/messageCreate')(client);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: 'the Flux Economy', type: ActivityType.Watching }],
    status: 'online'
  });

  try {
    await restoreActiveLotteries(client);
  } catch (err) {
    console.error('Failed to restore active lotteries:', err);
  }
});

(async () => {
  await connectDB();
  await client.login(process.env.DISCORD_TOKEN);
})();
