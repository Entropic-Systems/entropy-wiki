import { Request, Response, NextFunction } from 'express';
import { getAdminPasswordHash, comparePassword } from '../utils/auth.js';

/**
 * Admin authentication middleware
 * Validates the X-Admin-Password header against the configured admin password
 */
export async function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const password = req.headers['x-admin-password'] as string;

  if (!password) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Admin password required in X-Admin-Password header'
    });
  }

  try {
    const adminPasswordHash = await getAdminPasswordHash();
    const isValid = await comparePassword(password, adminPasswordHash);

    if (!isValid) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid admin password'
      });
    }

    next();
  } catch (authErr) {
    console.error('Auth configuration error:', authErr);
    return res.status(500).json({
      error: 'config_error',
      message: 'Server not configured for admin access'
    });
  }
}