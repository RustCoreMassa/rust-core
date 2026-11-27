/** An emoji, with its optional skin tone. */
const PICTOGRAPH = String.raw`\p{Extended_Pictographic}\p{Emoji_Modifier}?`;

/**
 * Invisible characters that belong to an emoji and change only how it looks: the emoji style
 * (❤️, 1️⃣), the joiner of a sequence (🐱‍👤, 👩🏽‍💻, 🏳️‍🌈) and the tags of a subdivision flag
 * (🏴󠁧󠁢󠁳󠁣󠁴󠁿). Kept; the same characters anywhere else are removed.
 */
const EMOJI_PARTS = [
  String.raw`(?<=${PICTOGRAPH})️`,
  String.raw`(?<=${PICTOGRAPH}️?)‍(?=\p{Extended_Pictographic})`,
  String.raw`(?<=[#*0-9])️(?=⃣)`,
  String.raw`(?<=\u{1F3F4}[\u{E0020}-\u{E007E}]*)[\u{E0020}-\u{E007F}]`,
];

/**
 * Format characters (bidi controls, zero-width joiners and spaces, soft hyphen, word joiner,
 * invisible operators, tags…) and every other default-ignorable one (Hangul fillers, variation
 * selectors…): they can make a name or a symbol read as something else (reversed text,
 * look-alikes). Contracts imported from elsewhere may hold them.
 */
const HIDDEN = new RegExp(
  `(${EMOJI_PARTS.join('|')})|[\\p{Cf}\\p{Default_Ignorable_Code_Point}]`,
  'gu',
);

/** The text without the characters that change how it reads. */
export function stripHidden(text: string): string {
  return text.replace(HIDDEN, (_hidden, emojiPart: string | undefined) => emojiPart ?? '');
}
