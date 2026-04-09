'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── VALIDACIÓN ─────────────────────────────
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ Missing DISCORD_TOKEN');
    process.exit(1);
}

// ─── LOG ─────────────────────────────────────
const log = {
    info: (...a) => console.log('ℹ️', ...a),
    warn: (...a) => console.log('⚠️', ...a),
    error: (...a) => console.log('❌', ...a),
};

// ─── CLIENT ──────────────────────────────────
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// ─── LOAD COMMANDS ───────────────────────────
function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');

    if (!fs.existsSync(commandsPath)) {
        log.warn('No commands folder found');
        return;
    }

    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

    for (const file of files) {
        try {
            const cmd = require(path.join(commandsPath, file));

            if (!cmd?.data?.name || typeof cmd.execute !== 'function') {
                log.warn(`Invalid command: ${file}`);
                continue;
            }

            client.commands.set(cmd.data.name, cmd);
            log.info(`Loaded command: ${cmd.data.name}`);

        } catch (err) {
            log.error(`Error loading ${file}:`, err.message);
        }
    }
}

// ─── COMMAND HANDLER ─────────────────────────
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;

    try {
        await cmd.execute(interaction);
    } catch (err) {
        log.error(err);
        if (!interaction.replied) {
            interaction.reply({ content: '❌ Error interno', ephemeral: true });
        }
    }
});

// ─── READY ───────────────────────────────────
client.once('ready', () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
    log.info(`Servers: ${client.guilds.cache.size}`);
});

// ─── START ───────────────────────────────────
async function start() {
    try {
        log.info('Starting bot...');

        loadCommands();

        // opcional web
        try {
            require('./web');
            log.info('Web loaded');
        } catch {}

        await client.login(process.env.DISCORD_TOKEN);

    } catch (err) {
        log.error('Startup failed:', err);
        process.exit(1);
    }
}

start();
