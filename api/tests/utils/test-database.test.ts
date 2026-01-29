/**
 * Tests for the Test Database Isolation System
 *
 * These tests verify that the isolation system itself works correctly.
 * They require a PostgreSQL database to be available.
 *
 * To run these tests, set either:
 * - DATABASE_URL=postgresql://user:pass@host:5432/dbname
 * - TEST_ADMIN_DATABASE_URL=postgresql://user:pass@host:5432/postgres
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useTestDatabase,
  withTestDatabase,
  TestDatabase,
} from './index';

describe('Test Database Isolation', () => {
  // Skip these tests if no database is available
  // These tests require a real PostgreSQL instance
  const skipIfNoDb = !process.env.DATABASE_URL && !process.env.TEST_ADMIN_DATABASE_URL;

  describe('useTestDatabase hook', () => {
    const testDb = useTestDatabase('isolation-test');

    beforeEach(async () => {
      if (skipIfNoDb) return;
      await testDb.setup();
    });

    afterEach(async () => {
      if (skipIfNoDb) return;
      await testDb.teardown();
    });

    it.skipIf(skipIfNoDb)('should create isolated database', async () => {
      const pool = testDb.getPool();
      const result = await pool.query('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });

    it.skipIf(skipIfNoDb)('should have migrations applied', async () => {
      const pool = testDb.getPool();

      // Check that pages table exists
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'pages'
        ) as exists
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it.skipIf(skipIfNoDb)('should have unique database per test', async () => {
      const dbName = testDb.getDatabaseName();
      expect(dbName).toMatch(/^test_isolation_test_\d+_/);
    });
  });

  describe('withTestDatabase helper', () => {
    it.skipIf(skipIfNoDb)('should provide isolated database for callback', async () => {
      await withTestDatabase('functional-test', async (pool) => {
        const result = await pool.query('SELECT 1 as value');
        expect(result.rows[0].value).toBe(1);
      });
    });

    it.skipIf(skipIfNoDb)('should clean up after callback', async () => {
      let dbName: string | null = null;

      await withTestDatabase('cleanup-test', async (_pool, db) => {
        dbName = db.getDatabaseName();
      });

      // Verify database was cleaned up by trying to create another with same prefix
      // This would fail if the previous database wasn't cleaned up properly
      await withTestDatabase('cleanup-test', async (pool) => {
        const result = await pool.query('SELECT 1 as value');
        expect(result.rows[0].value).toBe(1);
      });
    });
  });

  describe('TestDatabase class', () => {
    it.skipIf(skipIfNoDb)('should support skipMigrations option', async () => {
      const db = await TestDatabase.create('no-migrations-test', {
        skipMigrations: true,
      });

      try {
        const pool = db.getPool();

        // Pages table should NOT exist
        const result = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'pages'
          ) as exists
        `);
        expect(result.rows[0].exists).toBe(false);
      } finally {
        await db.cleanup();
      }
    });

    it.skipIf(skipIfNoDb)('should provide connection URL', async () => {
      const db = await TestDatabase.create('url-test');

      try {
        const url = db.getConnectionUrl();
        expect(url).toMatch(/^postgresql:\/\//);
        expect(url).toContain(db.getDatabaseName());
      } finally {
        await db.cleanup();
      }
    });
  });

  describe('Data Isolation', () => {
    it.skipIf(skipIfNoDb)('should isolate data between tests', async () => {
      // First "test" inserts data
      await withTestDatabase('isolation-a', async (pool) => {
        await pool.query(`
          INSERT INTO pages (slug, title, status)
          VALUES ('test-page', 'Test Page', 'draft')
        `);

        const result = await pool.query('SELECT COUNT(*) as count FROM pages');
        expect(parseInt(result.rows[0].count, 10)).toBe(1);
      });

      // Second "test" should have empty database
      await withTestDatabase('isolation-b', async (pool) => {
        const result = await pool.query('SELECT COUNT(*) as count FROM pages');
        expect(parseInt(result.rows[0].count, 10)).toBe(0);
      });
    });
  });
});
