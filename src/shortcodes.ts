/**
 * Shortcode parser for Discord emojis, stickers, and GIFs.
 *
 * Agent writes shortcodes like :Laplus_Yay: or :sticker:Minor_Spelling_Mistake:
 * or :gif:Biboo_Bleh: and the parser expands them before sending to Discord.
 */

export type ShortcodeType = "emoji" | "sticker" | "gif";

export interface Shortcode {
  type: ShortcodeType;
  animated?: boolean; // emoji only
  id?: string; // emoji & sticker
  url?: string; // gif only
  tags: string[];
  example: string;
}

// Unified registry — single source of truth for all emojis, stickers, and GIFs
// Add your custom Discord emojis here using /add-shortcode
export const SHORTCODES: Record<string, Shortcode> = {};

/**
 * Resolve a shortcode name to its Discord emoji format, with unicode fallback.
 * Returns Discord format if the emoji exists in SHORTCODES, otherwise the fallback.
 */
export function resolveEmoji(name: string, fallbackUnicode?: string): string {
  const entry = SHORTCODES[name];
  if (entry?.type === "emoji" && entry.id) {
    const prefix = entry.animated ? "a" : "";
    return `<${prefix}:${name}:${entry.id}>`;
  }
  return fallbackUnicode ?? "";
}

/**
 * Resolve a shortcode name to its emoji ID (for reactions), with unicode fallback.
 */
export function resolveReaction(name: string, fallbackUnicode?: string): string {
  const entry = SHORTCODES[name];
  if (entry?.type === "emoji" && entry.id) {
    const prefix = entry.animated ? "a" : "";
    return `${prefix}:${name}:${entry.id}`;
  }
  return fallbackUnicode ?? "";
}

export interface ParseResult {
  text: string; // text with emojis resolved, sticker/gif shortcodes removed
  stickers: string[]; // sticker IDs to send
  gifs: string[]; // gif URLs to send as separate messages
}

/**
 * Parse shortcodes in text.
 *
 * :Name: → emoji (inline replace)
 * :sticker:Name: → sticker (extracted, sent separately)
 * :gif:Name: → gif (extracted, sent as separate message)
 *
 * Already-expanded Discord emoji syntax (<:Name:ID> / <a:Name:ID>) passes through untouched.
 */
export function parseShortcodes(text: string): ParseResult {
  const stickers: string[] = [];
  const gifs: string[] = [];

  // Extract stickers: :sticker:Name:
  text = text.replace(/:sticker:(\w+):/g, (_match, name: string) => {
    const entry = SHORTCODES[name];
    if (entry?.type === "sticker" && entry.id) {
      stickers.push(entry.id);
    }
    return "";
  });

  // Extract GIFs: :gif:Name:
  text = text.replace(/:gif:(\w+):/g, (_match, name: string) => {
    const entry = SHORTCODES[name];
    if (entry?.type === "gif" && entry.url) {
      gifs.push(entry.url);
    }
    return "";
  });

  // Replace emoji shortcodes: :Name:
  // But skip already-expanded <:Name:ID> and <a:Name:ID>
  text = text.replace(/(?<!<a?)(?<!<):(\w+):(?!\d)/g, (_match, name: string) => {
    const entry = SHORTCODES[name];
    if (entry?.type === "emoji" && entry.id) {
      const prefix = entry.animated ? "a" : "";
      return `<${prefix}:${name}:${entry.id}>`;
    }
    // Not in registry — leave as-is
    return _match;
  });

  // Clean up extra whitespace from removed sticker/gif shortcodes
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return { text, stickers, gifs };
}

/**
 * Strip all shortcodes from text, returning plain text.
 * Removes :Name:, :sticker:Name:, and :gif:Name: patterns.
 * Used for Telegram where Discord custom emojis/stickers/GIFs don't work.
 */
export function stripShortcodes(text: string): string {
  return text
    .replace(/:sticker:\w+:/g, "")
    .replace(/:gif:\w+:/g, "")
    .replace(/(?<!<a?)(?<!<):(\w+):(?!\d)/g, (_match, name: string) => {
      // Only strip if it's a known shortcode — leave unknown :text: as-is
      return SHORTCODES[name] ? "" : _match;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
