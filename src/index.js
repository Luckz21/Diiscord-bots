// ============================================================
//  Discord Roblox Bot v5.0
//  Comandos: slash (/) y prefijo (! o ?)
//  Base de datos: Upstash Redis (via HTTP, sin SSL issues)
//  Funciones: verificación, perfil, presencia, roles automáticos
// ============================================================

const {
  Client, GatewayIntentBits, EmbedBuilder,
  REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

// ── Variables de entorno ─────────────────────────────────────
const TOKEN        = process.env.DISCORD_TOKEN;
const CLIENT_ID    = process.env.CLIENT_ID;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
const REDIS_URL    = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN  = process.env.UPSTASH_REDIS_REST_TOKEN;
const PREFIXES     = ['!', '?'];

// Validar variables obligatorias al arrancar
if (!TOKEN)                    { console.error('❌ Falta DISCORD_TOKEN');  process.exit(1); }
if (!CLIENT_ID)                { console.error('❌ Falta CLIENT_ID');      process.exit(1); }
if (!REDIS_URL || !REDIS_TOKEN){ console.error('❌ Faltan variables de Upstash'); process.exit(1); }

// ── Upstash Redis (HTTP puro, sin librería externa) ──────────
// Guardamos cada usuario como user:{discordId}
// Guardamos config del servidor como guild:{guildId}

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function redisSet(key, value) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(value) }),
  });
}

async function redisDel(key) {
  await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
}

// Atajos para usuarios y configuración de servidores
const getUser       = (id)       => redisGet(`user:${id}`);
const saveUser      = (id, data) => redisSet(`user:${id}`, { discordId: id, ...data });
const deleteUser    = (id)       => redisDel(`user:${id}`);
const getGuildConf  = (id)       => redisGet(`guild:${id}`);
const saveGuildConf = (id, data) => redisSet(`guild:${id}`, data);

// Verificaciones pendientes (en memoria, expiran en 10 min)
const pendingVerifications = {};

// ── API de Roblox ────────────────────────────────────────────

async function robloxFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (ROBLOX_COOKIE) headers['Cookie'] = `.ROBLOSECURITY=${ROBLOX_COOKIE}`;
  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function getRobloxUserByName(username) {
  const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  return data?.data?.[0] ?? null;
}

const getRobloxProfile    = (id) => robloxFetch(`https://users.roblox.com/v1/users/${id}`);
const getRobloxFriends    = async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends/count`))?.count ?? 0;
const getRobloxFollowers  = async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followers/count`))?.count ?? 0;
const getRobloxFollowing  = async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followings/count`))?.count ?? 0;

async function getRobloxAvatar(id) {
  const data = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png`);
  return data?.data?.[0]?.imageUrl ?? null;
}

async function getRobloxGroups(id) {
  const data = await robloxFetch(`https://groups.roblox.com/v1/users/${id}/groups/roles`);
  return data?.data ?? [];
}

async function getRobloxPresence(id) {
  const data = await robloxFetch('https://presence.roblox.com/v1/presence/users', {
    method: 'POST',
    body: JSON.stringify({ userIds: [id] }),
  });
  return data?.userPresences?.[0] ?? null;
}

async function getGameName(universeId) {
  if (!universeId) return null;
  const data = await robloxFetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
  return data?.data?.[0]?.name ?? null;
}

// ── Helpers ──────────────────────────────────────────────────

function generateCode() {
  return 'RBX-' + Math.random().toString(36).substring(2, 9).toUpperCase();
}

// Convierte el tipo de presencia de Roblox en texto legible
function presenceInfo(type) {
  const map = {
    0: { label: '⚫ Desconectado',           color: 0x99AAB5 },
    1: { label: '🟢 Conectado (web o app)',   color: 0x57F287 },
    2: { label: '🎮 Jugando en este momento', color: 0x00B0F4 },
    3: { label: '🛠️ En Roblox Studio',        color: 0xFEE75C },
  };
  return map[type] ?? { label: '❓ Desconocido', color: 0x99AAB5 };
}

// Asigna roles al usuario según la configuración del servidor
async function syncRoles(guild, discordId, robloxId) {
  const config = await getGuildConf(guild.id);
  if (!config) return;

  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;

  const rolesToAdd = [];

  // Rol de "Verificado" básico
  if (config.verifiedRoleId) rolesToAdd.push(config.verifiedRoleId);

  // Roles basados en grupos de Roblox
  if (config.bindings?.length > 0) {
    const groups = await getRobloxGroups(robloxId);
    for (const binding of config.bindings) {
      const membership = groups.find(g => String(g.group.id) === String(binding.groupId));
      if (membership && membership.role.rank >= binding.minRank) {
        rolesToAdd.push(binding.roleId);
      }
    }
  }

  for (const roleId of rolesToAdd) {
    await member.roles.add(roleId).catch(e => console.error(`No pude agregar rol ${roleId}:`, e.message));
  }
}

// ── Definición de comandos slash ─────────────────────────────

const slashDefs = [
  new SlashCommandBuilder().setName('verificar').setDescription('Vincula tu cuenta de Roblox con Discord').addStringOption(o => o.setName('usuario').setDescription('Tu usuario de Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('confirmar').setDescription('Confirma tu verificación después de poner el código'),
  new SlashCommandBuilder().setName('perfil').setDescription('Muestra el perfil de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('avatar').setDescription('Muestra el avatar de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('estado').setDescription('Muestra si está conectado o jugando en Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('grupos').setDescription('Muestra los grupos de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('buscar').setDescription('Busca info pública de cualquier usuario de Roblox').addStringOption(o => o.setName('usuario').setDescription('Usuario de Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('actualizar').setDescription('Re-sincroniza tus roles de Discord con tu cuenta de Roblox'),
  new SlashCommandBuilder().setName('desvincular').setDescription('Desvincula tu cuenta de Roblox'),
  new SlashCommandBuilder().setName('ayuda').setDescription('Muestra todos los comandos disponibles'),
  new SlashCommandBuilder().setName('setverifiedrole').setDescription('[Admin] Define el rol que se da al verificarse').addRoleOption(o => o.setName('rol').setDescription('El rol a asignar').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('bindrole').setDescription('[Admin] Vincula un grupo de Roblox a un rol de Discord').addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo de Roblox').setRequired(true)).addIntegerOption(o => o.setName('rango_minimo').setDescription('Rango mínimo requerido (0-255)').setRequired(true)).addRoleOption(o => o.setName('rol').setDescription('Rol de Discord a asignar').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('unbindrole').setDescription('[Admin] Elimina la vinculación de un grupo').addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo de Roblox').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('listroles').setDescription('[Admin] Lista todas las vinculaciones de roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map(c => c.toJSON());

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashDefs });
    console.log('✅ Comandos slash registrados globalmente');
  } catch (e) {
    console.error('Error registrando comandos slash:', e.message);
  }
}

// ── Lógica de cada comando ────────────────────────────────────
// Todas estas funciones reciben un objeto "ctx" unificado
// para que funcionen igual con slash (/) que con prefijo (!/?).

async function cmdVerificar(ctx, robloxUsername) {
  if (!robloxUsername) return ctx.reply('❌ Debes proporcionar tu usuario de Roblox.');

  const robloxUser = await getRobloxUserByName(robloxUsername);
  if (!robloxUser) return ctx.reply('❌ No encontré ese usuario en Roblox. Revisa el nombre.');

  const code = generateCode();
  pendingVerifications[ctx.userId] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };

  const embed = new EmbedBuilder()
    .setTitle('🔐 Verificación de cuenta Roblox')
    .setColor(0xFFAA00)
    .setDescription(
      `**Paso 1:** Ve a tu perfil de Roblox\n` +
      `**Paso 2:** Edita tu **descripción** y agrega este código:\n\n` +
      `\`\`\`${code}\`\`\`\n` +
      `**Paso 3:** Vuelve aquí y usa \`/confirmar\` o \`!confirmar\`\n\n` +
      `⏱️ Tienes **10 minutos**. Después puedes borrar el código.`
    )
    .addFields({ name: '👤 Cuenta detectada', value: `**${robloxUser.name}** · ID: \`${robloxUser.id}\`` });

  ctx.reply({ embeds: [embed] });

  // Expirar verificación pendiente automáticamente
  setTimeout(() => {
    if (pendingVerifications[ctx.userId]?.code === code)
      delete pendingVerifications[ctx.userId];
  }, 10 * 60 * 1000);
}

async function cmdConfirmar(ctx) {
  const pending = pendingVerifications[ctx.userId];
  if (!pending) return ctx.reply('❌ No tienes verificación pendiente. Usa `/verificar <usuario>` primero.');

  const profile = await getRobloxProfile(pending.robloxId);
  if (!profile) return ctx.reply('❌ No pude acceder al perfil de Roblox. Intenta de nuevo.');

  if (!(profile.description ?? '').includes(pending.code))
    return ctx.reply(`❌ No encontré el código \`${pending.code}\` en la descripción de **${pending.robloxUsername}**.\nEspera unos segundos y vuelve a intentar.`);

  // Guardar en Redis
  await saveUser(ctx.userId, {
    robloxId: pending.robloxId,
    robloxUsername: pending.robloxUsername,
    verifiedAt: new Date().toISOString(),
    privacyPresence: false, // por defecto, presencia privada
    privacyProfile: true,   // por defecto, perfil público
  });
  delete pendingVerifications[ctx.userId];

  // Asignar roles automáticamente
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);

  const embed = new EmbedBuilder()
    .setTitle('✅ ¡Cuenta verificada!')
    .setColor(0x57F287)
    .setDescription(
      `Tu Discord quedó vinculado a **${pending.robloxUsername}**.\n\n` +
      `• Tu perfil es **visible** para otros ✅\n` +
      `• Tu presencia en juegos es **privada** 🔒\n\n` +
      `Usa \`!permitir presencia\` si quieres que otros vean en qué juegas.`
    );

  ctx.reply({ embeds: [embed] });
}

async function cmdPerfil(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry = await getUser(target.id);

  if (!entry) {
    const who = target.id === ctx.userId ? 'No tienes' : `**${target.username}** no tiene`;
    return ctx.reply(`❌ ${who} una cuenta de Roblox vinculada.`);
  }
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const [profile, avatarUrl, friends, followers, following, groups] = await Promise.all([
    getRobloxProfile(entry.robloxId),
    getRobloxAvatar(entry.robloxId),
    getRobloxFriends(entry.robloxId),
    getRobloxFollowers(entry.robloxId),
    getRobloxFollowing(entry.robloxId),
    getRobloxGroups(entry.robloxId),
  ]);

  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  const groupList = groups.length
    ? groups.slice(0, 5).map(g => `• [${g.group.name}](https://www.roblox.com/groups/${g.group.id})`).join('\n')
    : '_Sin grupos_';

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${profile.displayName} (@${profile.name})`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2)
    .setThumbnail(avatarUrl)
    .addFields(
      { name: '🆔 ID de Roblox', value: `\`${entry.robloxId}\``, inline: true },
      { name: '📅 Cuenta creada', value: createdAt, inline: true },
      { name: '👥 Amigos', value: `${friends}`, inline: true },
      { name: '👣 Seguidores', value: `${followers}`, inline: true },
      { name: '➡️ Siguiendo', value: `${following}`, inline: true },
      { name: '🏰 Grupos', value: `${groups.length}`, inline: true },
      { name: '📝 Descripción', value: profile.description?.slice(0, 300) || '_Sin descripción_' },
      { name: `🏰 Grupos (${Math.min(groups.length, 5)} de ${groups.length})`, value: groupList },
    )
    .setFooter({ text: `Vinculado por ${target.username}` })
    .setTimestamp();

  ctx.reply({ embeds: [embed] });
}

async function cmdAvatar(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry = await getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const avatarUrl = await getRobloxAvatar(entry.robloxId);
  if (!avatarUrl) return ctx.reply('❌ No pude cargar el avatar de Roblox.');

  const embed = new EmbedBuilder()
    .setTitle(`🎭 Avatar de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2)
    .setImage(avatarUrl)
    .setFooter({ text: `Solicitado por ${ctx.username}` });

  ctx.reply({ embeds: [embed] });
}

async function cmdEstado(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry = await getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta de Roblox vinculada.`);

  const isSelf = target.id === ctx.userId;
  if (!isSelf && !entry.privacyPresence)
    return ctx.reply(`🔒 **${target.username}** no ha permitido que otros vean su presencia.\nPuede usar \`!permitir presencia\` para habilitarlo.`);

  if (!ROBLOX_COOKIE) return ctx.reply('❌ La cookie de Roblox no está configurada en el bot.');

  const presence = await getRobloxPresence(entry.robloxId);
  if (!presence) return ctx.reply('❌ No pude obtener la presencia de Roblox. Intenta de nuevo.');

  const { label, color } = presenceInfo(presence.userPresenceType);

  const embed = new EmbedBuilder()
    .setTitle(`${label}`)
    .setDescription(`**[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)**`)
    .setColor(color);

  // Si está en un juego, mostrar cuál
  if (presence.userPresenceType === 2 && presence.universeId) {
    const gameName = await getGameName(presence.universeId);
    if (gameName) {
      embed.addFields({ name: '🕹️ Jugando', value: `[${gameName}](https://www.roblox.com/games/${presence.rootPlaceId})` });
    }
  }

  // Última vez en línea (siempre útil)
  if (presence.lastOnline) {
    const lastOnline = new Date(presence.lastOnline).toLocaleString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    embed.addFields({ name: '🕐 Última vez en línea', value: lastOnline });
  }

  embed.setFooter({ text: `Solicitado por ${ctx.username}` }).setTimestamp();
  ctx.reply({ embeds: [embed] });
}

async function cmdGrupos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry = await getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const groups = await getRobloxGroups(entry.robloxId);
  if (!groups.length) return ctx.reply(`**${entry.robloxUsername}** no pertenece a ningún grupo público.`);

  const embed = new EmbedBuilder()
    .setTitle(`🏰 Grupos de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2)
    .setDescription(
      groups.slice(0, 10).map(g =>
        `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n› Rol: ${g.role.name} · Rango: ${g.role.rank}`
      ).join('\n\n')
    )
    .setFooter({ text: `${groups.length} grupos en total · Mostrando primeros 10` });

  ctx.reply({ embeds: [embed] });
}

async function cmdBuscar(ctx, robloxUsername) {
  if (!robloxUsername) return ctx.reply('❌ Proporciona un nombre de usuario de Roblox.');

  const robloxUser = await getRobloxUserByName(robloxUsername);
  if (!robloxUser) return ctx.reply('❌ No encontré ese usuario en Roblox.');

  const [profile, avatarUrl, friends, followers, following, groups] = await Promise.all([
    getRobloxProfile(robloxUser.id),
    getRobloxAvatar(robloxUser.id),
    getRobloxFriends(robloxUser.id),
    getRobloxFollowers(robloxUser.id),
    getRobloxFollowing(robloxUser.id),
    getRobloxGroups(robloxUser.id),
  ]);

  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  const embed = new EmbedBuilder()
    .setTitle(`🔍 ${profile.displayName} (@${profile.name})`)
    .setURL(`https://www.roblox.com/users/${robloxUser.id}/profile`)
    .setColor(0xEB459E)
    .setThumbnail(avatarUrl)
    .addFields(
      { name: '🆔 ID', value: `\`${robloxUser.id}\``, inline: true },
      { name: '📅 Creado', value: createdAt, inline: true },
      { name: '👥 Amigos', value: `${friends}`, inline: true },
      { name: '👣 Seguidores', value: `${followers}`, inline: true },
      { name: '➡️ Siguiendo', value: `${following}`, inline: true },
      { name: '🏰 Grupos', value: `${groups.length}`, inline: true },
      { name: '📝 Descripción', value: profile.description?.slice(0, 300) || '_Sin descripción_' },
    )
    .setFooter({ text: 'Búsqueda pública · No requiere vinculación' });

  ctx.reply({ embeds: [embed] });
}

async function cmdActualizar(ctx) {
  const entry = await getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada. Usa `/verificar` primero.');
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  ctx.reply('✅ Tus roles han sido actualizados según tu cuenta de Roblox.');
}

async function cmdDesvincular(ctx) {
  const entry = await getUser(ctx.userId);
  if (!entry) return 
