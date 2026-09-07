import raw from './catalog.json';
export type Artwork = {
  id: string;
  handle: string | null;
  votes: number;
  imageUrl: string;
  pageUrl: string;
  width: number;
  height: number;
  room: string;
  rank: number;
  image: string;
  thumb: string;
  title?: string;
  profile?: {
    name?: string;
    bio?: string;
    avatar?: string;
    followers?: number;
  } | null;
};
export const artworks = raw as Artwork[];
export type Room = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  color: string;
  number: string;
  works: Artwork[];
};
const themes = [
  [
    'fame',
    'Hall of Fame',
    'The community’s ten most-voted works.',
    'The voices that rose above the noise. Ten billboards, chosen by the community.',
    '#d9cbb6',
  ],
  [
    'city',
    'Urban Canvas',
    'Big ideas. Real-world stages.',
    'City streets, monumental architecture, and public spaces become a canvas for possibility.',
    '#c6cbc9',
  ],
  [
    'nature',
    'Beyond the Horizon',
    'A different kind of landscape.',
    'From mountains to oceans and distant worlds: imagination, without borders.',
    '#bfc6af',
  ],
  [
    'minimal',
    'Less, but Louder',
    'Clarity is a creative act.',
    'Clean compositions, confident typography, and ideas distilled to their essence.',
    '#dcd8ce',
  ],
  [
    'color',
    'Chromatic Worlds',
    'Ideas in full colour.',
    'Vivid palettes, illustration, and playful visual experiments.',
    '#c7b6a6',
  ],
  [
    'culture',
    'Human / Machine',
    'At the intersection of culture and code.',
    'People, humour, nostalgia, and the things that make technology feel human.',
    '#b9c4cc',
  ],
  [
    'studio',
    'Your Billboard',
    'Make this wall your own.',
    'Bring an image. Find your light. See your billboard inside Astra Gallery.',
    '#d8d0bd',
  ],
];
export const rooms: Room[] = themes.map(
  ([id, name, subtitle, description, color], i) => {
    const works = artworks.filter((a) => a.room === id);
    return {
      id,
      name,
      subtitle,
      description,
      color,
      number: String(i + 1).padStart(2, '0'),
      works,
    };
  },
);
export const sourceDate = '7 September 2026';
