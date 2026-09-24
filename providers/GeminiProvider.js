const { GoogleGenAI } = require('@google/genai');

class GeminiProvider {
  constructor() {
    this.ai = new GoogleGenAI({});
    // Default model mapped according to account capability
    this.defaultModel = 'gemini-3.6-flash'; 
  }

  /**
   * Helper function to determine if an error should be retried.
   */
  isRetryableError(err) {
    if (!err || !err.message) return false;
    
    // We only want to retry 503 (Unavailable), 429 (Rate Limit), or 500 (Internal Server Error)
    const msg = err.message;
    if (msg.includes('503') || msg.includes('UNAVAILABLE')) return true;
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) return true;
    if (msg.includes('500') || msg.includes('INTERNAL')) return true;
    if (msg.includes('timeout')) return true;
    
    // Do NOT retry 400 (Bad Request), 401/403 (Auth), 404 (Not Found / Model Deprecated)
    return false;
  }

  /**
   * Exponential Backoff sleep with jitter
   */
  async sleep(attempt) {
    const baseDelayMs = 2000; // 2 seconds
    const maxDelayMs = 15000; // 15 seconds max wait
    
    // Calculate exponential backoff
    let delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
    
    // Add jitter (randomize +/- 20% to prevent thundering herd)
    const jitter = delay * 0.2;
    delay = delay + (Math.random() * jitter * 2) - jitter;
    
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Generate content with robust retry mechanism
   */
  async generate(prompt, model = this.defaultModel) {
    const maxRetries = 4;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.ai.models.generateContent({ model, contents: prompt });
        return response.text;
      } catch (err) {
        console.warn(`[GeminiProvider] Attempt ${attempt + 1} failed: ${err.message}`);
        
        // Check if error is retryable
        if (!this.isRetryableError(err)) {
          console.error(`[GeminiProvider] Fatal/Non-retryable error encountered. Aborting.`);
          throw err;
        }

        // If last attempt, throw
        if (attempt === maxRetries - 1) {
          console.error(`[GeminiProvider] Max retries (${maxRetries}) reached. Propagating error.`);
          throw err;
        }

        // Wait before next retry
        await this.sleep(attempt);
      }
    }
  }
}

module.exports = GeminiProvider;
