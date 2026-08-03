/**
 * Caesar shift. Pure, so the puzzle UI can call it on every drag frame and the
 * seed script can call it to produce the ciphertext from the plaintext — one
 * implementation, so the puzzle and its answer cannot drift apart.
 */
export function shift(text: string, by: number): string {
  const n = ((by % 26) + 26) % 26; // negatives and >26 both normalise here
  return text.replace(/[a-z]/gi, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + n) % 26) + base);
  });
}
