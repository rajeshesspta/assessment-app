import { describe, expect, it, beforeEach } from 'vitest';
import { createSQLiteAssessmentRepository } from '../assessment.repository.js';
import { createSQLiteTenantClient } from '../../../infrastructure/sqlite/client.js';
import { Assessment } from '../../../common/types.js';
import fs from 'fs';
import path from 'path';

describe('SQLiteAssessmentRepository', () => {
  const dbRoot = './tmp/test-db-assessment-repo';
  let client: any;
  let repository: any;

  beforeEach(() => {
    if (fs.existsSync(dbRoot)) {
      fs.rmSync(dbRoot, { recursive: true });
    }
    fs.mkdirSync(dbRoot, { recursive: true });

    client = createSQLiteTenantClient({
      dbRoot,
      filePattern: '{tenantId}.db',
      migrationsDir: './migrations/sqlite',
    });
    repository = createSQLiteAssessmentRepository(client);
  });

  it('saves and retrieves an assessment with all fields', () => {
    const assessment: Assessment = {
      id: 'a1',
      tenantId: 't1',
      title: 'Test Assessment',
      description: 'A test description',
      collectionId: undefined,
      tags: [],
      metadata: {},
      itemIds: ['i1', 'i2'],
      allowedAttempts: 3,
      timeLimitMinutes: 45,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    repository.save(assessment);
    const retrieved = repository.getById('t1', 'a1');

    expect(retrieved).toEqual(assessment);
  });

  it('lists assessments for a tenant', () => {
    const a1: Assessment = {
      id: 'a1',
      tenantId: 't1',
      title: 'A1',
      collectionId: undefined,
      tags: [],
      metadata: {},
      itemIds: ['i1'],
      allowedAttempts: 1,
      createdAt: '2023-01-01T10:00:00Z',
      updatedAt: '2023-01-01T10:00:00Z',
    };
    const a2: Assessment = {
      id: 'a2',
      tenantId: 't1',
      title: 'A2',
      collectionId: undefined,
      tags: [],
      metadata: {},
      itemIds: ['i2'],
      allowedAttempts: 1,
      createdAt: '2023-01-01T11:00:00Z',
      updatedAt: '2023-01-01T11:00:00Z',
    };
    const a3: Assessment = {
      id: 'a3',
      tenantId: 't2',
      title: 'A3',
      collectionId: undefined,
      tags: [],
      metadata: {},
      itemIds: ['i3'],
      allowedAttempts: 1,
      createdAt: '2023-01-01T12:00:00Z',
      updatedAt: '2023-01-01T12:00:00Z',
    };

    repository.save(a1);
    repository.save(a2);
    repository.save(a3);

    const listT1 = repository.list('t1');
    expect(listT1).toHaveLength(2);
    expect(listT1.map(a => a.id)).toContain('a1');
    expect(listT1.map(a => a.id)).toContain('a2');
    expect(listT1.map(a => a.id)).not.toContain('a3');
  });

  it('updates an existing assessment', () => {
    const assessment: Assessment = {
      id: 'a1',
      tenantId: 't1',
      title: 'Original',
      collectionId: undefined,
      tags: [],
      metadata: {},
      itemIds: ['i1'],
      allowedAttempts: 1,
      createdAt: '2023-01-01T10:00:00Z',
      updatedAt: '2023-01-01T10:00:00Z',
    };

    repository.save(assessment);

    const updated: Assessment = {
      ...assessment,
      title: 'Updated',
      allowedAttempts: 5,
      updatedAt: '2023-01-01T12:00:00Z',
    };

    repository.save(updated);
    const retrieved = repository.getById('t1', 'a1');

    expect(retrieved?.title).toBe('Updated');
    expect(retrieved?.allowedAttempts).toBe(5);
    expect(retrieved?.updatedAt).toBe('2023-01-01T12:00:00Z');
  });
});
