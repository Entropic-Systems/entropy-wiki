import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plain text password with a hashed password
 */
export async function comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * Get hashed admin password from environment
 * In production, ADMIN_PASSWORD_HASH should be pre-generated using bcrypt
 */
export async function getAdminPasswordHash(): Promise<string> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

  if (adminPasswordHash) {
    // Production: use pre-hashed password
    return adminPasswordHash;
  }

  if (adminPassword) {
    // Development/Test: hash the plain password (with warning)
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Using plain ADMIN_PASSWORD - for production, use ADMIN_PASSWORD_HASH instead');
    }
    return hashPassword(adminPassword);
  }

  throw new Error('Neither ADMIN_PASSWORD nor ADMIN_PASSWORD_HASH is set');
}