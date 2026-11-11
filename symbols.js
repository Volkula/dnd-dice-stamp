import { AppError } from './i18n.js?v=8';
import { ensureEmoji, emojiHasGlyph } from './fonts.js?v=8';

const CDN = 'https://cdn.jsdelivr.net/npm';

// Only fill-based sets: an outline-only icon has no area to press into the model.
export const LIBRARIES = [
  {
    id: 'emoji',
    type: 'emoji',
    name: 'Noto Emoji',
    license: 'SIL OFL 1.1',
    link: 'https://fonts.google.com/noto/specimen/Noto+Emoji',
  },
  {
    id: 'game-icons',
    type: 'icons',
    name: 'Game Icons',
    license: 'CC BY 3.0 · Lorc, Delapouite & contributors',
    link: 'https://game-icons.net',
    url: `${CDN}/@iconify-json/game-icons@1/icons.json`,
  },
  {
    id: 'mdi',
    type: 'icons',
    name: 'Material Design Icons',
    license: 'Apache 2.0 · Pictogrammers',
    link: 'https://pictogrammers.com/library/mdi/',
    url: `${CDN}/@iconify-json/mdi@1/icons.json`,
  },
  {
    id: 'fa6-solid',
    type: 'icons',
    name: 'Font Awesome 6 Solid',
    license: 'CC BY 4.0 · Fonticons, Inc.',
    link: 'https://fontawesome.com',
    url: `${CDN}/@iconify-json/fa6-solid@1/icons.json`,
  },
  {
    id: 'bi',
    type: 'icons',
    name: 'Bootstrap Icons',
    license: 'MIT · The Bootstrap Authors',
    link: 'https://icons.getbootstrap.com',
    url: `${CDN}/@iconify-json/bi@1/icons.json`,
  },
];

const EMOJI_DATA = (lang) => `${CDN}/emojibase-data@16/${lang}/compact.json`;

const loaded = new Map();

export function library(id) {
  return LIBRARIES.find((item) => item.id === id) || LIBRARIES[0];
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new AppError('err.libFetch');
  }
  if (!response.ok) throw new AppError('err.libFetch');
  return response.json();
}

async function loadEmoji(lang) {
  const [data] = await Promise.all([fetchJson(EMOJI_DATA(lang)), ensureEmoji()]);
  const items = [];
  for (const entry of data) {
    // Entries without a group are the regional-indicator letters, which only make sense as flag pairs.
    if (!entry || !entry.unicode || !entry.label || entry.group == null) continue;
    const char = entry.unicode.replace(/[\uFE0E\uFE0F]/g, '');
    // One code point only: flags, families and skin tones are sequences the outline font cannot draw.
    if (Array.from(char).length !== 1 || !emojiHasGlyph(char)) continue;
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    items.push({
      id: char,
      char,
      label: entry.label,
      haystack: `${entry.label} ${tags.join(' ')}`.toLowerCase(),
      order: entry.order ?? Number.MAX_SAFE_INTEGER,
    });
  }
  items.sort((a, b) => a.order - b.order);
  return items;
}

async function loadIcons(lib) {
  const data = await fetchJson(lib.url);
  const icons = data.icons || {};
  const items = [];
  const push = (name, icon) => {
    const width = icon.width || data.width || 16;
    const height = icon.height || data.height || 16;
    items.push({
      id: name,
      label: name,
      haystack: name.replace(/-/g, ' '),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left || 0} ${icon.top || 0} ${width} ${height}">${icon.body}</svg>`,
    });
  };
  for (const name of Object.keys(icons)) push(name, icons[name]);
  for (const [name, alias] of Object.entries(data.aliases || {})) {
    // Flipped or rotated aliases would need a transform; plain renames are just another search word.
    if (!alias || alias.hFlip || alias.vFlip || alias.rotate || !icons[alias.parent] || icons[name]) continue;
    push(name, icons[alias.parent]);
  }
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return items;
}

export function loadLibrary(id, lang) {
  const lib = library(id);
  const key = lib.type === 'emoji' ? `emoji:${lang}` : lib.id;
  if (!loaded.has(key)) {
    const task = (lib.type === 'emoji' ? loadEmoji(lang) : loadIcons(lib)).catch((error) => {
      loaded.delete(key);
      throw error;
    });
    loaded.set(key, task);
  }
  return loaded.get(key);
}

function rank(item, query, words) {
  if (item.id === query || item.label.toLowerCase() === query) return 0;
  if (item.haystack.startsWith(query)) return 1;
  const parts = item.haystack.split(' ');
  if (words.every((word) => parts.some((part) => part.startsWith(word)))) return 2;
  return 3;
}

export function searchItems(items, rawQuery, limit) {
  const query = rawQuery.trim().toLowerCase().replace(/[-_]+/g, ' ');
  if (!query) return { items: items.slice(0, limit), total: items.length };
  const words = query.split(/\s+/);
  const found = [];
  for (const item of items) {
    if (item.id === rawQuery.trim() || words.every((word) => item.haystack.includes(word))) {
      found.push({ item, rank: rank(item, query, words) });
    }
  }
  // Array.prototype.sort is stable, so equal ranks keep the library's own order.
  found.sort((a, b) => a.rank - b.rank);
  return { items: found.slice(0, limit).map((entry) => entry.item), total: found.length };
}
