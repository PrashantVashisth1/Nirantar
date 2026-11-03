import { intlLocale } from '../i18n';

/** "2026-11-13" -> "Fri, 13 Nov" in the user's language (Latin digits). */
export function formatCalendarDate(isoDate: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    // Hindi/Bengali short month names ("नव॰", "নভেঃ") read awkwardly; use the full name there.
    month: locale === 'en' ? 'short' : 'long',
    timeZone: 'UTC', // calendar dates arrive as midnight UTC; don't shift them
  }).format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

/** A timestamp as "4 Nov, 10:42 am" in India time. */
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Greeting by the time of day in India. */
export function greetingKey(now = new Date()): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(now),
  );
  if (hour < 12) return 'greetingMorning';
  if (hour < 17) return 'greetingAfternoon';
  return 'greetingEvening';
}
