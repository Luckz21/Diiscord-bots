const { SlashCommandBuilder } = require('discord.js');
const { getUserByName, getInventory } = require('../services/roblox');

module.exports = {
data: new SlashCommandBuilder()
    .setName('inventario')
    .setDescription('Inventario Roblox')
    .addStringOption(o => o.setName('usuario').setRequired(true)),

async execute(i) {
    const username = i.options.getString('usuario');

    const user = await getUserByName(username);
    if (!user) return i.reply('❌ No encontrado');

    const inv = await getInventory(user.id);

    if (!inv.data?.length)
        return i.reply('❌ Inventario privado o vacío');

    const items = inv.data.slice(0, 5).map(i => i.name).join('\n');

    i.reply(`🎒 ${username}:\n${items}`);
}
};
