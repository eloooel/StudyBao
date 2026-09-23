import { twMerge } from 'tailwind-merge'

export type ClassValue = string | number | null | undefined | false | ClassValue[]

/**
 * Join class names and let later Tailwind utilities win.
 *
 * tailwind-merge is not optional here: without it, `cn('bg-primary', 'bg-sage')`
 * emits both classes and the winner is decided by the order Tailwind happened to
 * generate its CSS in, not by the caller. That makes every component's `className`
 * override unpredictable, which is the one thing a design system must not be.
 *
 * Falsy values are dropped so `cond && 'class'` works without `|| undefined`.
 */
export function cn(...inputs: ClassValue[]): string {
  const parts: string[] = []

  const walk = (value: ClassValue): void => {
    // Drop every falsy value, including 0 and NaN, so `cond && 'class'` works and
    // so a stray number can never end up as a class name.
    if (!value) return
    if (Array.isArray(value)) {
      for (const nested of value) walk(nested)
      return
    }
    parts.push(String(value))
  }

  for (const input of inputs) walk(input)

  return twMerge(parts.join(' '))
}
