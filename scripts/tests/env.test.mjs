import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { readEnvKey, writeEnvKeys } from '../lib/env.mjs';

const TMP = join(process.cwd(), '.env.test.tmp');

beforeEach(() => { writeFileSync(TMP, 'FOO=bar\nBAZ=qux\n'); });
afterEach(() => { try { unlinkSync(TMP); } catch {} });

describe('readEnvKey', () => {
  it('reads an existing key', () => {
    expect(readEnvKey('FOO', TMP)).toBe('bar');
  });
  it('returns undefined for a missing key', () => {
    expect(readEnvKey('MISSING', TMP)).toBeUndefined();
  });
});

describe('writeEnvKeys', () => {
  it('updates an existing key', () => {
    writeEnvKeys({ FOO: 'updated' }, TMP);
    expect(readEnvKey('FOO', TMP)).toBe('updated');
    expect(readEnvKey('BAZ', TMP)).toBe('qux');
  });
  it('appends a new key', () => {
    writeEnvKeys({ NEW_KEY: 'hello' }, TMP);
    expect(readEnvKey('NEW_KEY', TMP)).toBe('hello');
  });
});
