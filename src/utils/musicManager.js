const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType
} = require('@discordjs/voice');
const playdl = require('play-dl');

// ffmpeg-static gives us a bundled ffmpeg binary so we don't depend on the host having one installed.
try {
  const ffmpegPath = require('ffmpeg-static');
  process.env.FFMPEG_PATH = ffmpegPath;
} catch {
  // ffmpeg-static not installed — playback will fail with a clear error from @discordjs/voice.
}

// guildId -> queue
const queues = new Map();

const EMPTY_CHANNEL_TIMEOUT_MS = 60_000; // leave 60s after everyone else leaves
const IDLE_TIMEOUT_MS = 5 * 60_000;      // leave 5 min after the queue finishes

function getQueue(guildId) {
  return queues.get(guildId) || null;
}

function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return 'Live';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
