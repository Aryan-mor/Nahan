/* eslint-disable no-console */

/**
 * Modern Production-Safe Logger Utility
 * Built to be highly tree-shakable and performance-optimized.
 */

const isDev = import.meta.env.DEV;

// Use an arrow function assigned to a constant for better minifier optimization
export const log = isDev ? (...args: unknown[]) => console.log(...args) : () => {}; // In production, this becomes an empty function that can be stripped

export const warn = isDev ? (...args: unknown[]) => console.warn(...args) : () => {};

/**
 * Errors should always be logged for production diagnostics
 */
export const error = (...args: unknown[]) => console.error(...args);

export const debug = log;
export const info = log;
