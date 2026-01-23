export const HOMOGLYPH_MAP: Record<string, string> = {
  // Lowercase
  'a': 'а', 'e': 'е', 'o': 'о', 'c': 'с', 'p': 'р',
  'x': 'х', 'y': 'у', 'i': 'і', 'j': 'ј',
  // Uppercase
  'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'H': 'Н',
  'K': 'К', 'M': 'М', 'O': 'О', 'P': 'Р', 'T': 'Т',
  'X': 'Х', 'Y': 'У'
};

// Auto-generate reverse map
export const REVERSE_HOMOGLYPH_MAP: Record<string, string> = Object.entries(HOMOGLYPH_MAP).reduce((acc, [key, value]) => {
  acc[value] = key;
  return acc;
}, {} as Record<string, string>);

export function isHomoglyph(char: string): boolean {
  return char in REVERSE_HOMOGLYPH_MAP;
}

export function getOriginalChar(homoglyph: string): string {
  return REVERSE_HOMOGLYPH_MAP[homoglyph] || homoglyph;
}

export function canSubstitute(char: string): boolean {
  return char in HOMOGLYPH_MAP;
}

export function getHomoglyph(char: string): string {
  return HOMOGLYPH_MAP[char] || char;
}
