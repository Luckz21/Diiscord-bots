const { SlashCommandBuilder } = require('discord.js');
const { getUserByName } = require('../services/roblox');
const redis = require('../services/redis');

function code() {
    return 'VERIFY-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

module.exports = {
data: new SlashCommandBuilder()
    .setName('verificar')
    .setDescription('Vincular Roblox')
    .addStringOption(o => o.setName('usuario').setRequired(true)),

async execute(i) {
    const username = i.options.getString('usuario');
    const user = await getUserByName(username);

    if (!user) return i.reply('❌ Usuario no encontrado');

    const c = code();

    await redis.set(`verify:${i.user.id}`, {
        id: user.id,
        username: user.name,
        code: c
    });

    i.reply(`Pon esto en tu bio:\n\`${c}\`\nLuego usa /confirmar`);
}
};
