'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── VALIDACIÓN DE ENTORNO ───────────────────────────────
const REQUIRED_ENV = [
    'DISCORD_TOKEN'
];

for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
        console.error(`❌ Missing env: ${key}`);
        process.exit(1);
    }
}

// ─── LOGGER SIMPLE ───────────────────────────────────────
const log = {
    info: (...args) => console.log('ℹ️', ...args),
    warn: (...args) => console.warn('⚠️', ...args),
    error: (...args) => console.error('❌', ...args)
};

// ─── CLIENT ─────────────────────────────────────────────
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// ─── CARGA SEGURA DE COMANDOS ───────────────────────────
function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');

    if (!fs.existsSync(commandsPath)) {
        log.warn('No commands folder found');
        return;
    }

    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

    for (const file of files) {
        const filePath = path.join(commandsPath, file);

        try {
            delete require.cache[require.resolve(filePath)];

            const command = require(filePath);

            if (!command?.data?.name || typeof command.execute !== 'function') {
                log.warn(`Invalid command: ${file}`);
                continue;
            }

            client.commands.set(command.data.name, command);
            log.info(`Loaded command: ${command.data.name}`);

        } catch (err) {
            log.error(`Failed loading ${file}:`, err.message);
        }
    }
}

// ─── EJECUCIÓN SEGURA DE COMANDOS ───────────────────────
async function executeCommand(interaction, command) {
    try {
        await command.execute(interaction);
    } catch (err) {
        log.error(`Command error [${interaction.commandName}]`, err);

        const reply = {
            content: '❌ Error interno del bot',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply).catch(() => {});
        } else {
            await interaction.reply(reply).catch(() => {});
        }
    }
}

// ─── EVENTOS ────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        log.warn(`Command not found: ${interaction.commandName}`);
        return;
    }

    await executeCommand(interaction, command);
});

// ─── READY ──────────────────────────────────────────────
client.once('ready', () => {
    log.info(`Bot online: ${client.user.tag}`);
    log.info(`Servers: ${client.guilds.cache.size}`);
});

// ─── ERRORES GLOBALES (ANTI-CRASH) ──────────────────────
process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    log.error('Uncaught Exception:', err);
});

process.on('SIGINT', () => {
    log.warn('Shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log.warn('Force stop');
    process.exit(0);
});

// ─── INICIALIZACIÓN ─────────────────────────────────────
async function start() {
    try {
        log.info('Starting bot...');

        loadCommands();

        // Web server (Railway keep alive)
        try {
            require('./web');
            log.info('Web server loaded');
        } catch {
            log.warn('Web server not loaded');
        }

        await client.login(process.env.DISCORD_TOKEN);

    } catch (err) {
        log.error('Startup failed:', err);
        process.exit(1);
    }
}

start();
