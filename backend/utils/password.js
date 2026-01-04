import crypto from "crypto";

/**
 * Generate a secure temporary password
 * @param {number} length - Length of password (default: 14)
 * @returns {string} - Generated password with mixed character types
 */
export function generateTempPassword(length = 14) {
  // At least one upper, one lower, one digit, one symbol
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()_+{}[]<>?";
  const all = upper + lower + digits + symbols;

  const picks = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  const remaining = Array.from({ length: length - picks.length }, () => {
    const idx = crypto.randomInt(0, all.length);
    return all[idx];
  });

  const passwordChars = picks.concat(remaining);
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join("");
}
