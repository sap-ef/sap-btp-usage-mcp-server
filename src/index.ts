import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { registerTools } from './tools/usage-tools.js';
import { authMiddleware, validateMcpProtocol, type AuthenticatedRequest } from './auth/auth-middleware.js';
import { sseHandler, getSseStats } from './sse/sse-handler.js';
import { getXsuaaConfig } from './auth/xsuaa-config.js';

// Initialize MCP Server
const server = new McpServer({
  name: 'sap-btp-usage-mcp-server',
  version: '1.0.0'
});

// Register all tools
registerTools(server);

// Create Express app for HTTP transport
const app = express();
app.use(express.json());

// Validate MCP protocol version
app.use(validateMcpProtocol);

// Health check endpoint (required for CF)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', server: 'sap-btp-usage-mcp-server' });
});

// Info endpoint
app.get('/', (_req: Request, res: Response) => {
  const xsuaaConfig = getXsuaaConfig();
  const authStatus = xsuaaConfig 
    ? `enabled (zone: ${xsuaaConfig.identityzone || 'N/A'})` 
    : 'disabled';
  const sseStats = getSseStats();
  
  res.json({
    name: 'sap-btp-usage-mcp-server',
    version: '1.0.0',
    description: 'MCP server for SAP BTP Resource Consumption / Usage Data Management API',
    authentication: authStatus,
    endpoints: {
      mcp: '/mcp (POST)',
      sse: '/mcp/sse (GET)',
      health: '/health',
      metadata: '/.well-known/oauth-authorization-server'
    },
    sse: {
      activeConnections: sseStats.activeConnections,
      sessionIds: sseStats.sessionIds
    },
    tools: [
      'sap_btp_get_cloud_credits',
      'sap_btp_top_services',
      'sap_btp_compare_months',
      'sap_btp_check_overusage',
      'sap_btp_new_services',
      'sap_btp_cost_summary'
    ]
  });
});

// MCP endpoint - Streamable HTTP transport (PROTECTED)
app.post('/mcp', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Log authentication info if available
    const authReq = req as AuthenticatedRequest;
    if (authReq.auth) {
      console.log(`MCP request from: ${authReq.auth.user.clientId}`);
    }

    // Create new transport for each request (stateless, prevents request ID collisions)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    
    // Clean up on connection close
    res.on('close', () => {
      transport.close();
    });
    
    // Connect server to transport and handle request
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// SSE endpoint for Server-Sent Events (PROTECTED)
app.get('/mcp/sse', authMiddleware, sseHandler);

// OAuth Authorization Server Metadata (RFC 8414)
app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
  const xsuaaConfig = getXsuaaConfig();
  
  if (!xsuaaConfig) {
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'XSUAA configuration not available'
    });
    return;
  }
  
  const baseUrl = xsuaaConfig.url;
  
  res.json({
    issuer: `${baseUrl}/oauth/token`,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    jwks_uri: `${baseUrl}/token_keys`,
    scopes_supported: ['access', 'read', 'admin'],
    response_types_supported: ['code', 'token'],
    grant_types_supported: [
      'client_credentials',
      'authorization_code',
      'refresh_token'
    ],
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post'
    ],
    code_challenge_methods_supported: ['S256'],
    service_documentation: 'https://help.sap.com/docs/btp/sap-business-technology-platform/authorization-and-trust-management-service'
  });
});

// Start server
const port = parseInt(process.env.PORT || '3000', 10);

app.listen(port, () => {
  console.log(`SAP BTP Usage MCP Server running on port ${port}`);
  console.log(`  - MCP endpoint: http://localhost:${port}/mcp (POST - Protected)`);
  console.log(`  - SSE endpoint: http://localhost:${port}/mcp/sse (GET - Protected)`);
  console.log(`  - Health check: http://localhost:${port}/health`);
  console.log(`  - Info: http://localhost:${port}/`);
  console.log(`  - OAuth Metadata: http://localhost:${port}/.well-known/oauth-authorization-server`);
  console.log('');
  console.log('Environment:');
  console.log(`  - UAS_DESTINATION_NAME: ${process.env.UAS_DESTINATION_NAME || 'SAP_BTP_USAGE_API (default)'}`);
  
  const xsuaaConfig = getXsuaaConfig();
  if (xsuaaConfig) {
    console.log(`  - Authentication: ENABLED`);
    console.log(`  - Identity Zone: ${xsuaaConfig.identityzone || 'N/A'}`);
    console.log(`  - XSUAA URL: ${xsuaaConfig.url}`);
  } else {
    console.log(`  - Authentication: DISABLED (set AUTH_ENABLED=true to enable)`);
  }
});

export { app, server };
