require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

loadCommands(client);
loadEvents(client);

process.on('unhandledRejection', (err) => {
  console.error('[AETHEROS] Unhandled promise rejection:', err);
});

const token = process.env.DISCORD_TOKEN;
console.log(`[DEBUG] Token exists: ${!!token}`);
console.log(`[DEBUG] Token length: ${token ? token.length : 0}`);
console.log(`[DEBUG] First 6 chars: ${token ? token.slice(0, 6) : 'N/A'}`);
console.log(`[DEBUG] Last 4 chars: ${token ? token.slice(-4) : 'N/A'}`);
client.login(token);

const http = require('node:http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end('AETHEROS is running')).listen(PORT, () => {
  console.log(`[AETHEROS] Dummy web server listening on port ${PORT} (for host health checks)`);
});
