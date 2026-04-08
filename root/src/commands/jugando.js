const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const cache = require('../utils/cache');
const cd = require('../utils/cooldown');
const { getPresence, getGameName } = require('../services/roblox');
const redis = require('../services/redis');

module.exports = {
data: new SlashCommandBuilder()
    .setName('jugando')
    .setDescription('Ver juego'),

async execute(i) {

    const c = cd(i.user.id, 'jugando');
    if (c) return i.reply({ content: `⏳ ${c.toFixed(1)}s`, ephemeral: true });

    const u = await redis.get(`user:${i.user.id}`);
    if (!u) return i.reply('❌ No vinculado');

    let p = cache.get(`p:${u.robloxId}`);
    if (!p) {
        p = await getPresence(u.robloxId);
        cache.set(`p:${u.robloxId}`, p, 30);
    }

    if (!p || p.userPresenceType !== 2)
        return i.reply('❌ No estás jugando');

    let g = cache.get(`g:${p.universeId}`);
    if (!g) {
        g = await getGameName(p.universeId);
        cache.set(`g:${p.universeId}`, g, 300);
    }

    const e = new EmbedBuilder()
        .setTitle(`🎮 ${u.username}`)
        .setDescription(g || 'Desconocido')
        .addFields({ name: 'Unirse', value: `https://www.roblox.com/games/${p.rootPlaceId}` });

    i.reply({ embeds: [e] });
}
};
