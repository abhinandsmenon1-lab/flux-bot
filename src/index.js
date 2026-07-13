require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

require('./handlers/interactionCreate')(client);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    const body=[...client.commands.values()].map(c=>c.data.toJSON());
    const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
    if(process.env.CLIENT_ID){
      if(process.env.GUILD_ID){
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID,process.env.GUILD_ID),{body});
        console.log(`✅ Registered ${body.length} guild commands.`);
      } else {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID),{body});
        console.log(`✅ Registered ${body.length} global commands.`);
      }
    }
  } catch(e){console.error(e);}

  client.user.setPresence({
    activities: [{
      name: 'the Flux Economy',
      type: 3
    }],
    status: 'online'
  });
});

client.login(process.env.DISCORD_TOKEN);
