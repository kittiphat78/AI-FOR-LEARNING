/**
 * Semantic Text Chunker
 * Splits a large text into manageable chunks while trying to preserve semantic boundaries (paragraphs/sentences).
 */
class TextChunker {
  /**
   * Chunk text by max characters, ensuring we break at a sentence or paragraph boundary if possible.
   * @param {string} text Raw text to chunk
   * @param {number} maxCharLimit Maximum characters per chunk (default 15000 to fit well in prompt)
   * @returns {string[]} Array of text chunks
   */
  static chunk(text, maxCharLimit = 15000) {
    if (!text || text.trim().length === 0) return [];
    
    // Normalize newlines
    let normalized = text.replace(/\r\n/g, '\n');
    
    // If text is small enough, return as single chunk
    if (normalized.length <= maxCharLimit) {
      return [normalized];
    }

    const chunks = [];
    let currentPos = 0;

    while (currentPos < normalized.length) {
      // Calculate where we should cut ideally
      let endPos = currentPos + maxCharLimit;

      if (endPos >= normalized.length) {
        // We reached the end
        chunks.push(normalized.substring(currentPos));
        break;
      }

      // Try to find a good breaking point (e.g. double newline, single newline, or period)
      const slice = normalized.substring(currentPos, endPos);
      
      // We look backwards from endPos to find a semantic break
      let breakIndex = slice.lastIndexOf('\n\n'); // Paragraph
      
      if (breakIndex === -1 || breakIndex < slice.length / 2) {
        breakIndex = slice.lastIndexOf('\n'); // Line break
      }
      
      if (breakIndex === -1 || breakIndex < slice.length / 2) {
        // Fallback to sentence end (. )
        breakIndex = slice.lastIndexOf('. ');
      }

      // If we couldn't find a good break point in the latter half of the chunk, just force cut
      if (breakIndex === -1 || breakIndex < slice.length / 2) {
        breakIndex = maxCharLimit;
      } else {
        // Include the break character(s) in the current chunk
        breakIndex += (slice.substring(breakIndex, breakIndex + 2) === '\n\n' ? 2 : 1);
      }

      const chunk = normalized.substring(currentPos, currentPos + breakIndex);
      if (chunk.trim().length > 0) {
        chunks.push(chunk.trim());
      }
      
      currentPos += breakIndex;
    }

    return chunks;
  }
}

module.exports = TextChunker;
