import { randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { Db } from './db.ts';
import { isSupabaseMode, type Config } from './env.ts';
import { HttpError } from './errors.ts';

export interface AuthUser {
  id: string;
  isAnonymous: boolean;
}

export interface Auth {
  mode: 'supabase' | 'dev';
  verify(token: string): Promise<AuthUser>;
  /** Dev mode only: creates a guest user and returns a signed token. */
  createDevGuest?(): Promise<{ token: string; userId: string }>;
}

const DEV_ISSUER = 'taipei-guessr-dev';

function toUser(payload: JWTPayload): AuthUser {
  if (!payload.sub) throw new HttpError(401, 'unauthorized', 'Token has no subject');
  return { id: payload.sub, isAnonymous: Boolean((payload as { is_anonymous?: boolean }).is_anonymous) };
}

export function createAuth(cfg: Config, db: Db): Auth {
  if (isSupabaseMode(cfg)) {
    const issuer = `${cfg.supabaseUrl}/auth/v1`;
    const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    const secret = cfg.supabaseJwtSecret ? new TextEncoder().encode(cfg.supabaseJwtSecret) : null;
    return {
      mode: 'supabase',
      async verify(token) {
        try {
          // Projects using the legacy shared secret sign with HS256; newer ones use asymmetric keys (JWKS).
          const { payload } = secret
            ? await jwtVerify(token, secret, { issuer, audience: 'authenticated' })
            : await jwtVerify(token, jwks, { issuer, audience: 'authenticated' });
          return toUser(payload);
        } catch {
          throw new HttpError(401, 'unauthorized', 'Invalid or expired token');
        }
      },
    };
  }

  const key = new TextEncoder().encode(cfg.devJwtSecret);
  return {
    mode: 'dev',
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, { issuer: DEV_ISSUER });
        return toUser(payload);
      } catch {
        throw new HttpError(401, 'unauthorized', 'Invalid or expired token');
      }
    },
    async createDevGuest() {
      const userId = randomUUID();
      await db.query('insert into auth.users (id, is_anonymous) values ($1, true)', [userId]);
      const token = await new SignJWT({ is_anonymous: true })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer(DEV_ISSUER)
        .setIssuedAt()
        .setExpirationTime('365d')
        .sign(key);
      return { token, userId };
    },
  };
}
