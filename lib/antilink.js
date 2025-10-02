const path = require('path');
const Database = require('better-sqlite3');

// open your functions.db (already exists)
const dbPath = path.join(__dirname, '../function.db');
const db = new Database(dbPath);

// make sure the table exists
db.prepare(`
    CREATE TABLE IF NOT EXISTS link_detection (
        groupJid TEXT PRIMARY KEY
    )
`).run();

// Add a group to the active list
const enableLinkDetection = (groupJid) => {
    try {
        db.prepare('INSERT OR IGNORE INTO link_detection (groupJid) VALUES (?)').run(groupJid);
    } catch (err) {
        console.error('Error enabling link detection:', err);
    }
};

// Remove a group from the active list
const disableLinkDetection = (groupJid) => {
    try {
        db.prepare('DELETE FROM link_detection WHERE groupJid = ?').run(groupJid);
    } catch (err) {
        console.error('Error disabling link detection:', err);
    }
};

// Check if a group has link detection enabled
const isLinkDetectionEnabled = (groupJid) => {
    try {
        const row = db.prepare('SELECT 1 FROM link_detection WHERE groupJid = ?').get(groupJid);
        return !!row;
    } catch (err) {
        console.error('Error checking link detection:', err);
        return false;
    }
};

// (optional) Get all groups with detection enabled
const getActiveLinkDetectionGroups = () => {
    try {
        const rows = db.prepare('SELECT groupJid FROM link_detection').all();
        return rows.map(r => r.groupJid);
    } catch (err) {
        console.error('Error fetching active groups:', err);
        return [];
    }
};

module.exports = {
    enableLinkDetection,
    disableLinkDetection,
    isLinkDetectionEnabled,
    getActiveLinkDetectionGroups
};
