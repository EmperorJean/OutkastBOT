const winston = require('winston');
const axios = require('axios');

// Custom transport to send logs to Discord via a webhook
class DiscordTransport extends winston.transports.Http {
    constructor(opts) {
        super(opts);
        this.webhookUrl = opts.webhookUrl;
    }

    async log(info, callback) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        try {
            await axios.post(this.webhookUrl, {
                content: "```cs\n [" + info.level + "] [" + info.message + "]```"
            });
        } catch (error) {
            console.error('Failed to send log to Discord:', error);
        }

        callback();
    }
}

module.exports = DiscordTransport;
