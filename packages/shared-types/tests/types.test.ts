import { describe, it, expect } from 'vitest';
import type { PlaybookEntry, AdminUser, Status } from '../src/index.js';

describe('shared-types', () => {
  it('PlaybookEntry interface is importable and usable', () => {
    const entry: PlaybookEntry = {
      id: '1',
      title: 'JSON Extraction',
      summary: 'Multi-strategy JSON repair from LLM responses',
      category: 'resilience',
      status: 'active',
    };
    expect(entry.id).toBe('1');
    expect(entry.category).toBe('resilience');
  });

  it('AdminUser interface is importable and usable', () => {
    const user: AdminUser = {
      id: 'u1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'editor',
    };
    expect(user.role).toBe('editor');
  });

  it('Status type constrains to valid values', () => {
    const status: Status = 'active';
    expect(['active', 'draft', 'deprecated']).toContain(status);
  });
});
