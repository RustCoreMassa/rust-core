import { stripHidden } from './hidden-chars';

describe('hidden characters', () => {
  it('removes bidi controls and invisible characters', () => {
    expect(stripHidden('My‮CSDU')).toBe('MyCSDU');
    expect(stripHidden('⁦Cat⁩ ​Club﻿')).toBe('Cat Club');
    expect(stripHidden('‎‏؜')).toBe('');
  });

  it('removes joiners, the soft hyphen, word joiners and invisible operators', () => {
    for (const hidden of ['‍', '‌', '­', '⁠', '⁡', '⁢', '⁣', '⁤'])
      expect(stripHidden(`US${hidden}DC`), hidden.codePointAt(0)!.toString(16)).toBe('USDC');
  });

  it('removes Hangul fillers, tags and other default-ignorable characters', () => {
    expect(stripHidden('ㅤᅟᅠﾠCat')).toBe('Cat');
    expect(stripHidden('Cat\u{E0041}\u{E007F}')).toBe('Cat');
    expect(stripHidden('C͏a᠎t￹!￻')).toBe('Cat!');
    expect(stripHidden('X️Y')).toBe('XY');
  });

  it('keeps ordinary text, accents and emoji', () => {
    expect(stripHidden('Ștefan’s café 🐱‍👤')).toBe('Ștefan’s café 🐱‍👤');
    expect(stripHidden('🇷🇴 Ω 中文 عربي')).toBe('🇷🇴 Ω 中文 عربي');
  });

  it('keeps the invisible parts of emoji sequences, and only those', () => {
    for (const emoji of [
      '❤️',
      '👩🏽‍💻',
      '🏳️‍🌈',
      '❤️‍🔥',
      '1️⃣',
      '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
    ])
      expect(stripHidden(`a${emoji}b`)).toBe(`a${emoji}b`);
    expect(stripHidden('🐱‍A')).toBe('🐱A');
    expect(stripHidden('1️Z')).toBe('1Z');
  });
});
