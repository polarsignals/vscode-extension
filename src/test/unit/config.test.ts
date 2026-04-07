import {describe, it, expect} from 'vitest';
import {normalizeUrl} from '../../config/settings';

describe('normalizeUrl', () => {
  it('returns http:// URLs unchanged', () => {
    expect(normalizeUrl('http://localhost:7070')).toBe('http://localhost:7070');
  });

  it('returns https:// URLs unchanged', () => {
    expect(normalizeUrl('https://api.polarsignals.com')).toBe('https://api.polarsignals.com');
  });

  it('adds http:// to localhost', () => {
    expect(normalizeUrl('localhost:7070')).toBe('http://localhost:7070');
  });

  it('adds http:// to 127.0.0.1', () => {
    expect(normalizeUrl('127.0.0.1:7070')).toBe('http://127.0.0.1:7070');
  });

  it('adds https:// to remote hosts', () => {
    expect(normalizeUrl('api.polarsignals.com')).toBe('https://api.polarsignals.com');
  });
});
