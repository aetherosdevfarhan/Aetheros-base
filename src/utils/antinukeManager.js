const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const { getGuild, saveGuild } = require('../database/db');
const { sendLog } = require('./logger');

const activity = new Map();
const punishedRecently = new Map();

const DANGEROUS_PERMS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers
];

function isImmune(guild, config, member) {
  if (!member) return true;
  if (member.id === guild.ownerId) return true;
  if (member.id === guild.client.user.id) return true;
  if (config.antinuke.whitelist.includes(member.id)) return true;
  if (config.antinuke.trustedRoleId && member.roles?.cache?.has(config.antinuke.trustedRoleId)) return true;
  return false;
}

async function resolveExecutor(guild, auditLogEvent, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ type: auditLogEvent, limit: 5 });
    const entry = logs.entries.find(e => {
      const recent = Date.now() - e.createdTimestamp < 15_000;
      const matches = targetId ? e.target?.id === targetId : true;
      return recent && matches;
    }) || logs.entries.first();
    if (!entry) return null;
    return { executorId: entry.executor?.id, entry };
  } catch {
    return null;
  }
}

function recordAndCheck(guildId, executorId, actionType, threshold) {
  if (!activity.has(guildId)) activity.set(guildId, new Map());
  const guildMap = activity.get(guildId);
  if (!guildMap.has(executorId)) guildMap.set(executorId, new Map());
  const userMap = guildMap.get(executorId);
  if (!userMap.has(actionType)) userMap.set(actionType, []);

  const now = Date.now();
  const windowMs = threshold.seconds * 1000;
  const timestamps = userMap.get(actionType).filter(t => now - t < windowMs);
  timestamps.push(now);
  userMap.set(actionType, timestamps);

  return timestamps.length >= threshold.count;
}

async function punish(guild, config, executorId, reason) {
  const key = `${guild.id}:${executorId}`;
  const until = punishedRecently.get(key);
  if (until && until > Date.now()) return;
  punishedRecently.set(key, Date.now() + 30_000);

  const member = await guild.members.fetch(executorId).catch(() => null);
  if (!member) return;
  if (isImmune(guild, config, member)) return;

  const actionsTaken = [];

  try {
    if (config.antinuke.punishment === 'strip_ban' || config.antinuke.punishment === 'strip_only') {
      const removable = member.roles.cache.filter(r => r.id !== guild.id && r.editable);
      if (removable.size) {
        await member.roles.remove(removable, `AETHEROS Anti-Nuke: ${reason}`);
        actionsTaken.push('roles stripped');
      }
    }
  } catch { /* ignore */ }

  try {
    if (config.antinuke.punishment === 'strip_ban') {
      if (member.bannable) {
        await member.ban({ reason: `AETHEROS Anti-Nuke: ${reason}` });
        actionsTaken.push('banned');
      }
    } else if (config.antinuke.punishment === 'strip_kick') {
      if (member.kickable) {
        await member.kick(`AETHEROS Anti-Nuke: ${reason}`);
        actionsTaken.push('kicked');
      }
    }
  } catch { /* ignore */ }

  await sendLog(guild, config, {
    title: '🛡️ Threat neutralized',
    description: `<@${executorId}> (\`${executorId}\`) triggered anti-nuke protection.`,
    color: 'danger',
    fields: [
      { name: 'Reason', value: reason, inline: false },
      { name: 'Actions taken', value: actionsTaken.length ? actionsTaken.join(', ') : 'none (missing permissions)', inline: false }
    ]
  });
}

async function guard(guild, actionKey, auditLogEvent, targetId, extraReason) {
  const config = getGuild(guild.id);
  if (!config.antinuke.enabled) return;
  const threshold = config.antinuke.thresholds[actionKey];
  if (!threshold) return;

  const resolved = await resolveExecutor(guild, auditLogEvent, targetId);
  if (!resolved?.executorId) return;

  const member = await guild.members.fetch(resolved.executorId).catch(() => null);
  if (isImmune(guild, config, member)) return;

  const exceeded = recordAndCheck(guild.id, resolved.executorId, actionKey, threshold);
  if (exceeded) {
    await punish(guild, config, resolved.executorId, extraReason || `Exceeded ${actionKey} rate limit`);
  }
}

async function guardInstant(guild, executorId, reason) {
  const config = getGuild(guild.id);
  if (!config.antinuke.enabled) return;
  await punish(guild, config, executorId, reason);
}

async function guardMessage(guild, member, actionKey, reason) {
  const config = getGuild(guild.id);
  if (!config.antinuke.enabled) return;
  const threshold = config.antinuke.thresholds[actionKey];
  if (!threshold) return;
  if (isImmune(guild, config, member)) return;

  const exceeded = recordAndCheck(guild.id, member.id, actionKey, threshold);
  if (exceeded) {
    await punish(guild, config, member.id, reason);
  }
}

module.exports = { guard, guardInstant, guardMessage, resolveExecutor, isImmune, DANGEROUS_PERMS };
