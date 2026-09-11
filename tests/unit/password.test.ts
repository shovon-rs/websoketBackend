import { describe, expect, it } from 'vitest';
import { strongPasswordSchema } from '../../src/utils/password';

describe('strongPasswordSchema', () => {
  it('accepts a password with lowercase, uppercase, digit, and special character', () => {
    expect(strongPasswordSchema.safeParse('Str0ng!Pass').success).toBe(true);
  });

  it.each([
    ['Sh0rt!1', false, 'too short (fewer than 8 chars)'],
    ['alllowercase1!', false, 'missing uppercase'],
    ['ALLUPPERCASE1!', false, 'missing lowercase'],
    ['NoDigitsHere!', false, 'missing digit'],
    ['NoSpecialChar1', false, 'missing special character'],
  ])('rejects %s (%s)', (password) => {
    expect(strongPasswordSchema.safeParse(password).success).toBe(false);
  });
});
