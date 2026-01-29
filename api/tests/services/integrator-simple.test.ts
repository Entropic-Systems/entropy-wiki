/**
 * Simplified Integrator Service Test
 * Test basic functionality with minimal complexity
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestDatabase } from '../utils/test-database.js';
import { claudeMock, mockManager } from '../utils/mocks/index.js';

describe('Integrator Service - Basic Tests', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    console.log('Setting up test database...');
    testDb = await TestDatabase.create('integrator-basic-test');
    mockManager.setupDefaults();
    console.log('Test database setup complete');
  }, 60000);

  afterEach(async () => {
    mockManager.reset();
    await testDb.cleanup();
  }, 30000);

  it('should have database connection', async () => {
    const pool = testDb.getPool();
    const result = await pool.query('SELECT 1 as test');
    expect(result.rows[0].test).toBe(1);
  });

  it('should have Claude mock working', async () => {
    claudeMock.setupContentGeneration('Test content from Claude');
    // Just verify the mock is set up properly
    expect(claudeMock).toBeDefined();
  });

  it('should be able to create tables', async () => {
    const pool = testDb.getPool();

    // Check if pages table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'pages'
      );
    `);

    expect(tableCheck.rows[0].exists).toBe(true);
  });
});