import { describe, expect, it } from 'vitest';
import { createAssessment } from '../assessment.model.js';

describe('createAssessment', () => {
  it('creates an assessment with default allowedAttempts', () => {
    const data = {
      id: 'a1',
      tenantId: 't1',
      title: 'Test',
      itemIds: ['i1'],
    };
    const assessment = createAssessment(data);
    expect(assessment.allowedAttempts).toBe(1);
    expect(assessment.createdAt).toBeDefined();
    expect(assessment.updatedAt).toBe(assessment.createdAt);
  });

  it('respects provided allowedAttempts', () => {
    const data = {
      id: 'a1',
      tenantId: 't1',
      title: 'Test',
      itemIds: ['i1'],
      allowedAttempts: 5,
    };
    const assessment = createAssessment(data);
    expect(assessment.allowedAttempts).toBe(5);
  });

  it('enforces minimum allowedAttempts of 1', () => {
    const data = {
      id: 'a1',
      tenantId: 't1',
      title: 'Test',
      itemIds: ['i1'],
      allowedAttempts: 0,
    };
    const assessment = createAssessment(data);
    expect(assessment.allowedAttempts).toBe(1);
  });
});
