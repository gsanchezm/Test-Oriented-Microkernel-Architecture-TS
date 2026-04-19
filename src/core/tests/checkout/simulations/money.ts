/**
 * Parse currency-like strings into plain numbers.
 * Handles: "18.99", "0", "840.99", "5,960", "5,960.50", "$14.99", "¥2,367", "Fr. 12.50", "CHF 25"
 */
export function parseMoney(value: string): number {
    const match = value.match(/-?\d[\d,]*(?:\.\d+)?/);
    if (!match) return 0;
    return parseFloat(match[0].replace(/,/g, '')) || 0;
}
