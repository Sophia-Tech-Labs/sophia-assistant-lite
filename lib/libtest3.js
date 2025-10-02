const path = require('path');
const Database = require('better-sqlite3');

// Open your existing functions.db
const dbPath = path.join(__dirname, '../function.db');
const db = new Database(dbPath);

// Ensure the table exists
db.prepare(`
    CREATE TABLE IF NOT EXISTS warnings (
        groupJid TEXT,
        participant TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (groupJid, participant)
    )
`).run();

// Increment warning count for a participant
const incrementWarning = (groupJid, participant) => {
    // insert row if not exists
    db.prepare(`
        INSERT INTO warnings (groupJid, participant, count)
        VALUES (?, ?, 0)
        ON CONFLICT(groupJid, participant) DO NOTHING
    `).run(groupJid, participant);

    // increment count
    db.prepare(`
        UPDATE warnings
        SET count = count + 1
        WHERE groupJid = ? AND participant = ?
    `).run(groupJid, participant);

    // return new count
    const row = db.prepare(`
        SELECT count FROM warnings
        WHERE groupJid = ? AND participant = ?
    `).get(groupJid, participant);

    return row ? row.count : 0;
};

// Reset warning count for a participant
const resetWarning = (groupJid, participant) => {
    db.prepare(`
        DELETE FROM warnings
        WHERE groupJid = ? AND participant = ?
    `).run(groupJid, participant);
};

// Get current warning count
const getWarningCount = (groupJid, participant) => {
    const row = db.prepare(`
        SELECT count FROM warnings
        WHERE groupJid = ? AND participant = ?
    `).get(groupJid, participant);
    return row ? row.count : 0;
};

module.exports = {
    incrementWarning,
    resetWarning,
    getWarningCount,
};
