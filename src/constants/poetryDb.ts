/**
 * Poetry Database for Nahan Stealth Mode
 * Multi-language poetry database with Persian (fa) and English (en) poems
 * Each poem includes all its verses/lines in sequence
 */

import poetryData from './poetryData.json';

export interface FullPoem {
  id: string;
  poet: string;
  title: string;
  content: string[]; // Array of all lines in sequence
}

export const poetryDb: Record<'fa' | 'en', FullPoem[]> = poetryData as Record<'fa' | 'en', FullPoem[]>;
