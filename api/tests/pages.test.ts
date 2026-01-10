import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-password';

describe('API Endpoints', () => {
  describe('GET /health', () => {
    it('should return ok status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /pages', () => {
    it('should return pages array', async () => {
      const response = await request(app).get('/pages');
      expect(response.status).toBe(200);
      expect(response.body.pages).toBeDefined();
      expect(Array.isArray(response.body.pages)).toBe(true);
    });
  });

  describe('GET /pages/:slug', () => {
    it('should return 404 for non-existent page', async () => {
      const response = await request(app).get('/pages/non-existent-page-12345');
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('not_found');
    });
  });

  describe('Admin Routes - Authentication', () => {
    it('should reject requests without password', async () => {
      const response = await request(app).get('/admin/pages');
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('unauthorized');
    });

    it('should reject requests with wrong password', async () => {
      const response = await request(app)
        .get('/admin/pages')
        .set('X-Admin-Password', 'wrong-password');
      expect(response.status).toBe(401);
    });

    it('should accept requests with correct password', async () => {
      const response = await request(app)
        .get('/admin/pages')
        .set('X-Admin-Password', ADMIN_PASSWORD);
      expect(response.status).toBe(200);
      expect(response.body.pages).toBeDefined();
    });
  });

  describe('Admin CRUD Operations', () => {
    let testPageId: string;

    it('should create a new page', async () => {
      const response = await request(app)
        .post('/admin/pages')
        .set('X-Admin-Password', ADMIN_PASSWORD)
        .send({
          title: 'Test Page',
          slug: 'test-page-vitest',
          content_md: '# Test\n\nTest content.',
        });

      expect(response.status).toBe(201);
      expect(response.body.page).toBeDefined();
      expect(response.body.page.title).toBe('Test Page');
      expect(response.body.page.slug).toBe('test-page-vitest');
      testPageId = response.body.page.id;
    });

    it('should reject duplicate slugs', async () => {
      const response = await request(app)
        .post('/admin/pages')
        .set('X-Admin-Password', ADMIN_PASSWORD)
        .send({
          title: 'Duplicate Test',
          slug: 'test-page-vitest',
          content_md: '# Duplicate',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('conflict');
    });

    it('should update a page', async () => {
      const response = await request(app)
        .patch(`/admin/pages/${testPageId}`)
        .set('X-Admin-Password', ADMIN_PASSWORD)
        .send({
          title: 'Updated Test Page',
          content_md: '# Updated\n\nUpdated content.',
        });

      expect(response.status).toBe(200);
      expect(response.body.page.title).toBe('Updated Test Page');
    });

    it('should publish a page', async () => {
      const response = await request(app)
        .post(`/admin/pages/${testPageId}/publish`)
        .set('X-Admin-Password', ADMIN_PASSWORD);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('published');
    });

    it('should show published page in public endpoint', async () => {
      const response = await request(app).get('/pages/test-page-vitest');
      expect(response.status).toBe(200);
      expect(response.body.page.title).toBe('Updated Test Page');
    });

    it('should unpublish a page', async () => {
      const response = await request(app)
        .post(`/admin/pages/${testPageId}/unpublish`)
        .set('X-Admin-Password', ADMIN_PASSWORD);

      expect(response.status).toBe(200);
    });

    it('should hide unpublished page from public endpoint', async () => {
      const response = await request(app).get('/pages/test-page-vitest');
      expect(response.status).toBe(404);
    });

    it('should delete a page', async () => {
      const response = await request(app)
        .delete(`/admin/pages/${testPageId}`)
        .set('X-Admin-Password', ADMIN_PASSWORD);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for deleted page', async () => {
      const response = await request(app)
        .get(`/admin/pages/${testPageId}`)
        .set('X-Admin-Password', ADMIN_PASSWORD);

      expect(response.status).toBe(404);
    });
  });

  describe('Validation', () => {
    it('should reject page creation without required fields', async () => {
      const response = await request(app)
        .post('/admin/pages')
        .set('X-Admin-Password', ADMIN_PASSWORD)
        .send({
          title: 'Missing Fields',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('validation_error');
    });
  });
});
