import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, LoggingLevel } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import express, { Request, RequestHandler, Response } from 'express';
import fs, { existsSync } from 'fs';
import http from 'http';
import https from 'https';

import { Config } from '../config.js';
import { setLogLevel } from '../logging/log.js';
import { Server } from '../server.js';
import { createSession, getSession, Session } from '../sessions.js';
import { handleAssetRequest, handleDefaultsRequest } from './assetRoutes.js';
import { handlePingRequest, validateProtocolVersion } from './middleware.js';
import { getTableauAuthInfo } from './oauth/getTableauAuthInfo.js';
import { createOAuthProvider } from './oauth/providers/index.js';
import { TableauAuthInfo } from './oauth/schemas.js';
import { AuthenticatedRequest } from './oauth/types.js';

const SESSION_ID_HEADER = 'mcp-session-id';

/**
 * Compute the MCP server URL from the request headers or config.
 *
 * Priority:
 * 1. MCP_SERVER_URL env var (explicit override via config.mcpServerUrlOverride)
 * 2. X-Forwarded-Host + X-Forwarded-Proto from request (when trust proxy is enabled)
 * 3. Fall back to config.mcpServerUrl (localhost:port)
 */
function getMcpServerUrlFromRequest(req: Request, config: Config): string {
  // Explicit env var takes precedence
  if (config.mcpServerUrlOverride) {
    return config.mcpServerUrlOverride;
  }

  // Use Express's built-in handling (respects TRUST_PROXY_CONFIG)
  // req.get('host') uses X-Forwarded-Host when trust proxy is enabled
  // req.protocol uses X-Forwarded-Proto when trust proxy is enabled
  const host = req.get('host');
  if (host) {
    return `${req.protocol}://${host}`;
  }

  // Fall back to localhost
  return config.mcpServerUrl;
}

export async function startExpressServer({
  basePath,
  config,
  logLevel,
}: {
  basePath: string;
  config: Config;
  logLevel: LoggingLevel;
}): Promise<{ url: string; app: express.Application; server: http.Server }> {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded());

  app.use(
    cors({
      origin: config.corsOriginConfig,
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Cache-Control',
        'Accept',
        'MCP-Protocol-Version',
      ],
      exposedHeaders: [SESSION_ID_HEADER, 'x-session-id'],
    }),
  );

  if (config.trustProxyConfig !== null) {
    // https://expressjs.com/en/guide/behind-proxies.html
    app.set('trust proxy', config.trustProxyConfig);
  }

  const middleware: Array<RequestHandler> = [handlePingRequest];
  if (config.oauth.enabled) {
    const oauthProvider = createOAuthProvider();
    oauthProvider.setupRoutes(app);
    middleware.push(oauthProvider.authMiddleware);
    middleware.push(validateProtocolVersion);
  }

  const path = `/${basePath}`;
  app.post(path, ...middleware, createMcpServer);
  app.get(
    path,
    ...middleware,
    config.disableSessionManagement ? methodNotAllowed : handleSessionRequest,
  );
  app.delete(
    path,
    ...middleware,
    config.disableSessionManagement ? methodNotAllowed : handleSessionRequest,
  );

  // Asset serving endpoints with strict CORS
  const assetCors = cors({
    origin: config.assetCorsOrigins.length > 0 ? config.assetCorsOrigins : false,
    credentials: false,
    methods: ['GET'],
  });

  app.get(`/${basePath}/assets`, assetCors, (req: Request, res: Response) =>
    handleAssetRequest(req, res, config),
  );

  app.get(`/${basePath}/defaults/:filename`, assetCors, handleDefaultsRequest);

  const useSsl = !!(config.sslKey && config.sslCert);
  if (!useSsl) {
    return new Promise((resolve) => {
      const server = http
        .createServer(app)
        .listen(config.httpPort, () =>
          resolve({ url: `http://localhost:${config.httpPort}/${basePath}`, app, server }),
        );
    });
  }

  if (!existsSync(config.sslKey)) {
    throw new Error('SSL key file does not exist');
  }

  if (!existsSync(config.sslCert)) {
    throw new Error('SSL cert file does not exist');
  }

  const options = {
    key: fs.readFileSync(config.sslKey),
    cert: fs.readFileSync(config.sslCert),
  };

  return new Promise((resolve) => {
    const server = https
      .createServer(options, app)
      .listen(config.httpPort, () =>
        resolve({ url: `https://localhost:${config.httpPort}/${basePath}`, app, server }),
      );
  });

  async function createMcpServer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      let transport: StreamableHTTPServerTransport;

      // Compute the MCP server URL from request headers (for asset URL generation)
      const mcpServerUrl = getMcpServerUrlFromRequest(req, config);

      if (config.disableSessionManagement) {
        const server = new Server({ mcpServerUrl });
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });

        res.on('close', () => {
          transport.close();
          server.close();
        });

        await connect(server, transport, logLevel, getTableauAuthInfo(req.auth));
      } else {
        const sessionId = req.headers[SESSION_ID_HEADER] as string | undefined;

        let session: Session | undefined;
        if (sessionId && (session = getSession(sessionId))) {
          transport = session.transport;
        } else if (!sessionId && isInitializeRequest(req.body)) {
          const clientInfo = req.body.params.clientInfo;
          transport = createSession({ clientInfo, mcpServerUrl });

          const server = new Server({ clientInfo, mcpServerUrl });
          await connect(server, transport, logLevel, getTableauAuthInfo(req.auth));
        } else {
          // Invalid request
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          });
          return;
        }
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  }
}

async function connect(
  server: Server,
  transport: StreamableHTTPServerTransport,
  logLevel: LoggingLevel,
  authInfo: TableauAuthInfo | undefined,
): Promise<void> {
  await server.registerTools(authInfo);
  server.registerRequestHandlers();

  await server.connect(transport);
  setLogLevel(server, logLevel);
}

async function methodNotAllowed(_req: Request, res: Response): Promise<void> {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    }),
  );
}

async function handleSessionRequest(req: express.Request, res: express.Response): Promise<void> {
  const sessionId = req.headers[SESSION_ID_HEADER] as string | undefined;

  let session: Session | undefined;
  if (!sessionId || !(session = getSession(sessionId))) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  await session.transport.handleRequest(req, res);
}
