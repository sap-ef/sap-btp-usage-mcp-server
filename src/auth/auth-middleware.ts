import type { Request, Response, NextFunction } from 'express';
import { getXsuaaConfig } from './xsuaa-config.js';
import { 
  validateJwtToken, 
  extractTokenFromHeader, 
  getUserInfo,
  type TokenPayload 
} from './jwt-validator.js';

/**
 * Extended Express Request with authentication information
 */
export interface AuthenticatedRequest extends Request {
  auth?: {
    token: string;
    payload: TokenPayload;
    user: {
      userId: string;
      userName?: string;
      email?: string;
      clientId: string;
      scopes: string[];
      grantType: string;
    };
  };
}

/**
 * Authentication middleware for Express
 * Validates JWT token from Authorization header
 * 
 * Usage:
 *   app.post('/protected', authMiddleware, handler);
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Get XSUAA configuration
  const xsuaaConfig = getXsuaaConfig();
  
  // If auth is disabled, skip validation
  if (!xsuaaConfig) {
    console.log('⚠ Authentication bypassed (disabled or config not found)');
    next();
    return;
  }
  
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    console.error('✗ Unauthorized: missing or malformed Authorization header');
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header. Expected: Bearer <token>'
    });
    return;
  }

  // Validate token
  const validationResult = validateJwtToken(token, xsuaaConfig);

  if (!validationResult.valid || !validationResult.payload) {
    console.error('✗ Auth failed:', validationResult.error);
    res.status(401).json({
      error: 'Unauthorized',
      message: validationResult.error || 'Invalid token'
    });
    return;
  }
  
  // Attach authentication info to request
  req.auth = {
    token,
    payload: validationResult.payload,
    user: getUserInfo(validationResult.payload)
  };
  
  // Log authentication success
  console.log(`✓ Authenticated: ${req.auth.user.clientId} [${req.auth.user.grantType}]`);
  
  next();
}

/**
 * Optional authentication middleware
 * Validates token if present, but doesn't fail if missing
 * Useful for endpoints that work with or without authentication
 */
export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const xsuaaConfig = getXsuaaConfig();
  
  if (!xsuaaConfig) {
    next();
    return;
  }
  
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    // No token provided, continue without auth
    next();
    return;
  }
  
  const validationResult = validateJwtToken(token, xsuaaConfig);
  
  if (validationResult.valid && validationResult.payload) {
    req.auth = {
      token,
      payload: validationResult.payload,
      user: getUserInfo(validationResult.payload)
    };
    console.log(`✓ Authenticated (optional): ${req.auth.user.clientId}`);
  }
  
  // Continue regardless of token validity
  next();
}

/**
 * Middleware to require specific scope
 * Must be used after authMiddleware
 * 
 * Usage:
 *   app.post('/admin', authMiddleware, requireScope('admin'), handler);
 */
export function requireScope(...requiredScopes: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }
    
    const userScopes = req.auth.user.scopes;
    const xsuaaConfig = getXsuaaConfig();
    const xsappname = xsuaaConfig?.xsappname || '';
    
    // Check if user has any of the required scopes
    const hasRequiredScope = requiredScopes.some(scope => {
      const scopeWithPrefix = `${xsappname}.${scope}`;
      return userScopes.includes(scope) || userScopes.includes(scopeWithPrefix);
    });
    
    if (!hasRequiredScope) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Required scope: ${requiredScopes.join(' or ')}`,
        userScopes
      });
      return;
    }
    
    next();
  };
}

/**
 * Middleware to validate MCP protocol version header
 */
export function validateMcpProtocol(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const protocolVersion = req.headers['mcp-protocol-version'];

  // Log whatever version the client sends (for diagnostics)
  if (protocolVersion) {
    console.log(`MCP protocol version from client: ${protocolVersion}`);
  }

  // Let the MCP SDK handle protocol version negotiation internally.
  // Blocking unknown versions here causes compatibility issues with clients
  // like Joule Studio that may send different versions on subsequent requests.
  next();
}
