import { describe, it, expect } from 'vitest';
import { matchEntity } from '../src/ingestion/dedup/entity.js';
import type { ExistingEntity } from '../src/ingestion/dedup/entity.js';

describe('Entity dedup — matchEntity', () => {
  const existing: ExistingEntity[] = [
    { docId: 'doc-1', identifiers: { name: 'Kalpesh Jaju', email: 'kalpesh@example.com', company: 'Loop' } },
    { docId: 'doc-2', identifiers: { name: 'Jane Doe', company: 'Acme Corp', domain: 'acme.com' } },
  ];

  it('matches by exact email (case-insensitive)', () => {
    const result = matchEntity({ email: 'Kalpesh@Example.COM' }, existing);
    expect(result.isEntityDuplicate).toBe(true);
    expect(result.matchedDocId).toBe('doc-1');
    expect(result.matchField).toBe('email');
  });

  it('matches by name + company', () => {
    const result = matchEntity({ name: 'jane doe', company: 'acme corp' }, existing);
    expect(result.isEntityDuplicate).toBe(true);
    expect(result.matchedDocId).toBe('doc-2');
    expect(result.matchField).toBe('name+company');
  });

  it('matches by domain when no name/email on incoming', () => {
    const result = matchEntity({ domain: 'Acme.com' }, existing);
    expect(result.isEntityDuplicate).toBe(true);
    expect(result.matchedDocId).toBe('doc-2');
    expect(result.matchField).toBe('domain');
  });

  it('does NOT match by domain when name is present', () => {
    const result = matchEntity({ name: 'Unknown Person', domain: 'acme.com' }, existing);
    expect(result.isEntityDuplicate).toBe(false);
  });

  it('returns false when no identifiers match', () => {
    const result = matchEntity({ name: 'Nobody', email: 'nobody@nowhere.com' }, existing);
    expect(result.isEntityDuplicate).toBe(false);
  });

  it('returns false when incoming has no identifiers', () => {
    const result = matchEntity({}, existing);
    expect(result.isEntityDuplicate).toBe(false);
  });
});
