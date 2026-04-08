const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserByName, getAvatar } = require('../services/roblox');

module.exports = {
data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Avatar Roblox')
    .addStringOption(o => o.setName('usuario')),

async execute(i) {
    const username = i.options.getString('usuario');
    if (!username) return i.reply('❌ Especifica usuario');

    const user = await getUserByName(username);
    if (!user) return i.reply('❌ No encontrado');

    const avatar = await getAvatar(user.id);

    i.reply({ embeds: [new EmbedBuilder().setImage(avatar)] });
}
};
