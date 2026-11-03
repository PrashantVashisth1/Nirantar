import { clsx, type ClassValue } from 'clsx';

/** Joins class names, skipping empty ones: cn('a', cond && 'b'). */
export function cn(...values: ClassValue[]): string {
  return clsx(values);
}
