const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserByName, getProfile, getAvatar } = require('../services/roblox');

module.exports = {
data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Perfil Roblox')
    .addStringOption(o => o.setName('usuario').setRequired(true)),

async execute(i) {
    const username = i.options.getString('usuario');

    const user = await getUserByName(username);
    if (!user) return i.reply('❌ No encontrado');

    const profile = await getProfile(user.id);
    const avatar = await getAvatar(user.id);

    const e = new EmbedBuilder()
        .setTitle(`${profile.displayName} (@${profile.name})`)
        .setThumbnail(avatar)
        .setDescription(profile.description || 'Sin descripción');

    i.reply({ embeds: [e] });
}
};
