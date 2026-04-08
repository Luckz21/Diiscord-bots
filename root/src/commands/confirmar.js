const { SlashCommandBuilder } = require('discord.js');
const { getProfile } = require('../services/roblox');
const redis = require('../services/redis');

module.exports = {
data: new SlashCommandBuilder()
    .setName('confirmar')
    .setDescription('Confirmar verificación'),

async execute(i) {
    const data = await redis.get(`verify:${i.user.id}`);
    if (!data) return i.reply('❌ No hay verificación');

    const profile = await getProfile(data.id);

    if (!profile.description?.includes(data.code))
        return i.reply('❌ Código no encontrado');

    await redis.set(`user:${i.user.id}`, {
        robloxId: data.id,
        username: data.username
    });

    await redis.del(`verify:${i.user.id}`);

    i.reply('✅ Verificado');
}
};
