import { describe, it, expect } from 'vitest';
import { buildUnsplashUrl, buildDalleSize } from '../lib/images.mjs';

describe('buildUnsplashUrl', () => {
  it('adds width and height for linkedin', () => {
    const url = buildUnsplashUrl('data pipeline', 'linkedin');
    expect(url).toContain('w=1200');
    expect(url).toContain('h=628');
    expect(url).toContain('data%20pipeline');
  });
  it('adds square dimensions for instagram', () => {
    const url = buildUnsplashUrl('coding', 'instagram');
    expect(url).toContain('w=1080');
    expect(url).toContain('h=1080');
  });
  it('uses blog dimensions by default', () => {
    const url = buildUnsplashUrl('coding', 'blog');
    expect(url).toContain('w=1200');
  });
});

describe('buildDalleSize', () => {
  it('returns landscape size for linkedin', () => {
    expect(buildDalleSize('linkedin')).toBe('1792x1024');
  });
  it('returns square size for instagram', () => {
    expect(buildDalleSize('instagram')).toBe('1024x1024');
  });
  it('returns square for blog', () => {
    expect(buildDalleSize('blog')).toBe('1024x1024');
  });
});
