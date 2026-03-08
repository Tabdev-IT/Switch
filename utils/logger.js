const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', 'api_debug.log');

// Create a write stream for the log file
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message) {
    try {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${message}\n`;

        // Write to stream and flush
        logStream.write(formattedMessage);

        // Also log to console for good measure
        console.log(formattedMessage.trim());
    } catch (err) {
        console.error('FAILED TO LOG:', err);
    }
}

module.exports = log;
