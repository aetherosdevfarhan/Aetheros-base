const { Events, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuild, saveGuild } = require('../database/db');
const { guardMessage } = require('../utils/antinukeManager');

function ownedChannelOf(message, config) {
  const channel = message.member?.voice?.channel;
  if (!channel || !config.tempvc.channels[channel.id]) return { error: "You're not in a temp voice channel managed by AETHEROS." };
  const record = config.tempvc.channels[channel.id];
  if (record.ownerId !== message.author.id) return { error: 'Only the channel owner can do that. Use `&claim` if the owner left.' };
  return { channel, record };
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s % 60}s`);
  return parts.join(' ');
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    const config = getGuild(message.guild.id);

    if (message.mentions.everyone && message.member) {
      await guardMessage(
        message.guild,
        message.member,
        'mentionSpam',
        '@everyone/@here mention spam detected'
      ).catch(() => null);
    }

    const prefix = config.prefix || '&';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();
    if (!cmd) return;

    if (cmd === 'ping') {
      return message.reply(`🟢 Pong! Gateway latency: **${message.client.ws.ping}ms**`);
    }

    if (cmd === 'uptime') {
      return message.reply(`⏱️ AETHEROS has been running for **${formatUptime(message.client.uptime)}**.`);
    }

    if (cmd === 'stats') {
      const embed = new EmbedBuilder()
        .setTitle('📊 AETHEROS Stats')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Servers', value: `${message.client.guilds.cache.size}`, inline: true },
          { name: 'Uptime', value: formatUptime(message.client.uptime), inline: true },
          { name: 'Latency', value: `${message.client.ws.ping}ms`, inline: true },
          { name: 'Active Temp Channels (this server)', value: `${Object.keys(config.tempvc.channels).length}`, inline: true },
          { name: 'Anti-Nuke', value: config.antinuke.enabled ? '🛡️ Enabled' : '⚠️ Disabled', inline: true }
        );
      return message.reply({ embeds: [embed] });
    }

    if (cmd === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('AETHEROS — Prefix Commands')
        .setColor(0x5865F2)
        .setDescription(
          `Current prefix: \`${prefix}\`\n\n` +
          `**Voice**\n` +
          `\`${prefix}lock\` / \`${prefix}unlock\` — lock or unlock your channel\n` +
          `\`${prefix}hide\` / \`${prefix}unhide\` — hide or reveal your channel\n` +
          `\`${prefix}limit <n>\` — set user limit (0 = unlimited)\n` +
          `\`${prefix}rename <name>\` — rename your channel\n` +
          `\`${prefix}claim\` — claim ownership if the owner left\n` +
          `\`${prefix}info\` — show info about your current voice channel\n\n` +
          `**Anti-Nuke** (admin only)\n` +
          `\`${prefix}whitelist add @user\`\n` +
          `\`${prefix}whitelist remove @user\`\n` +
          `\`${prefix}whitelist list\`\n\n` +
          `**General**\n` +
          `\`${prefix}ping\` · \`${prefix}stats\` · \`${prefix}uptime\`\n\n` +
          `**Config** (admin only)\n` +
          `\`${prefix}setprefix <new prefix>\`\n\n` +
          `Full setup (categories, log channels, thresholds) still uses slash commands: ` +
          `\`/setup-tempvc\` and \`/setup-antinuke\`.`
        );
      return message.reply({ embeds: [embed] });
    }

    if (cmd === 'setprefix') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply('❌ You need the **Manage Server** permission to do that.');
      }
      const newPrefix = args[0];
      if (!newPrefix || newPrefix.length > 5) {
        return message.reply('❌ Give me a prefix up to 5 characters, e.g. `&setprefix !`');
      }
      config.prefix = newPrefix;
      saveGuild(message.guild.id, config);
      return message.reply(`✅ Prefix changed to \`${newPrefix}\``);
    }

    if (['lock', 'unlock', 'hide', 'unhide'].includes(cmd)) {
      const result = ownedChannelOf(message, config);
      if (result.error) return message.reply(`❌ ${result.error}`);
      const { channel } = result;

      if (cmd === 'lock') { await channel.permissionOverwrites.edit(message.guild.id, { Connect: false }); return message.reply('🔒 Channel locked.'); }
      if (cmd === 'unlock') { await channel.permissionOverwrites.edit(message.guild.id, { Connect: true }); return message.reply('🔓 Channel unlocked.'); }
      if (cmd === 'hide') { await channel.permissionOverwrites.edit(message.guild.id, { ViewChannel: false }); return message.reply('🙈 Channel hidden.'); }
      if (cmd === 'unhide') { await channel.permissionOverwrites.edit(message.guild.id, { ViewChannel: true }); return message.reply('👁️ Channel visible again.'); }
    }

    if (cmd === 'limit') {
      const result = ownedChannelOf(message, config);
      if (result.error) return message.reply(`❌ ${result.error}`);
      const num = Math.max(0, Math.min(99, parseInt(args[0], 10) || 0));
      await result.channel.setUserLimit(num);
      return message.reply(`🔢 Limit set to ${num === 0 ? 'unlimited' : num}.`);
    }

    if (cmd === 'rename') {
      const result = ownedChannelOf(message, config);
      if (result.error) return message.reply(`❌ ${result.error}`);
      const name = args.join(' ').slice(0, 90);
      if (!name) return message.reply('❌ Give it a name: `&rename Chill Zone`');
      await result.channel.setName(name);
      return message.reply(`✏️ Renamed to **${name}**.`);
    }

    if (cmd === 'info') {
      const channel = message.member?.voice?.channel;
      if (!channel || !config.tempvc.channels[channel.id]) {
        return message.reply("❌ You're not in an AETHEROS temp voice channel.");
      }
      const record = config.tempvc.channels[channel.id];
      const locked = channel.permissionOverwrites.cache.get(message.guild.id)?.deny.has('Connect') ?? false;
      const hidden = channel.permissionOverwrites.cache.get(message.guild.id)?.deny.has('ViewChannel') ?? false;

      const embed = new EmbedBuilder()
        .setTitle(`🔊 ${channel.name}`)
        .setColor(0x5865F2)
        .addFields(
          { name: 'Owner', value: `<@${record.ownerId}>`, inline: true },
          { name: 'Members', value: `${channel.members.size}${channel.userLimit ? `/${channel.userLimit}` : ''}`, inline: true },
          { name: 'Status', value: `${locked ? '🔒 Locked' : '🔓 Unlocked'} · ${hidden ? '🙈 Hidden' : '👁️ Visible'}`, inline: true },
          { name: 'Created', value: `<t:${Math.floor(record.createdAt / 1000)}:R>`, inline: true }
        );
      return message.reply({ embeds: [embed] });
    }

    if (cmd === 'claim') {
      const channel = message.member?.voice?.channel;
      if (!channel || !config.tempvc.channels[channel.id]) return message.reply("❌ You're not in an AETHEROS temp voice channel.");
      const record = config.tempvc.channels[channel.id];
      if (channel.members.has(record.ownerId)) return message.reply('❌ The current owner is still in the channel.');
      record.ownerId = message.author.id;
      saveGuild(message.guild.id, config);
      await channel.permissionOverwrites.edit(message.author.id, {
        ManageChannels: true, MoveMembers: true, MuteMembers: true, DeafenMembers: true
      }).catch(() => null);
      return message.reply(`👑 You are now the owner of **${channel.name}**.`);
    }

    if (cmd === 'whitelist') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ You need **Administrator** to manage the whitelist.');
      }
      const sub = args[0]?.toLowerCase();
      const target = message.mentions.users.first();

      if (sub === 'add') {
        if (!target) return message.reply('❌ Mention a user: `&whitelist add @user`');
        if (target.id === message.guild.ownerId) return message.reply(`ℹ️ ${target} is the server owner and is already immune.`);
        if (config.antinuke.whitelist.includes(target.id)) return message.reply(`⚠️ ${target} is already whitelisted.`);
        config.antinuke.whitelist.push(target.id);
        saveGuild(message.guild.id, config);
        return message.reply(`✅ ${target} added to the anti-nuke whitelist. (${config.antinuke.whitelist.length} total)`);
      }
      if (sub === 'remove') {
        if (!target) return message.reply('❌ Mention a user: `&whitelist remove @user`');
        if (!config.antinuke.whitelist.includes(target.id)) return message.reply(`⚠️ ${target} isn't on the whitelist.`);
        config.antinuke.whitelist = config.antinuke.whitelist.filter(id => id !== target.id);
        saveGuild(message.guild.id, config);
        return message.reply(`🗑️ ${target} removed from the anti-nuke whitelist. (${config.antinuke.whitelist.length} total)`);
      }
      if (sub === 'list') {
        const ids = config.antinuke.whitelist;
        if (!ids.length) return message.reply('No one whitelisted yet.');
        const CHUNK = 40;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          await message.channel.send(chunk.map(id => `<@${id}>`).join('\n'));
        }
        return;
      }
      return message.reply('Usage: `&whitelist add|remove|list [@user]`');
    }
  }
};
