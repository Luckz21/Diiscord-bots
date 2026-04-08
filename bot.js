const { Client, GatewayIntentBits, ActivityType } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Tu Discord User ID (no el nombre, el ID numérico)
const TARGET_USER_ID = process.env.TARGET_USER_ID;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStatusEmoji(status) {
  const map = {
    online: '🟢',
    idle: '🌙',
    dnd: '🔴',
    offline: '⚫',
    invisible: '⚫',
  };
  return map[status] ?? '❓';
}

function getStatusLabel(status) {
  const map = {
    online: 'Conectado',
    idle: 'Ausente',
    dnd: 'No molestar',
    offline: 'Desconectado',
    invisible: 'Invisible',
  };
  return map[status] ?? 'Desconocido';
}

function buildStatusReport(member) {
  const presence = member.presence;

  if (!presence || presence.status === 'offline') {
    return `⚫ **${member.user.username}** está **desconectado**.`;
  }

  const statusEmoji = getStatusEmoji(presence.status);
  const statusLabel = getStatusLabel(presence.status);

  // Busca si está jugando algo
  const gameActivity = presence.activities.find(
    (a) => a.type === ActivityType.Playing
  );
  const streamActivity = presence.activities.find(
    (a) => a.type === ActivityType.Streaming
  );
  const customActivity = presence.activities.find(
    (a) => a.type === ActivityType.Custom
  );

  let lines = [
    `${statusEmoji} **${member.user.username}** — ${statusLabel}`,
  ];

  if (gameActivity) {
    lines.push(`🎮 Jugando: **${gameActivity.name}**`);
    if (gameActivity.details) lines.push(`   › ${gameActivity.details}`);
    if (gameActivity.state)   lines.push(`   › ${gameActivity.state}`);
  }

  if (streamActivity) {
    lines.push(`📡 Streaming: **${streamActivity.name}**`);
    if (streamActivity.url) lines.push(`   › ${streamActivity.url}`);
  }

  if (customActivity?.state) {
    lines.push(`💬 Estado: ${customActivity.state}`);
  }

  if (!gameActivity && !streamActivity && !customActivity) {
    lines.push('_(Sin actividad detectada)_');
  }

  return lines.join('\n');
}

// ─── Eventos ────────────────────────────────────────────────────────────────

client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  console.log(`🎯 Monitoreando User ID: ${TARGET_USER_ID}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  // Comando: !estado
  if (content === '!estado') {
    if (!TARGET_USER_ID) {
      return message.reply('❌ No se configuró TARGET_USER_ID en el entorno.');
    }

    try {
      // Intentar buscar el miembro en el servidor donde se envió el mensaje
      const member = await message.guild.members.fetch(TARGET_USER_ID).catch(() => null);

      if (!member) {
        return message.reply(`❌ No encontré al usuario con ID \`${TARGET_USER_ID}\` en este servidor.`);
      }

      const report = buildStatusReport(member);
      return message.reply(report);
    } catch (err) {
      console.error(err);
      return message.reply('❌ Ocurrió un error al consultar el estado.');
    }
  }

  // Comando: !ayuda
  if (content === '!ayuda') {
    return message.reply(
      '**Comandos disponibles:**\n' +
      '`!estado` — Muestra si estás conectado, desconectado o jugando.\n' +
      '`!ayuda`  — Muestra este mensaje.'
    );
  }
});

// ─── Inicio ─────────────────────────────────────────────────────────────────

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('❌ Falta la variable de entorno DISCORD_TOKEN');
  process.exit(1);
}

client.login(TOKEN);
