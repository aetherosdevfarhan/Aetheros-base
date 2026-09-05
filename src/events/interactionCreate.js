const { Events, ChannelType, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getGuild, saveGuild } = require('../database/db');
const { PANEL_ID } = require('../utils/tempVCManager');

function findOwnedChannel(interaction) {
  const config = getGuild(interaction.guild.id);
  const entry = Object.entries(config.tempvc.channels).find(
    ([, rec]) => rec.panelMessageId === interaction.message?.id
  );
  if (!entry) return { error: 'This control panel is no longer linked to an active channel.' };
  const [channelId, record] = entry;
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return { error: 'That voice channel no longer exists.' };
  if (record.ownerId !== interaction.user.id) return { error: 'Only the channel owner can use these controls.' };
  return { config, channel, record, channelId };
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`[AETHEROS] Error in /${interaction.commandName}:`, err);
        const payload = { content: '⚠️ Something went wrong running that command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
        else await interaction.reply(payload).catch(() => null);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'aeth_modal_rename') {
        const config = getGuild(interaction.guild.id);
        const entry = Object.entries(config.tempvc.channels).find(([, r]) => r.ownerId === interaction.user.id);
        if (!entry) return interaction.reply({ content: '❌ No owned channel found.', ephemeral: true });
        const channel = interaction.guild.channels.cache.get(entry[0]);
        const newName = interaction.fields.getTextInputValue('name');
        await channel.setName(newName).catch(() => null);
        return interaction.reply({ content: `✏️ Renamed to **${newName}**.`, ephemeral: true });
      }
      if (interaction.customId === 'aeth_modal_limit') {
        const config = getGuild(interaction.guild.id);
        const entry = Object.entries(config.tempvc.channels).find(([, r]) => r.ownerId === interaction.user.id);
        if (!entry) return interaction.reply({ content: '❌ No owned channel found.', ephemeral: true });
        const channel = interaction.guild.channels.cache.get(entry[0]);
        const raw = interaction.fields.getTextInputValue('limit');
        const num = Math.max(0, Math.min(99, parseInt(raw, 10) || 0));
        await channel.setUserLimit(num).catch(() => null);
        return interaction.reply({ content: `🔢 Limit set to ${num === 0 ? 'unlimited' : num}.`, ephemeral: true });
      }
      return;
    }

    // ---- owner-only server wipe confirmation ----
    if (interaction.isButton() && interaction.customId.startsWith('aeth_nuke_confirm_')) {
      const requesterId = interaction.customId.replace('aeth_nuke_confirm_', '');
      if (interaction.user.id !== requesterId || interaction.user.id !== process.env.OWNER_ID) {
        return interaction.reply({ content: '❌ This confirmation isn\'t yours to press.', ephemeral: true });
      }

      await interaction.update({ content: '💥 Wipe in progress...', embeds: [], components: [] });
      const guild = interaction.guild;

      const members = await guild.members.fetch();
      for (const member of members.values()) {
        if (member.id === interaction.user.id || member.id === guild.client.user.id) continue;
        await member.kick('AETHEROS: owner-triggered wipe').catch(() => null);
      }

      const roles = await guild.roles.fetch();
      for (const role of roles.values()) {
        if (role.id === guild.id || role.managed) continue;
        await role.delete('AETHEROS: owner-triggered wipe').catch(() => null);
      }

      const channels = await guild.channels.fetch();
      for (const channel of channels.values()) {
        await channel?.delete('AETHEROS: owner-triggered wipe').catch(() => null);
      }

      await interaction.followUp({
        content: '✅ Wipe complete. Channels and roles are gone and all other members were removed. Full server deletion still has to be done by you from the Discord app — bots cannot do that.'
      }).catch(() => null);
      return;
    }

    // ---- Temp VC panel buttons ----
    if (interaction.isButton() && Object.values(PANEL_ID).includes(interaction.customId)) {
      if (interaction.customId === PANEL_ID.RENAME) {
        const modal = new ModalBuilder().setCustomId('aeth_modal_rename').setTitle('Rename your channel');
        const input = new TextInputBuilder().setCustomId('name').setLabel('New channel name').setStyle(TextInputStyle.Short).setMaxLength(90).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (interaction.customId === PANEL_ID.LIMIT) {
        const modal = new ModalBuilder().setCustomId('aeth_modal_limit').setTitle('Set user limit');
        const input = new TextInputBuilder().setCustomId('limit').setLabel('Limit (0 = unlimited, max 99)').setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (interaction.customId === PANEL_ID.CLAIM) {
        const config = getGuild(interaction.guild.id);
        const entry = Object.entries(config.tempvc.channels).find(
          ([, rec]) => rec.panelMessageId === interaction.message.id
        );
        if (!entry) return interaction.reply({ content: '❌ Channel no longer exists.', ephemeral: true });
        const [channelId, record] = entry;
        const channel = interaction.guild.channels.cache.get(channelId);
        if (channel.members.has(record.ownerId)) {
          return interaction.reply({ content: 'The current owner is still connected.', ephemeral: true });
        }
        record.ownerId = interaction.user.id;
        saveGuild(interaction.guild.id, config);
        await channel.permissionOverwrites.edit(interaction.user.id, {
          ManageChannels: true, MoveMembers: true, MuteMembers: true, DeafenMembers: true
        }).catch(() => null);
        return interaction.reply({ content: `👑 <@${interaction.user.id}> is now the owner of this channel.` });
      }

      const result = findOwnedChannel(interaction);
      if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      const { channel } = result;

      if (interaction.customId === PANEL_ID.LOCK) {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        return interaction.reply({ content: '🔒 Channel locked.', ephemeral: true });
      }
      if (interaction.customId === PANEL_ID.UNLOCK) {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        return interaction.reply({ content: '🔓 Channel unlocked.', ephemeral: true });
      }
      if (interaction.customId === PANEL_ID.HIDE) {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        return interaction.reply({ content: '🙈 Channel hidden.', ephemeral: true });
      }
      if (interaction.customId === PANEL_ID.UNHIDE) {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
        return interaction.reply({ content: '👁️ Channel visible again.', ephemeral: true });
      }
      return;
    }

    // ---- Temp VC panel user-select menus (kick / permit / reject / transfer) ----
    if (interaction.isUserSelectMenu() && Object.values(PANEL_ID).includes(interaction.customId)) {
      const result = findOwnedChannel(interaction);
      if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      const { channel, config, record } = result;
      const targetId = interaction.values[0];

      if (interaction.customId === PANEL_ID.KICK) {
        const targetMember = channel.members.get(targetId);
        if (!targetMember) return interaction.reply({ content: 'That user is not in your channel.', ephemeral: true });
        await targetMember.voice.disconnect('Kicked by channel owner').catch(() => null);
        return interaction.reply({ content: `🥾 Removed <@${targetId}> from the channel.`, ephemeral: true });
      }
      if (interaction.customId === PANEL_ID.PERMIT) {
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true }).catch(() => null);
        return interaction.reply({ content: `✅ <@${targetId}> can now join even if locked.`, ephemeral: true });
      }
      if (interaction.customId === PANEL_ID.REJECT) {
        await channel.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false }).catch(() => null);
        const targetMember = channel.members.get(targetId);
        if (targetMember) await targetMember.voice.disconnect('Rejected by channel owner').catch(() => null);
        if (!record.rejected.includes(targetId)) record.rejected.push(targetId);
        saveGuild(interaction.guild.id, config);
        return interaction.reply({ content: `⛔ <@${targetId}> can no longer join this channel.`, ephemeral: true });
      }
      if (interaction.customId === PANEL_ID.TRANSFER) {
        record.ownerId = targetId;
        saveGuild(interaction.guild.id, config);
        await channel.permissionOverwrites.edit(targetId, {
          ManageChannels: true, MoveMembers: true, MuteMembers: true, DeafenMembers: true
        }).catch(() => null);
        return interaction.reply({ content: `👑 Ownership transferred to <@${targetId}>.` });
      }
    }
  }
};
