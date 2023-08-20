const winston = require('winston');
const DiscordTransport = require('./discordTransport');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
        new DiscordTransport({ webhookUrl: process.env.WEBHOOK_URL})
    ]
});

module.exports = logger;
