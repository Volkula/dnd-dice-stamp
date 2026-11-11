import { STRINGS } from './strings.js?v=11';

export const LANGS = [
  ['ru', 'Русский'],
  ['en', 'English'],
  ['de', 'Deutsch'],
];

const LOCALES = { ru: 'ru-RU', en: 'en-US', de: 'de-DE' };
const STORAGE_KEY = 'dice.lang';
const listeners = new Set();

let lang = 'ru';

function remembered() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function detectLang() {
  const saved = remembered();
  if (saved && STRINGS[saved]) return saved;
  const wanted = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
  for (const tag of wanted) {
    const short = String(tag).slice(0, 2).toLowerCase();
    if (STRINGS[short]) return short;
  }
  return 'en';
}

export function getLang() {
  return lang;
}

export function locale() {
  return LOCALES[lang] || 'en-US';
}

export function setLang(next) {
  if (!STRINGS[next]) return;
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode: the choice simply lasts until the tab closes.
  }
  applyI18n();
  for (const listener of listeners) listener(next);
}

export function onLangChange(listener) {
  listeners.add(listener);
}

// A message is kept as key + params so it can be re-rendered when the language changes.
export function msg(key, params) {
  return { key, params };
}

export function render(message) {
  if (message == null) return '';
  if (typeof message === 'object' && message.key) return t(message.key, message.params);
  return String(message);
}

export function t(key, params) {
  const table = STRINGS[lang] || STRINGS.ru;
  let text = table[key];
  if (text == null) text = STRINGS.en[key];
  if (text == null) return key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? render(params[name]) : whole));
}

export class AppError extends Error {
  constructor(key, params) {
    super(key);
    this.name = 'AppError';
    this.key = key;
    this.params = params;
  }
}

export function errorMsg(error, fallbackKey = 'err.unknown') {
  if (error && error.key) return msg(error.key, error.params);
  if (error && error.message) return msg('err.raw', { text: error.message });
  return msg(fallbackKey);
}

export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
  if (root === document) {
    document.documentElement.lang = lang;
    document.title = t('app.title');
  }
}

lang = detectLang();
