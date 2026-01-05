/* eslint-disable no-console */
/**
 * Production-Safe Logger Utility
 * Only logs in development mode (import.meta.env.DEV)
 * Prevents debug information from leaking into production builds
 */

const isDev = import.meta.env.DEV;

/**
 * Log a message (only in development)
 */
export function log(...args: unknown[]): void {
  if (isDev) {
    console.log(...args);
  }
}

/**
 * Alias for log (for compatibility)
 */
export const info = log;

/**
 * Alias for log (for compatibility)
 */
export const debug = log;

/**
 * Log a warning (only in development)
 */
export function warn(...args: unknown[]): void {
  if (isDev) {
    console.warn(...args);
  }
}

/**
 * Log an error (always logs, even in production)
 * Errors are critical and should be visible in production
 */
export function error(...args: unknown[]): void {
  console.error(...args);
}

/**
 * Create a grouped log (only in development)
 */
export function group(label: string): void {
  if (isDev) {
    console.group(label);
  }
}

/**
 * End a grouped log (only in development)
 */
export function groupEnd(): void {
  if (isDev) {
    console.groupEnd();
  }
}

/**
 * Log a trace with a label (only in development)
 */
export function trace(label: string, ...args: unknown[]): void {
  if (isDev) {
    console.log(`[TRACE: ${label}]`, ...args);
  }
}
