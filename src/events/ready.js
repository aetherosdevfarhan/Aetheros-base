const { ActivityType, Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[AETHEROS] Logged in as ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: 'over your server | /setup-tempvc', type: ActivityType.Watching }],
      status: 'online'
    });
  }
};
