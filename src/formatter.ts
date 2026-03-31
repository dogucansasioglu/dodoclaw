const MAX_LENGTH = 1990;

export function chunkMessage(text: string, maxLength = MAX_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  let inCodeBlock = false;
  let codeFenceLang = "";

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitAt = -1;

    // Try to split at a newline
    const segment = remaining.slice(0, maxLength);
    const lastNewline = segment.lastIndexOf("\n");
    if (lastNewline > maxLength * 0.3) {
      splitAt = lastNewline + 1;
    }

    // Try to split at a space
    if (splitAt === -1) {
      const lastSpace = segment.lastIndexOf(" ");
      if (lastSpace > maxLength * 0.3) {
        splitAt = lastSpace + 1;
      }
    }

    // Hard cut
    if (splitAt === -1) {
      splitAt = maxLength;
    }

    let chunk = remaining.slice(0, splitAt);
    remaining = remaining.slice(splitAt);

    // Track code fences in this chunk
    const fences = chunk.match(/```/g);
    const fenceCount = fences ? fences.length : 0;

    if (inCodeBlock) {
      chunk = "```" + codeFenceLang + "\n" + chunk;
    }

    // Count fences to determine if we end inside a code block
    const totalFences = (chunk.match(/```/g) || []).length;
    const endsInCode = totalFences % 2 === 1;

    if (endsInCode) {
      // Extract language from the opening fence if we're entering a code block
      if (!inCodeBlock) {
        const langMatch = chunk.match(/```(\w*)\n/);
        codeFenceLang = langMatch?.[1] ?? "";
      }
      chunk += "\n```";
      inCodeBlock = true;
    } else {
      inCodeBlock = false;
      codeFenceLang = "";
    }

    chunks.push(chunk);
  }

  return chunks;
}
