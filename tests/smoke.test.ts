import { describe, it, expect } from 'vitest';
import { runDemo } from '../src/app';

describe('End-to-End System Smoke Test', () => {
  it('runs the end-to-end operational flow without throwing errors', () => {
    expect(() => runDemo()).not.toThrow();
  });
});
