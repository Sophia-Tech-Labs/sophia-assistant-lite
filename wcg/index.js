// wcg/index.js - Main integration file
const WCGGameManager = require('./gameManager');

class WCGIntegration {
  constructor() {
    this.gameManager = new WCGGameManager();
  }

  // Initialize WCG functions for a Functions class instance
  initWCGFunctions(functionsInstance) {
    // Start WCG game
    functionsInstance.startWCG = async function() {
      try {
        if (!this.m.isGroup()) {
          const response = await this.m.callAI(
            "TOOLS",
            "Tell the user that Word Chain Game only works in groups."
          );
          await this.m.reply(response?.reply);
          return;
        }

        const result = await functionsInstance.wcgIntegration.gameManager.startGame(
          this.msg.key.remoteJid,
          this.m
        );

        if (result.success) {
          await this.m.reply(result.message);
        } else {
          await this.m.reply(result.message);
        }

      } catch (error) {
        console.error("Error in startWCG:", error);
        await this.m.reply("Sorry, couldn't start Word Chain Game. Try again?");
      }
    };

    // End WCG game
    functionsInstance.endWCG = async function() {
      try {
        const result = await functionsInstance.wcgIntegration.gameManager.endGame(
          this.msg.key.remoteJid,
          this.m,
          true // ended by user
        );

        await this.m.reply(result.message);

      } catch (error) {
        console.error("Error in endWCG:", error);
        await this.m.reply("Error ending Word Chain Game. Try again?");
      }
    };

    // Get WCG status
    functionsInstance.getWCGStatus = async function() {
      try {
        const status = functionsInstance.wcgIntegration.gameManager.getGameStatus(this.msg.key.remoteJid);
        
        if (!status) {
          await this.m.reply("No active Word Chain Game in this group.");
          return;
        }

        const { game, players } = status;
        
        let message = `🎮 **Word Chain Game Status**\n\n`;
        
        if (game.is_joining) {
          message += `⏳ **Join Period Active**\n`;
          message += `• Players joined: ${players.length}\n`;
          message += `• Type "join" to participate!\n`;
          message += `• Need at least 2 players to start\n`;
        } else {
          message += `🎯 **Game Active**\n`;
          message += `• Current word: "${game.current_word}"\n`;
          message += `• Next letter: "${game.next_letter.toUpperCase()}"\n`;
          message += `• Word size: ${game.word_size}+ letters\n`;
          message += `• Timer: ${game.timer_seconds} seconds\n`;
          message += `• Total words: ${game.successful_words}\n`;
          
          // Show current turn
          const currentPlayer = players[game.current_turn];
          if (currentPlayer) {
            message += `• Current turn: ${currentPlayer.player_name}\n`;
          }
          
          message += `\n👥 **Players (${players.length}):**\n`;
          players
            .sort((a, b) => b.score - a.score)
            .forEach((player, index) => {
              const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
              const turnIndicator = index === game.current_turn ? ' 👈' : '';
              message += `${medal} ${player.player_name}: ${player.score}${turnIndicator}\n`;
            });
        }

        await this.m.reply(message);

      } catch (error) {
        console.error("Error in getWCGStatus:", error);
        await this.m.reply("Error getting game status.");
      }
    };

    // Store reference for access to game manager
    functionsInstance.wcgIntegration = this;
  }

  // Process potential WCG messages (call this from message listener)
  async processMessage(groupId, playerJid, playerName, messageText, messageInstance) {
    try {
      const trimmedText = messageText ? messageText.trim().toLowerCase() : "";

      
      // Only process if game is active and listening
      const isListening = this.gameManager.db.isGameListening(groupId);
      
      // Handle join requests (works even if game is not actively listening, but only during join period)
      if (trimmedText === 'join') {
        const result = await this.gameManager.joinGame(groupId, playerJid, playerName, messageInstance);
        if (result.success) {
          await messageInstance.reply(result.message);
        }
        return true; // Message was processed
      }

      // Only process word attempts if game is actively listening (not in join period)
      if (!isListening) {
        return false; // Game not actively listening for words
      }

      // Handle word attempts (only process if it looks like a single word)
      if (/^[a-zA-Z]+$/.test(trimmedText)) {
        const result = await this.gameManager.processWord(
          groupId, 
          playerJid, 
          playerName, 
          trimmedText, 
          messageInstance
        );
        return result.processed;
      }

      return false; // Message not processed by WCG

    } catch (error) {
      console.error("Error processing WCG message:", error);
      return false;
    }
  }

  // Check if group has active game
  hasActiveGame(groupId) {
    const status = this.gameManager.getGameStatus(groupId);
    return status !== null;
  }

  // Check if game is actively listening for words (not in join period)
  isListeningForWords(groupId) {
    return this.gameManager.db.isGameListening(groupId);
  }

  // Cleanup method
  cleanup() {
    this.gameManager.cleanup();
  }
}

module.exports = WCGIntegration;