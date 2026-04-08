const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { MongoClient } = require('mongodb');

// ─── MongoDB ─────────────────────────────────────────────────────────────────

const mongoClient = new MongoClient(process.env.MONGODB_URI);
let db;

async function connectDB() {
  await mongoClient.connect();
  db = mongoClient.db('botRoblox');
  console.log('✅ Conectado a MongoDB');
}

async function getUser(discordId) {
  return db.collection('users').findOne({ discordId });
}

async function saveUser(discordId, data) {
  await db.collection('users').updateOne(
    { discordId },
    { $set: { discordId, ...data } },
    { upsert: true }
  );
}

async function deleteUser(discordId) {
  await db.collection('users').deleteOne({ discordId });
}

// ─── Discord ──────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const pendingVerifications = {};
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

// ─── API Roblox ───────────────────────────────────────────────────────────────

async function robloxFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (ROBLOX_COOKIE) headers['Cookie'] = `.ROBLOSECURITY=${ROBLOX_COOKIE}`;
  const res = await fetch(url, { ...options, headers });
  return res.json();
}

async function getRobloxUserByName(username) {
  const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  return data.data?.[0] ?? null;
}

async function getRobloxProfile(userId) {
  return robloxFetch(`https://users.roblox.com/v1/users/${userId}`);
}

async function getRobloxAvatar(userId) {
  const data = await robloxFetch(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png`
  );
  return data.data?.[0]?.imageUrl ?? null;
}

async function getRobloxFriendCount(userId) {
  const data = await robloxFetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`);
  return data.count ?? 0;
}

async function getRobloxFollowerCount(userId) {
  const data = await robloxFetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`);
  return data.count ?? 0;
}

async function getRobloxFollowingCount(userId) {
  const data = await robloxFetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`);
  return data.count ?? 0;
}

async function getRobloxGroups(userId) {
  const data = await robloxFetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
  return data.data?.slice(0, 8) ?? [];
}

async function getRobloxPresence(userId) {
  const data = await robloxFetch('https://presence.roblox.com/v1/presence/users', {
    method: 'POST',
    body: JSON.stringify({ userIds: [userId] }),
  });
  return data.userPresences?.[0] ?? null;
}

async function getGameName(universeId) {
  if (!universeId) return null;
  const data = await robloxFetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
  return data.data?.[0]?.name ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode() {
  return 'VERIFY-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getPresenceLabel(type) {
  return { 0: '⚫ Desconectado', 1: '🟢 En línea', 2: '🎮 En un juego', 3: '🛠️ En Roblox Studio' }[type] ?? '❓ Desconocido';
}

async function assignVerifiedRole(guild, discordId) {
  const roleId = process.env.VERIFIED_ROLE_ID;
  if (!roleId) return;
  try {
    const member = await guild.members.fetch(discordId);
    await member.roles.add(roleId);
  } catch (e) {
    console.error('No pude asignar el rol:', e.message);
  }
}

// ─── Comandos ─────────────────────────────────────────────────────────────────

const commands = {

  async ayuda(message) {
    const embed = new EmbedBuilder()
      .setTitle('📋 Comandos disponibles')
      .setColor(0x5865F2)
      .addFields(
        { name: '🔐 Verificación', value: '`!verificar <usuario>` — Vincula tu cuenta de Roblox\n`!confirmar` — Confirma la verificación\n`!desvincular` — Desvincula tu cuenta' },
        { name: '👤 Perfil', value: '`!perfil [@usuario]` — Perfil completo\n`!avatar [@usuario]` — Avatar de Roblox\n`!grupos [@usuario]` — Grupos de Roblox\n`!buscar <usuario>` — Busca cualquier usuario de Roblox' },
        { name: '🎮 Presencia', value: '`!jugando [@usuario]` — Ver en qué juego está\n`!permitir presencia` — Permitir que vean tu juego\n`!permitir perfil` — Permitir que vean tu perfil\n`!bloquear presencia` — Ocultar tu juego\n`!bloquear perfil` — Ocultar tu perfil' },
        { name: 'ℹ️ Otros', value: '`!estado [@usuario]` — Estado de Discord\n`!ayuda` — Este mensaje' },
      )
      .setFooter({ text: 'Bot de verificación Roblox' });
    message.reply({ embeds: [embed] });
  },

  async verificar(message, args) {
    const username = args[0];
    if (!username) return message.reply('❌ Uso: `!verificar <tu_usuario_roblox>`');

    const robloxUser = await getRobloxUserByName(username).catch(() => null);
    if (!robloxUser) return message.reply('❌ No encontré ese usuario en Roblox.');

    const code = generateCode();
    pendingVerifications[message.author.id] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };

    const embed = new EmbedBuilder()
      .setTitle('🔐 Verificación de cuenta Roblox')
      .setColor(0xFFAA00)
      .setDescription(
        `**Paso 1:** Ve a tu perfil de Roblox\n` +
        `**Paso 2:** Edita tu **descripción** y agrega este código:\n\n` +
        `\`\`\`${code}\`\`\`\n` +
        `**Paso 3:** Escribe \`!confirmar\` aquí\n\n` +
        `⏱️ Tienes **10 minutos**. Después puedes borrar el código.`
      )
      .addFields({ name: '👤 Usuario detectado', value: `**${robloxUser.name}** (ID: ${robloxUser.id})` });

    message.reply({ embeds: [embed] });
    setTimeout(() => {
      if (pendingVerifications[message.author.id]?.code === code)
        delete pendingVerifications[message.author.id];
    }, 10 * 60 * 1000);
  },

  async confirmar(message) {
    const pending = pendingVerifications[message.author.id];
    if (!pending) return message.reply('❌ No tienes verificación pendiente. Usa `!verificar <usuario>` primero.');

    const profile = await getRobloxProfile(pending.robloxId).catch(() => null);
    if (!profile) return message.reply('❌ No pude acceder al perfil de Roblox.');

    if (!(profile.description ?? '').includes(pending.code))
      return message.reply(`❌ No encontré el código \`${pending.code}\` en la descripción de **${pending.robloxUsername}**.\nEspera unos segundos e intenta de nuevo.`);

    await saveUser(message.author.id, {
      robloxId: pending.robloxId,
      robloxUsername: pending.robloxUsername,
      verifiedAt: new Date().toISOString(),
      privacyPresence: false,
      privacyProfile: true,
    });
    delete pendingVerifications[message.author.id];
    await assignVerifiedRole(message.guild, message.author.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ ¡Cuenta verificada!')
      .setColor(0x57F287)
      .setDescription(
        `Vinculado a **${pending.robloxUsername}**.\n\n` +
        `Por defecto:\n` +
        `• Tu perfil es **visible** ✅\n` +
        `• Tu presencia en juegos es **privada** 🔒\n\n` +
        `Usa \`!permitir presencia\` si quieres que otros vean en qué juego estás.`
      );
    message.reply({ embeds: [embed] });
  },

  async permitir(message, args) {
    const tipo = args[0]?.toLowerCase();
    if (!['presencia', 'perfil'].includes(tipo))
      return message.reply('❌ Uso: `!permitir presencia` o `!permitir perfil`');

    const entry = await getUser(message.author.id);
    if (!entry) return message.reply('❌ No tienes cuenta vinculada. Usa `!verificar` primero.');

    const field = tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile';
    await saveUser(message.author.id, { ...entry, [field]: true });

    const label = tipo === 'presencia' ? 'presencia en juegos' : 'perfil público';
    message.reply(`✅ Ahora otros pueden ver tu **${label}**.`);
  },

  async bloquear(message, args) {
    const tipo = args[0]?.toLowerCase();
    if (!['presencia', 'perfil'].includes(tipo))
      return message.reply('❌ Uso: `!bloquear presencia` o `!bloquear perfil`');

    const entry = await getUser(message.author.id);
    if (!entry) return message.reply('❌ No tienes cuenta vinculada.');

    const field = tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile';
    await saveUser(message.author.id, { ...entry, [field]: false });

    const label = tipo === 'presencia' ? 'presencia en juegos' : 'perfil público';
    message.reply(`🔒 Tu **${label}** ahora es privada.`);
  },

  async jugando(message) {
    const target = message.mentions.users.first() ?? message.author;
    const entry = await getUser(target.id);

    if (!entry) return message.reply(`❌ **${target.username}** no tiene cuenta de Roblox vinculada.`);

    const isSelf = target.id === message.author.id;
    if (!isSelf && !entry.privacyPresence)
      return message.reply(`🔒 **${target.username}** no ha permitido que otros vean su presencia.\nPuede usar \`!permitir presencia\` para habilitarlo.`);

    if (!ROBLOX_COOKIE) return message.reply('❌ El bot no tiene configurada la cookie de Roblox.');

    const presence = await getRobloxPresence(entry.robloxId).catch(() => null);
    if (!presence) return message.reply('❌ No pude obtener la presencia de Roblox.');

    const statusLabel = getPresenceLabel(presence.userPresenceType);
    let gameName = null;
    if (presence.universeId) gameName = await getGameName(presence.universeId).catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle(`🎮 Presencia de ${entry.robloxUsername}`)
      .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
      .setColor(presence.userPresenceType === 2 ? 0x57F287 : 0x99AAB5)
      .addFields({ name: 'Estado', value: statusLabel });

    if (gameName) {
      embed.addFields(
        { name: '🕹️ Jugando', value: gameName },
        { name: '🔗 Link', value: `https://www.roblox.com/games/${presence.rootPlaceId}` }
      );
    }

    if (presence.lastOnline) {
      embed.addFields({ name: '🕐 Última vez en línea', value: new Date(presence.lastOnline).toLocaleString('es-ES') });
    }

    embed.setFooter({ text: `Solicitado por ${message.author.username}` }).setTimestamp();
    message.reply({ embeds: [embed] });
  },

  async perfil(message) {
    const target = message.mentions.users.first() ?? message.author;
    const entry = await getUser(target.id);

    if (!entry) return message.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);

    const isSelf = target.id === message.author.id;
    if (!isSelf && !entry.privacyProfile)
      return message.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

    const [profile, avatarUrl, friends, followers, following, groups] = await Promise.all([
      getRobloxProfile(entry.robloxId),
      getRobloxAvatar(entry.robloxId),
      getRobloxFriendCount(entry.robloxId),
      getRobloxFollowerCount(entry.robloxId),
      getRobloxFollowingCount(entry.robloxId),
      getRobloxGroups(entry.robloxId),
    ]);

    const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    const groupList = groups.length ? groups.map(g => `• ${g.group.name}`).join('\n') : '_Sin grupos_';

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${profile.displayName} (@${profile.name})`)
      .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
      .setColor(0x5865F2)
      .setThumbnail(avatarUrl)
      .addFields(
        { name: '🆔 ID', value: `${entry.robloxId}`, inline: true },
        { name: '📅 Creado', value: createdAt, inline: true },
        { name: '👥 Amigos', value: `${friends}`, inline: true },
        { name: '👣 Seguidores', value: `${followers}`, inline: true },
        { name: '➡️ Siguiendo', value: `${following}`, inline: true },
        { name: '🏰 Grupos', value: `${groups.length}`, inline: true },
        { name: '📝 Descripción', value: profile.description?.slice(0, 300) || '_Sin descripción_' },
        { name: `🏰 Grupos (${groups.length})`, value: groupList },
      )
      .setFooter({ text: `Vinculado por ${target.username}` })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },

  async avatar(message) {
    const target = message.mentions.users.first() ?? message.author;
    const entry = await getUser(target.id);

    if (!entry) return message.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);

    const isSelf = target.id === message.author.id;
    if (!isSelf && !entry.privacyProfile)
      return message.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

    const avatarUrl = await getRobloxAvatar(entry.robloxId);
    if (!avatarUrl) return message.reply('❌ No pude cargar el avatar.');

    const embed = new EmbedBuilder()
      .setTitle(`🎭 Avatar de ${entry.robloxUsername}`)
      .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
      .setColor(0x5865F2)
      .setImage(avatarUrl)
      .setFooter({ text: `Solicitado por ${message.author.username}` });

    message.reply({ embeds: [embed] });
  },

  async grupos(message) {
    const target = message.mentions.users.first() ?? message.author;
    const entry = await getUser(target.id);

    if (!entry) return message.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);

    const isSelf = target.id === message.author.id;
    if (!isSelf && !entry.privacyProfile)
      return message.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

    const groups = await getRobloxGroups(entry.robloxId);
    if (!groups.length) return message.reply(`**${entry.robloxUsername}** no está en ningún grupo público.`);

    const embed = new EmbedBuilder()
      .setTitle(`🏰 Grupos de ${entry.robloxUsername}`)
      .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
      .setColor(0x5865F2)
      .setDescription(
        groups.map(g =>
          `**${g.group.name}**\n› Rol: ${g.role.name} | Rango: ${g.role.rank}\n› [Ver grupo](https://www.roblox.com/groups/${g.group.id})`
        ).join('\n\n')
      )
      .setFooter({ text: `${groups.length} grupos mostrados` });

    message.reply({ embeds: [embed] });
  },

  async buscar(message, args) {
    const username = args[0];
    if (!username) return message.reply('❌ Uso: `!buscar <usuario_roblox>`');

    const robloxUser = await getRobloxUserByName(username).catch(() => null);
    if (!robloxUser) return message.reply('❌ No encontré ese usuario en Roblox.');

    const [profile, avatarUrl, friends, followers, following, groups] = await Promise.all([
      getRobloxProfile(robloxUser.id),
      getRobloxAvatar(robloxUser.id),
      getRobloxFriendCount(robloxUser.id),
      getRobloxFollowerCount(robloxUser.id),
      getRobloxFollowingCount(robloxUser.id),
      getRobloxGroups(robloxUser.id),
    ]);

    const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    const embed = new EmbedBuilder()
      .setTitle(`🔍 ${profile.displayName} (@${profile.name})`)
      .setURL(`https://www.roblox.com/users/${robloxUser.id}/profile`)
      .setColor(0xEB459E)
      .setThumbnail(avatarUrl)
      .addFields(
        { name: '🆔 ID', value: `${robloxUser.id}`, inline: true },
        { name: '📅 Creado', value: createdAt, inline: true },
        { name: '👥 Amigos', value: `${friends}`, inline: true },
        { name: '👣 Seguidores', value: `${followers}`, inline: true },
        { name: '➡️ Siguiendo', value: `${following}`, inline: true },
        { name: '🏰 Grupos', value: `${groups.length}`, inline: true },
        { name: '📝 Descripción', value: profile.description?.slice(0, 300) || '_Sin descripción_' },
      )
      .setFooter({ text: 'Búsqueda pública — sin vinculación requerida' });

    message.reply({ embeds: [embed] });
  },

  async estado(message) {
    const target = message.mentions.users.first() ?? message.author;
    const member = message.guild.members.cache.get(target.id);
    if (!member) return message.reply('❌ No encontré a ese usuario en el servidor.');

    const presence = member.presence;
    const statusMap = {
      online:  { label: 'Conectado',    emoji: '🟢', color: 0x57F287 },
      idle:    { label: 'Ausente',      emoji: '🌙', color: 0xFEE75C },
      dnd:     { label: 'No molestar',  emoji: '🔴', color: 0xED4245 },
      offline: { label: 'Desconectado', emoji: '⚫', color: 0x99AAB5 },
    };

    const status = presence?.status ?? 'offline';
    const { label, emoji, color } = statusMap[status] ?? statusMap.offline;

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${target.username} — ${label}`)
      .setColor(color)
      .setThumbnail(target.displayAvatarURL());

    const game = presence?.activities?.find(a => a.type === 0);
    if (game) {
      embed.addFields({ name: '🎮 Jugando', value: game.name });
      if (game.details) embed.addFields({ name: 'Detalle', value: game.details, inline: true });
      if (game.state)   embed.addFields({ name: 'Estado',  value: game.state,   inline: true });
    }

    const entry = await getUser(target.id);
    if (entry) {
      embed.addFields({
        name: '🎱 Roblox vinculado',
        value: `[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)`,
      });
    }

    message.reply({ embeds: [embed] });
  },

  async desvincular(message) {
    const entry = await getUser(message.author.id);
    if (!entry) return message.reply('❌ No tienes cuenta vinculada.');
    await deleteUser(message.author.id);
    message.reply(`✅ Tu cuenta **${entry.robloxUsername}** fue desvinculada.`);
  },
};

// ─── Listener ─────────────────────────────────────────────────────────────────

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const parts = message.content.slice(1).trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const handler = commands[cmd];
  if (handler) {
    try { await handler(message, args); }
    catch (e) { console.error(e); message.reply('❌ Error inesperado. Intenta de nuevo.'); }
  }
});

client.once('ready', () => console.log(`✅ Bot conectado como ${client.user.tag}`));

// ─── Inicio ───────────────────────────────────────────────────────────────────

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) { console.error('❌ Falta DISCORD_TOKEN'); process.exit(1); }
if (!process.env.MONGODB_URI) { console.error('❌ Falta MONGODB_URI'); process.exit(1); }

connectDB().then(() => client.login(TOKEN));
      
