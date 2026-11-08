import { add } from '../math';

/**
 * Formats the sum of two numbers.
 * @param {number} a first
 * @param {number} b second
 * @returns {string}
 */
export function formatSum(a, b) {
  return `Sum: ${add(a, b)}`;
}
