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
    prefix: '&',
    panic: { active: false, channelIds: [] },
    tempvc: {
      enabled: false,
      categoryId: null,
      joinChannelId: null,
      nameFormat: "{user}'s Channel",
      defaultLimit: 0,
      panelChannelId: null,
      channels: {}
    },
    antinuke: {
      enabled: false,
      logChannelId: null,
      punishment: 'strip_ban',
      whitelist: [],
      trustedRoleId: null,
      thresholds: {
        channelDelete: { count: 3, seconds: 10 },
        channelCreate: { count: 5, seconds: 10 },
        roleDelete: { count: 3, seconds: 10 },
        roleCreate: { count: 5, seconds: 10 },
        ban: { count: 3, seconds: 10 },
        kick: { count: 3, seconds: 10 },
        webhookCreate: { count: 3, seconds: 15 },
        mentionSpam: { count: 3, seconds: 15 },
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
  cache[guildId].prefix = cache[guildId].prefix || def.prefix;
  cache[guildId].panic = cache[guildId].panic || def.panic;
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
