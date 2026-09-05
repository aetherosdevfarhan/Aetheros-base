const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const music = require('../utils/musicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Play music in your voice channel.')
    .addSubcommand(s =>
      s.setName('play').setDescription('Play a song or add it to the queue.')
        .addStringOption(o => o.setName('query').setDescription('Song name or YouTube URL').setRequired(true)))
    .addSubcommand(s => s.setName('skip').setDescription('Skip the current song.'))
    .addSubcommand(s => s.setName('stop').setDescription('Stop playback and clear the queue.'))
    .addSubcommand(s => s.setName('pause').setDescription('Pause playback.'))
    .addSubcommand(s => s.setName('resume').setDescription('Resume playback.'))
    .addSubcommand(s => s.setName('queue').setDescription('Show the current queue.'))
    .addSubcommand(s => s.setName('nowplaying').setDescription('Show the currently playing song.'))
    .addSubcommand(s =>
      s.setName('volume').setDescription('Set playback volume.')
        .addIntegerOption(o => o.setName('percent').setDescription('0-200').setRequired(true).setMinValue(0).setMaxValue(200)))
    .addSubcommand(s =>
      s.setName('loop').setDescription('Set loop mode.')
        .addStringOption(o =>
          o.setName('mode').setDescription('Loop mode').setRequired(true)
            .addChoices(
              { name: 'Off', value: 'off' },
              { name: 'Track', value: 'track' },
              { name: 'Queue', value: 'queue' }
            ))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'play') {
