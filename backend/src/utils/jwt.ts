import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Access token lifetime:
// - Defaults to 8 hours for a typical workday session
// - Can be overridden via JWT_ACCESS_EXPIRY env var (e.g. "2h", "30m", "1d")
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '8h';

// Refresh token lifetime (used for long‑lived sessions / re-issuing access tokens)
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

export interface TokenPayload {
  userId: number;
  email: string;
  role: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_EXPIRY as string | number
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: REFRESH_EXPIRY as string | number
  });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
};

