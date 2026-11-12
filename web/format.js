// Cheap detection keeps plain-text messages free of parser/editor downloads.
export const hasHTML = text => /<(?:p|div|strong|b|em|i|u|s|del|ul|ol|li|blockquote|pre|code|span|mark|a|details|summary|hr|h[1-6]|table)\b[^>]*>/i.test(text)&&/<\/(?:p|div|strong|b|em|i|u|s|del|ul|ol|li|blockquote|pre|code|span|mark|a|details|summary|hr|h[1-6]|table)\s*>/i.test(text);
export const hasMarkdown = text => /(^|\n) {0,3}(?:#{1,6} |>|[-*+] |\d+\. |`{3}|~{3}|(?:[-*_] *){3,}$)|\*\*\S[^\n]*?\*\*|__\S[^\n]*?__|(?:^|\s)\*\S[^\n]*?\*(?=\s|$)|(?:^|\s)_\S[^\n]*?_(?=\s|$)|`[^`\n]+`|\[[^\]\n]+\]\([^\n)]+\)|~~\S[^\n]*?~~|\n[ \t]*={3,}[ \t]*(?:\n|$)|<https:\/\/[^<>\s]+>|\n\s*\|?\s*:?-{3,}:?\s*\|/m.test(text);
export const formatted = text => hasHTML(text)||hasMarkdown(text);
