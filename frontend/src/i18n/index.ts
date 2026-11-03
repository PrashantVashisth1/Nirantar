import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@nirantar/shared';
import bn from './bn.json';
import en from './en.json';
import hi from './hi.json';

/**
 * Customer screens in English, Hindi and Bengali (plan A10: the Hindi and
 * Bengali text is a draft that needs review by a native speaker).
 * Staff screens are English only.
 */
const STORAGE_KEY = 'nirantar.locale';

export const LANGUAGE_OPTIONS: { locale: Locale; label: string; short: string }[] = [
  { locale: 'en', label: 'English', short: 'EN' },
  { locale: 'hi', label: 'हिन्दी', short: 'हिं' },
  { locale: 'bn', label: 'বাংলা', short: 'বাং' },
];

function savedLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'hi' || value === 'bn' || value === 'en') return value;
  } catch {
    // Storage can be blocked (private mode); fall back to English.
  }
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, bn: { translation: bn } },
  lng: savedLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

document.documentElement.lang = i18n.language;

/** Switches language, updates <html lang> (for fonts and screen readers) and remembers it. */
export function setLocale(locale: Locale) {
  void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore: the choice is also saved on the server for signed-in users
  }
}

/**
 * Intl locale for dates and numbers. "-u-nu-latn" keeps Latin digits in every
 * language, so strengths, prices and dates are never ambiguous.
 */
export function intlLocale(locale: string): string {
  if (locale === 'hi') return 'hi-IN-u-nu-latn';
  if (locale === 'bn') return 'bn-IN-u-nu-latn';
  return 'en-IN';
}

export default i18n;
