import opentype from 'opentype.js';
import { AppError } from './i18n.js?v=4';
import { contoursFromOpentypePath, flipY } from './geom2d.js?v=4';

const ROBOTO_URL = 'https://cdn.jsdelivr.net/gh/googlefonts/roboto@2.138/src/hinted/Roboto-Regular.ttf';
const EMOJI_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/noto-emoji@latest/emoji-400-normal.ttf';
const FONTSOURCE = 'https://cdn.jsdelivr.net/fontsource/fonts';

export const DEFAULT_FONT = 'roboto';
export const EMOJI_CSS_FAMILY = 'DiceStampEmoji';

// Emoji outlines fill the whole em box; drawn at full size they dwarf the digits next to them.
const EMOJI_SCALE = 0.8;

// id -> { id, name, origin: 'builtin' | 'file' | 'url', url, faces: [Font], buffers: [ArrayBuffer] }
const registry = new Map();

let emojiFace = null;
let emojiLoading = null;

function signature(buffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return String.fromCharCode(...bytes);
}

export function parseFont(buffer) {
  if (!buffer || buffer.byteLength < 12) throw new AppError('err.fontParse');
  if (signature(buffer) === 'wOF2') throw new AppError('err.fontWoff2');
  let font;
  try {
    font = opentype.parse(buffer);
  } catch {
    throw new AppError('err.fontParse');
  }
  if (!font || !font.supported || !font.glyphs || !font.glyphs.length) throw new AppError('err.fontParse');
  return font;
}

function englishName(font, fallback) {
  const names = font.names || {};
  const pick = (entry) => (entry ? entry.en || Object.values(entry)[0] : '');
  return pick(names.fontFamily) || pick(names.fullName) || fallback;
}

async function download(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new AppError('err.fontFetch');
  }
  if (!response.ok) throw new AppError('err.fontHttp', { code: response.status });
  return response.arrayBuffer();
}

export async function loadBuiltinFont() {
  const buffer = await download(ROBOTO_URL);
  registry.set(DEFAULT_FONT, {
    id: DEFAULT_FONT,
    name: 'Roboto',
    origin: 'builtin',
    url: ROBOTO_URL,
    faces: [parseFont(buffer)],
    buffers: [],
  });
}

export function ensureEmoji() {
  if (emojiFace) return Promise.resolve(emojiFace);
  if (!emojiLoading) {
    emojiLoading = download(EMOJI_URL)
      .then((buffer) => {
        emojiFace = parseFont(buffer);
        // The same file drawn by the browser, so the picker shows exactly what gets stamped.
        try {
          const face = new FontFace(EMOJI_CSS_FAMILY, buffer);
          face.load().then((loaded) => document.fonts.add(loaded)).catch(() => {});
        } catch {
          // No FontFace API: the picker falls back to the system emoji.
        }
        return emojiFace;
      })
      .catch((error) => {
        emojiLoading = null;
        throw error;
      });
  }
  return emojiLoading;
}

export function emojiHasGlyph(char) {
  if (!emojiFace) return false;
  const glyph = emojiFace.charToGlyph(char);
  return Boolean(glyph && glyph.index !== 0);
}

export function listFonts() {
  return Array.from(registry.values());
}

export function hasFont(id) {
  return registry.has(id);
}

export function fontName(id) {
  const entry = registry.get(id);
  return entry ? entry.name : '';
}

let seq = 0;

function freshId() {
  seq += 1;
  return `font-${Date.now().toString(36)}-${seq}`;
}

// `name` wins when given (a saved project); otherwise the font's own family name is used.
export function addFont({ id, name, fallbackName, origin, url, buffers }) {
  if (!Array.isArray(buffers) || !buffers.length) throw new AppError('err.fontParse');
  const faces = buffers.map((buffer) => parseFont(buffer));
  const entry = {
    id: id && id !== DEFAULT_FONT ? String(id) : freshId(),
    name: String(name || englishName(faces[0], fallbackName || 'Font')).slice(0, 60),
    origin: origin === 'url' ? 'url' : 'file',
    url: url || '',
    faces,
    buffers,
  };
  registry.set(entry.id, entry);
  return entry;
}

export async function addFontFromFile(file) {
  const buffer = await file.arrayBuffer();
  return addFont({
    fallbackName: file.name.replace(/\.[^.]+$/, ''),
    origin: 'file',
    buffers: [buffer],
  });
}

// Google Fonts pages and CSS links do not point at a font file; the family name does the job.
function familyFromInput(input) {
  if (!/^https?:\/\//i.test(input)) return /[\\/]/.test(input) ? null : input;
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.hostname === 'fonts.google.com') {
    const match = url.pathname.match(/\/specimen\/([^/]+)/);
    return match ? decodeURIComponent(match[1]).replace(/\+/g, ' ') : null;
  }
  if (url.hostname === 'fonts.googleapis.com') {
    const family = url.searchParams.get('family');
    return family ? family.split(/[:|]/)[0] : null;
  }
  return null;
}

async function loadFamily(family) {
  const slug = family.trim().toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z0-9-]+$/.test(slug)) throw new AppError('err.fontFamily', { name: family });
  const file = (subset) => `${FONTSOURCE}/${slug}@latest/${subset}-400-normal.ttf`;
  const buffers = [];
  for (const subset of ['latin', 'cyrillic']) {
    try {
      buffers.push(await download(file(subset)));
    } catch (error) {
      // Plenty of families have no Cyrillic; only a missing Latin file means the family is unknown.
      if (subset === 'latin') {
        if (error.key === 'err.fontHttp') throw new AppError('err.fontFamily', { name: family });
        throw error;
      }
    }
  }
  return addFont({ fallbackName: family.trim(), origin: 'url', url: family.trim(), buffers });
}

export async function addFontFromUrl(input) {
  const text = String(input || '').trim();
  if (!text) throw new AppError('err.fontUrlEmpty');
  const family = familyFromInput(text);
  if (family) return loadFamily(family);
  if (!/^https?:\/\//i.test(text)) throw new AppError('err.fontUrlBad');
  const buffer = await download(text);
  let tail = text.split(/[?#]/)[0].split('/').pop() || '';
  try {
    tail = decodeURIComponent(tail);
  } catch {
    // A stray percent sign in the link: the raw file name is good enough for a label.
  }
  return addFont({ fallbackName: tail.replace(/\.[^.]+$/, ''), origin: 'url', url: text, buffers: [buffer] });
}

export function removeFont(id) {
  if (id === DEFAULT_FONT) return false;
  return registry.delete(id);
}

export function customFonts() {
  return listFonts()
    .filter((entry) => entry.origin !== 'builtin')
    .map(({ id, name, origin, url, buffers }) => ({ id, name, origin, url, buffers }));
}

function chainFor(fontId) {
  const chain = [];
  const chosen = registry.get(fontId);
  if (chosen) for (const font of chosen.faces) chain.push({ font, scale: 1 });
  const base = registry.get(DEFAULT_FONT);
  if (base && base !== chosen) chain.push({ font: base.faces[0], scale: 1 });
  return chain;
}

function skipped(code) {
  // Variation selectors, joiners and skin tones carry no outline of their own.
  return code === 0xfe0f || code === 0xfe0e || code === 0x200d || (code >= 0x1f3fb && code <= 0x1f3ff);
}

function findGlyph(chain, char) {
  for (const face of chain) {
    const glyph = face.font.charToGlyph(char);
    if (glyph && glyph.index !== 0) return { face, glyph };
  }
  return null;
}

// True when some character is covered by no loaded text font and the emoji font could still help.
export function needsEmoji(fontId, text) {
  if (emojiFace) return false;
  const chain = chainFor(fontId);
  for (const char of text) {
    if (/\s/.test(char) || skipped(char.codePointAt(0))) continue;
    if (!findGlyph(chain, char)) return true;
  }
  return false;
}

function kerning(face, left, right) {
  try {
    return face.font.getKerningValue(left, right) || 0;
  } catch {
    return 0;
  }
}

export function layoutText(fontId, text, fontSize) {
  const chain = chainFor(fontId);
  if (emojiFace) chain.push({ font: emojiFace, scale: EMOJI_SCALE });
  if (!chain.length) throw new AppError('err.fontNotReady');

  const tolerance = Math.max(fontSize * 0.004, 0.01);
  const lineHeight = fontSize * 1.25;
  const contours = [];
  const missing = [];
  let y = 0;

  for (const line of text.split('\n')) {
    let x = 0;
    let previous = null;
    for (const char of line) {
      if (skipped(char.codePointAt(0))) continue;
      const found = findGlyph(chain, char);
      if (!found) {
        previous = null;
        if (/\s/.test(char)) x += fontSize * 0.3;
        else if (!missing.includes(char)) missing.push(char);
        continue;
      }
      const { face, glyph } = found;
      const size = fontSize * face.scale;
      const unit = size / face.font.unitsPerEm;
      if (previous && previous.face === face) x += kerning(face, previous.glyph, glyph) * unit;
      contours.push(...contoursFromOpentypePath(glyph.getPath(x, y, size), tolerance));
      x += (glyph.advanceWidth || 0) * unit;
      previous = found;
    }
    y += lineHeight;
  }

  if (!contours.length) {
    if (missing.length) throw new AppError('err.noGlyphs', { chars: missing.join(' ') });
    throw new AppError('err.noContour');
  }
  return { contours: flipY(contours), fillRule: 'NonZero', missing };
}
