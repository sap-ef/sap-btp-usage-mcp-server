import jwt from 'jsonwebtoken';
import type { XsuaaCredentials } from './xsuaa-config.js';

/**
 * Decoded JWT Token Payload
 */
export interface TokenPayload {
  sub: string;
  scope: string[];
  client_id: string;
  cid: string;
  azp: string;
  grant_type: string;
  user_id?: string;
  user_name?: string;
  email?: string;
  iat: number;
  exp: number;
  iss: string;
  zid: string;
  aud: string[];
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
}

/**
 * Validate JWT token using XSUAA public key
 * 
 * @param token - JWT token string
 * @param xsuaaConfig - XSUAA credentials containing verification key
 * @returns TokenValidationResult
 */
export function validateJwtToken(
  token: string,
  xsuaaConfig: XsuaaCredentials
): TokenValidationResult {
  try {
    // Extract verification key (public key) from XSUAA config
    const publicKey = xsuaaConfig.verificationkey;
    
    if (!publicKey) {
      return {
        valid: false,
        error: 'XSUAA verification key not found'
      };
    }
    
    // Prepare public key in PEM format if needed
    const pemKey = publicKey.startsWith('-----BEGIN')
      ? publicKey
      : `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
    
    // Verify token with RS256 algorithm
    const decoded = jwt.verify(token, pemKey, {
      algorithms: ['RS256'],
      issuer: `${xsuaaConfig.url}/oauth/token`,
      clockTolerance: 30 // Allow 30 seconds clock skew
    }) as TokenPayload;
    
    // Additional validation: check if token is for our app
    // Accept both the app client (xsappname) and the service broker client (sb-xsappname)
    const expectedAudience = xsuaaConfig.xsappname;
    const sbAudience = `sb-${expectedAudience}`;
    const hasValidAudience = decoded.aud?.some(aud =>
      aud === expectedAudience ||
      aud.startsWith(expectedAudience) ||
      aud === sbAudience
    );

    if (!hasValidAudience) {
      return {
        valid: false,
        error: `Invalid audience. Expected: ${expectedAudience} or ${sbAudience}`
      };
    }
    
    return {
      valid: true,
      payload: decoded
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return {
        valid: false,
        error: 'Token has expired'
      };
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return {
        valid: false,
        error: `Invalid token: ${error.message}`
      };
    }
    
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Extract token from Authorization header
 * 
 * @param authHeader - Authorization header value (e.g., "Bearer <token>")
 * @returns Token string or null if invalid format
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }
  
  const parts = authHeader.split(' ');
  
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Check if token has required scope
 * 
 * @param payload - Decoded token payload
 * @param requiredScope - Scope to check (e.g., "access", "read", "admin")
 * @param xsappname - XSUAA app name for scope prefix
 * @returns boolean
 */
export function hasRequiredScope(
  payload: TokenPayload,
  requiredScope: string,
  xsappname: string
): boolean {
  if (!payload.scope || payload.scope.length === 0) {
    return false;
  }
  
  // Check both with and without xsappname prefix
  const scopeWithPrefix = `${xsappname}.${requiredScope}`;
  
  return payload.scope.includes(requiredScope) || 
         payload.scope.includes(scopeWithPrefix);
}

/**
 * Get user information from token
 * 
 * @param payload - Decoded token payload
 * @returns User info object
 */
export function getUserInfo(payload: TokenPayload) {
  return {
    userId: payload.user_id || payload.sub,
    userName: payload.user_name,
    email: payload.email,
    clientId: payload.client_id || payload.cid,
    scopes: payload.scope || [],
    grantType: payload.grant_type
  };
}
