// wcg/validator.js
const axios = require('axios');

class WCGValidator {
  constructor() {
    this.cache = new Map(); // Cache valid words to reduce API calls
    this.apiDelay = 100; // Minimum delay between API calls
    this.lastApiCall = 0;
  }

  async validateWord(word, requiredStartLetter, minLength) {
    const cleanWord = word.toLowerCase().trim();
    
    // Basic validation first
    const basicValidation = this.basicValidation(cleanWord, requiredStartLetter, minLength);
    if (!basicValidation.valid) {
      return basicValidation;
    }

    // Check cache first
    if (this.cache.has(cleanWord)) {
      return { 
        valid: true, 
        word: cleanWord, 
        fromCache: true 
      };
    }

    // API validation - NO DEFINITIONS
    const apiValidation = await this.apiValidation(cleanWord);
    
    // Cache the result if valid
    if (apiValidation.valid) {
      this.cache.set(cleanWord, true);
    }

    return apiValidation;
  }

  basicValidation(word, requiredStartLetter, minLength) {
    // Check if empty
    if (!word || word.length === 0) {
      return { valid: false, error: "Word cannot be empty!" };
    }

    // Check if only letters
    if (!/^[a-zA-Z]+$/.test(word)) {
      return { valid: false, error: "Word can only contain letters!" };
    }

    // Check minimum length
    if (word.length < minLength) {
      return { valid: false, error: `Word must be at least ${minLength} letters long! Current word size: ${minLength}+` };
    }

    // Check starting letter
    if (!word.startsWith(requiredStartLetter.toLowerCase())) {
      return { valid: false, error: `Word must start with "${requiredStartLetter.toUpperCase()}"!` };
    }

    // Check if too short for basic English words
    if (word.length < 2) {
      return { valid: false, error: "Word must be at least 2 letters long!" };
    }

    return { valid: true };
  }

  async apiValidation(word) {
    try {
      // Rate limiting
      const now = Date.now();
      if (now - this.lastApiCall < this.apiDelay) {
        await new Promise(resolve => setTimeout(resolve, this.apiDelay));
      }
      this.lastApiCall = Date.now();

      // Call dictionary API - but don't include definitions in response
      const response = await axios.get(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`,
        { timeout: 5000 }
      );

      if (response.status === 200 && response.data && response.data.length > 0) {
        return { 
          valid: true, 
          word: word
          // No definition included - removed to avoid weird responses
        };
      } else {
        return { valid: false, error: `"${word}" is not a valid English word!` };
      }

    } catch (error) {
      if (error.response && error.response.status === 404) {
        return { valid: false, error: `"${word}" is not a valid English word!` };
      }
      
      // If API fails, we could fall back to accepting the word
      console.error("Dictionary API error:", error.message);
      return { 
        valid: true, 
        word: word, 
        warning: "Could not verify with dictionary, but accepting word"
      };
    }
  }

  // Get some random starting words for different lengths
  getRandomStartingWord(minLength = 4) {
    const words = {
      4: ['word', 'game', 'play', 'time', 'love', 'life', 'work', 'home', 'book', 'tree'],
      5: ['happy', 'world', 'music', 'dream', 'light', 'peace', 'magic', 'smile', 'heart', 'space'],
      6: ['friend', 'family', 'nature', 'wonder', 'beauty', 'wisdom', 'future', 'summer', 'castle', 'jungle'],
      7: ['amazing', 'awesome', 'perfect', 'journey', 'rainbow', 'diamond', 'freedom', 'harmony', 'victory', 'mystery']
    };

    const availableWords = words[minLength] || words[4];
    return availableWords[Math.floor(Math.random() * availableWords.length)];
  }

  // Clear cache periodically to prevent memory issues
  clearCache() {
    this.cache.clear();
  }

  getCacheSize() {
    return this.cache.size;
  }

  // Preload common words to cache (optional optimization)
  async preloadCommonWords() {
    const commonWords = [
      'apple', 'elephant', 'tiger', 'rabbit', 'table', 'earth', 'house', 'eagle',
      'ocean', 'ninja', 'arrow', 'window', 'water', 'river', 'robot', 'tower'
    ];

    for (const word of commonWords) {
      if (!this.cache.has(word)) {
        const result = await this.apiValidation(word);
        if (result.valid) {
          this.cache.set(word, true);
        }
        // Small delay to not spam API
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    console.log(`Preloaded ${this.cache.size} common words to cache`);
  }
}

module.exports = WCGValidator;