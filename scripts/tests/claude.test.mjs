import { describe, it, expect } from 'vitest';
import {
  buildGeneratePrompt,
  buildRevisePrompt,
  buildLinkedInPrompt,
  buildInstagramPrompt,
} from '../lib/claude.mjs';

describe('buildGeneratePrompt', () => {
  it('includes topic and category', () => {
    const p = buildGeneratePrompt('dbt + DuckDB', 'data-engineering', 'en');
    expect(p).toContain('dbt + DuckDB');
    expect(p).toContain('data-engineering');
  });
  it('uses lang note for pt-BR', () => {
    const p = buildGeneratePrompt('topic', 'misc', 'pt-BR');
    expect(p).toContain('Brazilian Portuguese');
  });
});

describe('buildRevisePrompt', () => {
  it('includes draft text', () => {
    const p = buildRevisePrompt('my draft content', 'python', 'en');
    expect(p).toContain('my draft content');
  });
});

describe('buildLinkedInPrompt', () => {
  it('includes post title and blog URL', () => {
    const p = buildLinkedInPrompt(
      { title: 'Test Post', body: 'body text', tags: ['sql'] },
      'my-test-post',
    );
    expect(p).toContain('Test Post');
    expect(p).toContain('francispires.com.br/blog/my-test-post');
  });
  it('asks for JSON with content key', () => {
    const p = buildLinkedInPrompt({ title: 'T', body: 'B', tags: [] }, 'slug');
    expect(p).toContain('"content"');
  });
});

describe('buildInstagramPrompt', () => {
  it('includes post title', () => {
    const p = buildInstagramPrompt(
      { title: 'Test Post', body: 'body', tags: ['sql'] },
      'my-test-post',
    );
    expect(p).toContain('Test Post');
  });
  it('asks for content key in JSON', () => {
    const p = buildInstagramPrompt({ title: 'T', body: 'B', tags: [] }, 'slug');
    expect(p).toContain('"content"');
  });
});
