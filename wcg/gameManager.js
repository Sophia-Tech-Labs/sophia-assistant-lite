// wcg/gameManager.js
const WCGDatabase = require("./database");
const WCGValidator = require("./validator");

class WCGGameManager {
  constructor() {
    this.db = new WCGDatabase();
    this.validator = new WCGValidator();
    this.joinTimers = new Map(); // Store group timers
    this.playerTimers = new Map(); // Store individual player timers
    this.turnTimers = new Map(); // Store turn timers

    // Preload some common words on startup
    this.validator.preloadCommonWords();
  }

  // Start new game
  async startGame(groupId, messageInstance) {
    try {
      // Check if game already active
      const existingGame = this.db.getActiveGame(groupId);
      if (existingGame) {
        if (existingGame.is_joining) {
          return {
            success: false,
            message: `Game is already starting! Join period ends in a few seconds. Type "join" to participate!`,
          };
        } else {
          return {
            success: false,
            message: `Word Chain Game is already active in this group! Current word: "${
              existingGame.current_word
            }" | Next letter: "${existingGame.next_letter.toUpperCase()}" | Word size: ${
              existingGame.word_size
            }+`,
          };
        }
      }

      // Create new game
      const result = this.db.createGame(groupId);
      const gameId = result.lastInsertRowid;

      // Start join countdown
      this.startJoinCountdown(gameId, groupId, messageInstance);

      return {
        success: true,
        gameId: gameId,
        message: `🎮 **WORD CHAIN GAME STARTED!**\n\n📝 **Rules:**\n• Each word must start with the last letter of the previous word\n• Minimum word length starts at 4 letters\n• Word length increases as game progresses\n• You have 45 seconds per turn (decreases over time)\n• Real English words only!\n• **TURN-BASED**: Players take turns in order\n\n⏰ **JOIN NOW!** Type "join" to participate!\n⏳ Join period ends in 1 minute and 30 seconds...`,
      };
    } catch (error) {
      console.error("Error starting WCG game:", error);
      return {
        success: false,
        message: "Sorry, couldn't start the game. Try again?",
      };
    }
  }

  // Handle join countdown
  startJoinCountdown(gameId, groupId, messageInstance) {
    const timer = setTimeout(async () => {
      await this.finishJoinPeriod(gameId, groupId, messageInstance);
    }, 90000); // 35 seconds

    this.joinTimers.set(groupId, timer);
  }

  // Handle player joining
  async joinGame(groupId, playerJid, playerName, messageInstance) {
    try {
      const game = this.db.getActiveGame(groupId);

      if (!game) {
        return { success: false, message: "No active game to join!" };
      }

      if (!game.is_joining) {
        return {
          success: false,
          message: "Join period has ended! Game is already in progress.",
        };
      }

      const joined = this.db.addPlayer(
        game.id,
        playerJid,
        playerName || "Player"
      );

      if (!joined) {
        return { success: false, message: "You're already in the game!" };
      }

      const playerCount = this.db.getPlayerCount(game.id);

      return {
        success: true,
        message: `✅ Joined the game! Players: ${playerCount}`,
      };
    } catch (error) {
      console.error("Error joining WCG game:", error);
      return { success: false, message: "Error joining game. Try again?" };
    }
  }

  // Finish join period and start actual game
  async finishJoinPeriod(gameId, groupId, messageInstance) {
    try {
      const playerCount = this.db.getPlayerCount(gameId);

      if (playerCount < 2) {
        this.db.endGame(groupId);
        await messageInstance.reply(
          "❌ Not enough players joined! Need at least 2 players to start. Game cancelled."
        );
        return;
      }

      // Start the actual game
      const startingWord = this.validator.getRandomStartingWord(4);
      this.db.startGame(gameId, startingWord);

      // Set first player's turn
      this.db.setCurrentTurn(gameId, 0); // First player (index 0)

      const game = this.db.getActiveGame(groupId);
      const players = this.db.getGamePlayers(gameId);

      // Get current and next player
      const currentPlayer = players[0];
      const nextPlayer = players[1] || players[0]; // In case only 2 players

      // Extract phone numbers for mentions
      const currentPlayerPhone = this.extractPhoneNumber(
        currentPlayer.player_jid
      );
      const nextPlayerPhone = this.extractPhoneNumber(nextPlayer.player_jid);

      
      const playerList = players
        .map((p, index) => `${index + 1}. ${p.player_name}`)
        .join("\n");

      const message = `🚀 **GAME STARTED!**\n\n👥 **Players (${
        players.length
      }):**\n${playerList}\n\n🎯 **Starting word:** "${startingWord}"\n📝 **Next word must start with:** "${game.next_letter.toUpperCase()}"\n📏 **Minimum word length:** ${
        game.word_size
      } letters\n⏰ **Time limit:** ${
        game.timer_seconds
      } seconds per turn\n\n🎯 **Current turn:** @${currentPlayerPhone}\n⏭️ **Next turn:** @${nextPlayerPhone}\n\n**Your turn! Give me a word that starts with "${game.next_letter.toUpperCase()}" (${
        game.word_size
      }+ letters)**`;

      await messageInstance.mentions(message, [
          `${currentPlayerPhone}@s.whatsapp.net`,
          `${nextPlayerPhone}@s.whatsapp.net`,
        ]);

      // Start turn timer
      this.startTurnTimer(groupId, game.timer_seconds, messageInstance);

      // Clean up join timer
      if (this.joinTimers.has(groupId)) {
        clearTimeout(this.joinTimers.get(groupId));
        this.joinTimers.delete(groupId);
      }
    } catch (error) {
      console.error("Error finishing join period:", error);
    }
  }

  // Start turn timer
  startTurnTimer(groupId, seconds, messageInstance) {
    // Clear existing timer
    if (this.turnTimers.has(groupId)) {
      clearTimeout(this.turnTimers.get(groupId));
    }

    const timer = setTimeout(async () => {
      await this.handleTurnTimeout(groupId, messageInstance);
    }, seconds * 1000);

    this.turnTimers.set(groupId, timer);
  }

  // Handle turn timeout
  async handleTurnTimeout(groupId, messageInstance) {
    try {
      const game = this.db.getActiveGame(groupId);
      if (!game || !game.is_active) return;

      const players = this.db.getGamePlayers(game.id);
      const currentPlayerIndex = game.current_turn;
      const currentPlayer = players[currentPlayerIndex];

      // Remove the player who timed out
      this.db.removePlayer(game.id, currentPlayer.player_jid);

      // Get updated player list after removal
      const remainingPlayers = this.db.getGamePlayers(game.id);

      // Check if enough players remain
      if (remainingPlayers.length < 2) {
        const currentJid = this.extractPhoneNumber(currentPlayer.player_jid)
        await messageInstance.mentions(
          `⏰ @${currentJid} timed out and was removed!\n\n❌ Not enough players left! Game ended.`,[currentPlayer.player_jid]
        );
        await this.endGame(groupId, messageInstance);
        return;
      }

      // Adjust current turn index if needed
      let newTurnIndex = currentPlayerIndex;
      if (newTurnIndex >= remainingPlayers.length) {
        newTurnIndex = 0; // Wrap around to first player
      }

      this.db.setCurrentTurn(game.id, newTurnIndex);

      // Continue with next player
      const nextPlayer = remainingPlayers[newTurnIndex];
      const afterNextPlayer =
        remainingPlayers[(newTurnIndex + 1) % remainingPlayers.length];

      // Extract phone numbers for mentions
      const currentPlayerPhone = this.extractPhoneNumber(nextPlayer.player_jid);
      const nextPlayerPhone = this.extractPhoneNumber(
        afterNextPlayer.player_jid
      );
      const currentRemovedPlayer = this.extractPhoneNumber(currentPlayer.player_jid)

      const message = `⏰ @${
        currentRemovedPlayer
      } timed out and was removed! (${
        remainingPlayers.length
      } players left)\n\n🎯 **Current turn:** @${currentPlayerPhone}\n⏭️ **Next turn:** @${nextPlayerPhone}\n\n**Your turn! Give me a word that starts with "${game.next_letter.toUpperCase()}" (${
        game.word_size
      }+ letters)**`;

      await messageInstance.mentions(message, [
        `${currentRemovedPlayer}@s.whatsapp.net`,
        `${currentPlayerPhone}@s.whatsapp.net`,
        `${nextPlayerPhone}@s.whatsapp.net`,
      ]);

      // Start new turn timer
      this.startTurnTimer(groupId, game.timer_seconds, messageInstance);
    } catch (error) {
      console.error("Error handling turn timeout:", error);
    }
  }

  // Skip to next turn
  async skipToNextTurn(groupId, messageInstance, reason = "") {
    try {
      const game = this.db.getActiveGame(groupId);
      const players = this.db.getGamePlayers(game.id);

      // Move to next player
      const nextTurnIndex = (game.current_turn + 1) % players.length;
      this.db.setCurrentTurn(game.id, nextTurnIndex);

      const currentPlayer = players[nextTurnIndex];
      const nextPlayer = players[(nextTurnIndex + 1) % players.length];

      // Extract phone numbers for mentions
      const currentPlayerPhone = this.extractPhoneNumber(
        currentPlayer.player_jid
      );
      const nextPlayerPhone = this.extractPhoneNumber(nextPlayer.player_jid);

      let message = "";
      if (reason) message += `${reason}\n\n`;

      message += `🎯 **Current turn:** @${currentPlayerPhone}\n`;
      message += `⏭️ **Next turn:** @${nextPlayerPhone}\n\n`;
      message += `**Your turn! Give me a word that starts with "${game.next_letter.toUpperCase()}" (${
        game.word_size
      }+ letters)**`;

      await messageInstance.mentions(message,[
          `${currentPlayerPhone}@s.whatsapp.net`,
          `${nextPlayerPhone}@s.whatsapp.net`,
        ]);

      // Start new turn timer
      this.startTurnTimer(groupId, game.timer_seconds, messageInstance);
    } catch (error) {
      console.error("Error skipping turn:", error);
    }
  }

  // Process a word attempt
  async processWord(groupId, playerJid, playerName, word, messageInstance) {
    try {
      const game = this.db.getActiveGame(groupId);

      if (!game || !game.is_active) {
        return { processed: false }; // No active game
      }

      // Check if player is in the game
      const players = this.db.getGamePlayers(game.id);
      const playerIndex = players.findIndex((p) => p.player_jid === playerJid);

      if (playerIndex === -1) {
        return { processed: false }; // Player not in game
      }

      // Check if it's the player's turn
      if (playerIndex !== game.current_turn) {
        await messageInstance.reply(`❌ Not your turn! Wait for your turn.`);
        return { processed: true };
      }

      // Clear turn timer
      if (this.turnTimers.has(groupId)) {
        clearTimeout(this.turnTimers.get(groupId));
        this.turnTimers.delete(groupId);
      }

      // Validate the word
      const validation = await this.validator.validateWord(
        word,
        game.next_letter,
        game.word_size
      );

      if (!validation.valid) {
        await messageInstance.reply(`❌ ${validation.error}`);
        // Give them another chance, restart turn timer
        this.startTurnTimer(groupId, game.timer_seconds, messageInstance);
        return { processed: true };
      }

      // Check if word already used
      if (this.db.isWordUsed(game.id, validation.word)) {
        await messageInstance.reply(
          `❌ "${validation.word}" has already been used! Try a different word.`
        );
        // Give them another chance, restart turn timer
        this.startTurnTimer(groupId, game.timer_seconds, messageInstance);
        return { processed: true };
      }

      // Word is valid! Update game state
      const nextLetter = this.getSmartNextLetter(validation.word);
      this.db.updateGameWord(game.id, validation.word, nextLetter);
      this.db.updatePlayerScore(game.id, playerJid);

      // Get updated players list and find current player's new index
      const updatedPlayers = this.db.getGamePlayers(game.id);
      const currentPlayerNewIndex = updatedPlayers.findIndex(
        (p) => p.player_jid === playerJid
      );

      // Move to next turn (accounting for potential player removals)
      const nextTurnIndex = (currentPlayerNewIndex + 1) % updatedPlayers.length;
      this.db.setCurrentTurn(game.id, nextTurnIndex);

      // Get updated game state
      const updatedGame = this.db.getActiveGame(groupId);
      const updatedPlayer = updatedPlayers.find(
        (p) => p.player_jid === playerJid
      );

      const currentPlayer = updatedPlayers[nextTurnIndex];
      const nextPlayer =
        updatedPlayers[(nextTurnIndex + 1) % updatedPlayers.length];

      // Extract phone numbers for mentions
      const currentPlayerPhone = this.extractPhoneNumber(
        currentPlayer.player_jid
      );
      const nextPlayerPhone = this.extractPhoneNumber(nextPlayer.player_jid);

      // Prepare success message
      let message = `✅ "${validation.word}" accepted! Score: ${updatedPlayer.score}`;

      // Add milestone celebrations
      if (updatedGame.successful_words % 10 === 0) {
        message += `\n🎉 ${updatedGame.successful_words} words milestone!`;
      }

      message += `\n\n🎯 **Current turn:** @${currentPlayerPhone}`;
      message += `\n⏭️ **Next turn:** @${nextPlayerPhone}`;
      message += `\n\n**Your turn! Give me a word that starts with "${updatedGame.next_letter.toUpperCase()}" (${
        updatedGame.word_size
      }+ letters)**`;

      await messageInstance.mentions(message,[
          `${currentPlayerPhone}@s.whatsapp.net`,
          `${nextPlayerPhone}@s.whatsapp.net`,
        ]);

      // Start new turn timer
      this.startTurnTimer(groupId, updatedGame.timer_seconds, messageInstance);

      return { processed: true };
    } catch (error) {
      console.error("Error processing WCG word:", error);
      await messageInstance.reply("❌ Error processing word. Try again?");
      return { processed: true };
    }
  }

  // Smart letter selection to avoid loops and hard letters
  getSmartNextLetter(word) {
    const lastLetter = word[word.length - 1].toLowerCase();

    // Avoid hard letters and common loop letters
    const avoidLetters = ["z", "x", "q"];

    if (avoidLetters.includes(lastLetter)) {
      // Pick a random common letter instead
      const commonLetters = ["s", "t", "n", "r", "l", "d", "c", "m", "p", "b"];
      return commonLetters[Math.floor(Math.random() * commonLetters.length)];
    }

    return lastLetter;
  }

  // Extract phone number from JID
  extractPhoneNumber(jid) {
    // JID format: "1234567890@s.whatsapp.net" or "1234567890@c.us"
    return jid.split("@")[0];
  }

  // End game
  async endGame(groupId, messageInstance, endedByUser = false) {
    try {
      const result = this.db.endGame(groupId);

      if (!result) {
        return { success: false, message: "No active game to end!" };
      }

      const { game, winner, players } = result;
      const winnerPhone = this.extractPhoneNumber(winner.player_jid)
      // Clear all timers
      if (this.joinTimers.has(groupId)) {
        clearTimeout(this.joinTimers.get(groupId));
        this.joinTimers.delete(groupId);
      }

      if (this.turnTimers.has(groupId)) {
        clearTimeout(this.turnTimers.get(groupId));
        this.turnTimers.delete(groupId);
      }

      // Prepare final message
      let message = `🏁 **GAME ENDED!**\n\n`;

      if (endedByUser) {
        message += `Game ended by user request.\n\n`;
      }

      message += `📊 **Final Stats:**\n`;
      message += `• Total words: ${game.successful_words}\n`;
      message += `• Max word size: ${game.word_size}\n`;
      message += `• Players: ${players.length}\n\n`;

      if (winner && winner.score > 0) {
        message += `🏆 **Winner: @${winnerPhone}** (${winner.score} words)\n\n`;
      }

      message += `📈 **Leaderboard:**\n`;
      players
        .sort((a, b) => b.score - a.score)
        .forEach((player, index) => {
          const medal =
            index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "•";
          message += `${medal} ${player.player_name}: ${player.score} words\n`;
        });

      await messageInstance.mentions(message,[winner.player_jid]);

      return { success: true, message: "Game ended successfully!" };
    } catch (error) {
      console.error("Error ending WCG game:", error);
      return { success: false, message: "Error ending game." };
    }
  }

  // Get game status
  getGameStatus(groupId) {
    const game = this.db.getActiveGame(groupId);
    if (!game) return null;

    const players = this.db.getGamePlayers(game.id);

    return {
      game,
      players,
      playerCount: players.length,
    };
  }

  // Cleanup method
  cleanup() {
    // Clear all timers
    for (const timer of this.joinTimers.values()) {
      clearTimeout(timer);
    }
    this.joinTimers.clear();

    for (const timer of this.playerTimers.values()) {
      clearTimeout(timer);
    }
    this.playerTimers.clear();

    for (const timer of this.turnTimers.values()) {
      clearTimeout(timer);
    }
    this.turnTimers.clear();

    // Clear word cache
    this.validator.clearCache();
  }
}

module.exports = WCGGameManager;
