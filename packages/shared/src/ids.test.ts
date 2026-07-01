import { describe, it, expect } from 'vitest';
import { parsePositiveInt } from './ids.js';

describe('parsePositiveInt', () => {
  it('gültige positive Ganzzahlen', () => {
    expect(parsePositiveInt('1')).toBe(1);
    expect(parsePositiveInt('42')).toBe(42);
    expect(parsePositiveInt(7)).toBe(7);
  });
  it('ungültige Eingaben → null', () => {
    expect(parsePositiveInt('5abc')).toBe(null); // keine teilgeparsten IDs
    expect(parsePositiveInt('0')).toBe(null);
    expect(parsePositiveInt('-3')).toBe(null);
    expect(parsePositiveInt('')).toBe(null);
    expect(parsePositiveInt(undefined)).toBe(null);
    expect(parsePositiveInt('1.5')).toBe(null);
  });
});
