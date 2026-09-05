const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'guilds.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');

let cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
let writeTimer = null;

function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
  }, 250);
}

function defaultGuildConfig() {
  return {
    tempvc: {
      enabled: false,
      categoryId: null,
      joinChannelId: null,
      nameFormat: "{user}'s Channel",
      defaultLimit: 0,
      panelChannelId: null,
      channels: {} // channelId -> { ownerId, createdAt, rejected: [userIds] }
    },
    antinuke: {
      enabled: false,
      logChannelId: null,
      punishment: 'strip_ban', // strip_ban | strip_kick | strip_only
      whitelist: [], // user IDs immune to punishment
      trustedRoleId: null, // role that is also immune
      thresholds: {
        channelDelete: { count: 3, seconds: 10 },
        channelCreate: { count: 5, seconds: 10 },
        roleDelete: { count: 3, seconds: 10 },
        roleCreate: { count: 5, seconds: 10 },
        ban: { count: 3, seconds: 10 },
        kick: { count: 3, seconds: 10 },
        webhookCreate: { count: 3, seconds: 15 },
        memberPrune: { count: 1, seconds: 10 }
      },
      allowBotAdd: false,
      allowDangerousPerms: false
    }
  };
}

function getGuild(guildId) {
  if (!cache[guildId]) {
    cache[guildId] = defaultGuildConfig();
    persist();
  }
  const def = defaultGuildConfig();
  cache[guildId].tempvc = { ...def.tempvc, ...cache[guildId].tempvc };
  cache[guildId].antinuke = {
    ...def.antinuke,
    ...cache[guildId].antinuke,
    thresholds: { ...def.antinuke.thresholds, ...(cache[guildId].antinuke?.thresholds || {}) }
  };
  return cache[guildId];
}

function saveGuild(guildId, data) {
  cache[guildId] = data;
  persist();
}

module.exports = { getGuild, saveGuild, defaultGuildConfig };
