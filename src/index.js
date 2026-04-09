require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
});

async function start() {
    try {
        console.log('Starting bot...');
        await client.login(process.env.DISCORD_TOKEN);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

start();
