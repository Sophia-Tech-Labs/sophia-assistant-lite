// wcg/database.js
const Database = require("better-sqlite3")
const db = new Database("function.db");

class WCGDatabase {
  constructor() {
    this.initTables();
  }

  initTables() {
    // Main games table - UPDATED with current_turn field and total_turns
    db.prepare(`
      CREATE TABLE IF NOT EXISTS wcg_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL,
        current_word TEXT,
        next_letter TEXT,
        word_size INTEGER DEFAULT 4,
        used_words TEXT DEFAULT '[]',
        successful_words INTEGER DEFAULT 0,
        timer_seconds INTEGER DEFAULT 45,
        current_turn INTEGER DEFAULT 0,
        total_turns INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 0,
        is_joining BOOLEAN DEFAULT 0,
        join_ends_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Check if current_turn column exists, if not add it (for existing databases)
    try {
      db.prepare(`ALTER TABLE wcg_games ADD COLUMN current_turn INTEGER DEFAULT 0`).run();
    } catch (error) {
      // Column probably already exists, ignore error
    }

    // Check if total_turns column exists, if not add it
    try {
      db.prepare(`ALTER TABLE wcg_games ADD COLUMN total_turns INTEGER DEFAULT 0`).run();
    } catch (error) {
      // Column probably already exists, ignore error
    }

    // Players table - UPDATED with turn_order
    db.prepare(`
      CREATE TABLE IF NOT EXISTS wcg_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        player_jid TEXT NOT NULL,
        player_name TEXT,
        score INTEGER DEFAULT 0,
        turn_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        last_word_at DATETIME,
        timeout_count INTEGER DEFAULT 0,
        FOREIGN KEY (game_id) REFERENCES wcg_games (id)
      )
    `).run();

    // Check if turn_order column exists, if not add it
    try {
      db.prepare(`ALTER TABLE wcg_players ADD COLUMN turn_order INTEGER DEFAULT 0`).run();
    } catch (error) {
      // Column probably already exists, ignore error
    }

    // Game history for stats
    db.prepare(`
      CREATE TABLE IF NOT EXISTS wcg_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL,
        winner_jid TEXT,
        winner_name TEXT,
        total_words INTEGER,
        max_word_size INTEGER,
        players_count INTEGER,
        duration_minutes INTEGER,
        ended_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  }

  // Game management
  createGame(groupId) {
    // End any existing game in this group first
    this.endGame(groupId);
    
    const joinEndsAt = new Date(Date.now() + 35000); // 35 seconds from now
    
    return db.prepare(`
      INSERT INTO wcg_games (group_id, is_joining, join_ends_at, current_turn, total_turns)
      VALUES (?, 1, ?, 0, 0)
    `).run(groupId, joinEndsAt.toISOString());
  }

  getActiveGame(groupId) {
    return db.prepare(`
      SELECT * FROM wcg_games 
      WHERE group_id = ? AND (is_active = 1 OR is_joining = 1)
      ORDER BY created_at DESC LIMIT 1
    `).get(groupId);
  }

  startGame(gameId, startingWord) {
    const nextLetter = startingWord[startingWord.length - 1].toLowerCase();
    const usedWords = JSON.stringify([startingWord.toLowerCase()]);
    
    db.prepare(`
      UPDATE wcg_games 
      SET is_joining = 0, is_active = 1, current_word = ?, 
          next_letter = ?, used_words = ?, successful_words = 1, current_turn = 0, total_turns = 0
      WHERE id = ?
    `).run(startingWord, nextLetter, usedWords, gameId);
  }

  endGame(groupId) {
    const game = this.getActiveGame(groupId);
    if (!game) return null;

    // Save to history
    const winner = this.getGameWinner(game.id);
    const players = this.getGamePlayers(game.id);
    const duration = Math.round((Date.now() - new Date(game.created_at)) / 60000);

    if (winner) {
      db.prepare(`
        INSERT INTO wcg_history 
        (group_id, winner_jid, winner_name, total_words, max_word_size, players_count, duration_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        groupId, winner.player_jid, winner.player_name, 
        game.successful_words, game.word_size, players.length, duration
      );
    }

    // End the game
    db.prepare(`
      UPDATE wcg_games 
      SET is_active = 0, is_joining = 0 
      WHERE group_id = ?
    `).run(groupId);

    return { game, winner, players };
  }

  // Player management with turn order
  addPlayer(gameId, playerJid, playerName) {
    // Check if player already joined
    const existing = db.prepare(`
      SELECT id FROM wcg_players 
      WHERE game_id = ? AND player_jid = ?
    `).get(gameId, playerJid);

    if (existing) return false; // Already joined

    // Get next turn order
    const maxTurnOrder = db.prepare(`
      SELECT COALESCE(MAX(turn_order), -1) as max_order FROM wcg_players 
      WHERE game_id = ?
    `).get(gameId);

    const turnOrder = maxTurnOrder.max_order + 1;

    db.prepare(`
      INSERT INTO wcg_players (game_id, player_jid, player_name, turn_order)
      VALUES (?, ?, ?, ?)
    `).run(gameId, playerJid, playerName, turnOrder);

    return true;
  }

  getGamePlayers(gameId) {
    return db.prepare(`
      SELECT * FROM wcg_players 
      WHERE game_id = ? AND is_active = 1
      ORDER BY turn_order ASC
    `).all(gameId);
  }

  removePlayer(gameId, playerJid) {
    db.prepare(`
      UPDATE wcg_players 
      SET is_active = 0 
      WHERE game_id = ? AND player_jid = ?
    `).run(gameId, playerJid);
  }

  updatePlayerScore(gameId, playerJid, increment = 1) {
    db.prepare(`
      UPDATE wcg_players 
      SET score = score + ?, last_word_at = CURRENT_TIMESTAMP
      WHERE game_id = ? AND player_jid = ?
    `).run(increment, gameId, playerJid);
  }

  getGameWinner(gameId) {
    return db.prepare(`
      SELECT * FROM wcg_players 
      WHERE game_id = ? AND is_active = 1
      ORDER BY score DESC LIMIT 1
    `).get(gameId);
  }

  // Turn management
  setCurrentTurn(gameId, turnIndex) {
    // Increment total turns when setting new turn
    db.prepare(`
      UPDATE wcg_games 
      SET current_turn = ?, total_turns = total_turns + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(turnIndex, gameId);
  }

  getCurrentTurn(gameId) {
    const result = db.prepare(`
      SELECT current_turn FROM wcg_games 
      WHERE id = ?
    `).get(gameId);
    return result ? result.current_turn : 0;
  }

  // Game state management
  updateGameWord(gameId, word, nextLetter) {
    const game = db.prepare(`SELECT used_words, successful_words, total_turns FROM wcg_games WHERE id = ?`).get(gameId);
    
    const usedWords = JSON.parse(game.used_words || '[]');
    usedWords.push(word.toLowerCase());
    
    const successfulWords = game.successful_words + 1;
    
    // Calculate new word size (increase every 5-7 words randomly)
    let newWordSize = db.prepare(`SELECT word_size FROM wcg_games WHERE id = ?`).get(gameId).word_size;
    if (successfulWords > 0 && successfulWords % (Math.floor(Math.random() * 3) + 5) === 0) {
      newWordSize++;
    }
    
    // Calculate new timer based on TOTAL TURNS (every 6-7 turns, minimum 25 seconds)
    let newTimer = db.prepare(`SELECT timer_seconds FROM wcg_games WHERE id = ?`).get(gameId).timer_seconds;
    const totalTurns = game.total_turns + 1; // +1 because this turn is about to complete
    
    // Decrease timer every 6-7 turns randomly
    if (totalTurns > 0 && totalTurns % (Math.floor(Math.random() * 2) + 6) === 0) {
      newTimer = Math.max(25, newTimer - 5); // Minimum 25 seconds
    }

    db.prepare(`
      UPDATE wcg_games 
      SET current_word = ?, next_letter = ?, used_words = ?, 
          successful_words = ?, word_size = ?, timer_seconds = ?, 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(word, nextLetter, JSON.stringify(usedWords), successfulWords, newWordSize, newTimer, gameId);
  }

  getPlayerCount(gameId) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM wcg_players 
      WHERE game_id = ? AND is_active = 1
    `).get(gameId).count;
  }

  // Helper methods
  isWordUsed(gameId, word) {
    const game = db.prepare(`SELECT used_words FROM wcg_games WHERE id = ?`).get(gameId);
    const usedWords = JSON.parse(game.used_words || '[]');
    return usedWords.includes(word.toLowerCase());
  }

  getGameStats(groupId, limit = 10) {
    return db.prepare(`
      SELECT * FROM wcg_history 
      WHERE group_id = ? 
      ORDER BY ended_at DESC 
      LIMIT ?
    `).all(groupId, limit);
  }

  // Check if game is actively listening for words (is_active = 1)
  isGameListening(groupId) {
    const game = this.getActiveGame(groupId);
    return game && game.is_active === 1;
  }
}

module.exports = WCGDatabase;