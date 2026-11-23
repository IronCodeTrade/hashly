import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

export type WordCount = 12 | 24;

export function createMnemonic(words: WordCount = 12): string {
  return generateMnemonic(wordlist, words === 24 ? 256 : 128);
}

export function assertMnemonic(mnemonic: string): string {
  const normalized = mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("bad-mnemonic");
  }
  return normalized;
}

export function seedFromMnemonic(mnemonic: string, passphrase = ""): Uint8Array {
  return mnemonicToSeedSync(assertMnemonic(mnemonic), passphrase);
}

/** Positions are 0-based. The quiz never asks the user to retype the whole seed. */
export function pickQuizPositions(length: number, count = 3, rand: () => number = Math.random): number[] {
  if (length < count) throw new Error("quiz-too-short");
  const pool = Array.from({ length }, (_, index) => index);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    const swap = pool[i];
    pool[i] = pool[j] ?? i;
    pool[j] = swap ?? j;
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

export function checkQuiz(mnemonic: string, answers: Record<number, string>): boolean {
  const words = assertMnemonic(mnemonic).split(" ");
  return Object.entries(answers).every(([index, word]) => words[Number(index)] === word.trim().toLowerCase());
}
