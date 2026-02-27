import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth-middleware.js';
import { randomUUID } from 'crypto';

/**
 * SSE Connection Manager
 * Manages active Server-Sent Events connections
 */
class SseConnectionManager {
  private connections: Map<string, Response> = new Map();
  
  /**
   * Add a new SSE connection
   */
  addConnection(sessionId: string, res: Response): void {
    this.connections.set(sessionId, res);
    console.log(`✓ SSE connection established: ${sessionId} (total: ${this.connections.size})`);
  }
  
  /**
   * Remove SSE connection
   */
  removeConnection(sessionId: string): void {
    this.connections.delete(sessionId);
    console.log(`✓ SSE connection closed: ${sessionId} (total: ${this.connections.size})`);
  }
  
  /**
   * Send event to specific session
   */
  sendToSession(sessionId: string, event: string, data: unknown): boolean {
    const res = this.connections.get(sessionId);
    if (res) {
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        return true;
      } catch (error) {
        console.error(`Error sending to session ${sessionId}:`, error);
        this.removeConnection(sessionId);
        return false;
      }
    }
    return false;
  }
  
  /**
   * Broadcast event to all connections
   */
  broadcast(event: string, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.connections.forEach((res, sessionId) => {
      try {
        res.write(message);
      } catch (error) {
        console.error(`Error broadcasting to ${sessionId}:`, error);
        this.removeConnection(sessionId);
      }
    });
  }
  
  /**
   * Get number of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }
  
  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.connections.keys());
  }
}

// Global SSE manager instance
export const sseManager = new SseConnectionManager();

/**
 * SSE Handler for MCP Server
 * Implements Server-Sent Events endpoint with authentication
 * 
 * Usage in Express:
 *   app.get('/mcp/sse', authMiddleware, sseHandler);
 */
export function sseHandler(req: AuthenticatedRequest, res: Response): void {
  // Generate unique session ID
  const sessionId = randomUUID();
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust for production
  
  // Add custom MCP headers
  res.setHeader('Mcp-Session-Id', sessionId);
  res.setHeader('Mcp-Protocol-Version', req.headers['mcp-protocol-version'] || '2025-03-26');
  
  // Flush headers immediately
  res.flushHeaders();
  
  // Configure socket timeout
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  
  // Send initial connection event
  const connectionData = {
    sessionId,
    timestamp: new Date().toISOString(),
    server: 'sap-btp-usage-mcp-server',
    version: '1.0.0',
    authenticated: !!req.auth,
    user: req.auth ? {
      clientId: req.auth.user.clientId,
      scopes: req.auth.user.scopes,
      grantType: req.auth.user.grantType
    } : undefined
  };
  
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify(connectionData)}\n\n`);
  
  // Add connection to manager
  sseManager.addConnection(sessionId, res);
  
  // Setup heartbeat to keep connection alive (every 30 seconds)
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`:heartbeat ${Date.now()}\n\n`);
    } catch (error) {
      console.error(`Heartbeat failed for session ${sessionId}:`, error);
      cleanup();
    }
  }, 30000);
  
  // Cleanup function
  const cleanup = () => {
    clearInterval(heartbeatInterval);
    sseManager.removeConnection(sessionId);
    
    try {
      res.end();
    } catch (error) {
      // Connection already closed
    }
  };
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`✓ Client disconnected: ${sessionId}`);
    cleanup();
  });
  
  req.on('error', (error) => {
    console.error(`✗ Connection error for ${sessionId}:`, error);
    cleanup();
  });
  
  // Auto-disconnect after 1 hour (3600000ms)
  const autoDisconnectTimeout = setTimeout(() => {
    console.log(`✓ Auto-disconnect after timeout: ${sessionId}`);
    
    // Send session expired event
    try {
      res.write(`event: session-expired\n`);
      res.write(`data: ${JSON.stringify({ 
        message: 'Session expired after 1 hour',
        sessionId 
      })}\n\n`);
    } catch (error) {
      // Ignore if connection already closed
    }
    
    cleanup();
  }, 3600000); // 1 hour
  
  // Clear timeout on manual disconnect
  req.on('close', () => {
    clearTimeout(autoDisconnectTimeout);
  });
}

/**
 * Helper to send MCP event to specific session
 */
export function sendMcpEvent(
  sessionId: string,
  eventType: string,
  eventData: unknown
): boolean {
  return sseManager.sendToSession(sessionId, eventType, eventData);
}

/**
 * Helper to broadcast MCP event to all sessions
 */
export function broadcastMcpEvent(
  eventType: string,
  eventData: unknown
): void {
  sseManager.broadcast(eventType, eventData);
}

/**
 * Get SSE statistics
 */
export function getSseStats() {
  return {
    activeConnections: sseManager.getConnectionCount(),
    sessionIds: sseManager.getSessionIds()
  };
}
