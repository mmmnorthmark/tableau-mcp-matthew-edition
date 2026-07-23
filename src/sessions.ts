import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';

import { log } from './logging/logger.js';
import { ClientInfo } from './server.js';

export type Session = {
  transport: StreamableHTTPServerTransport;
  clientInfo: ClientInfo;
  mcpServerUrl?: string;
};

const sessions: { [sessionId: string]: Session } = {};

export const createSession = ({
  clientInfo,
  mcpServerUrl,
}: {
  clientInfo: ClientInfo;
  mcpServerUrl?: string;
}): StreamableHTTPServerTransport => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      sessions[sessionId] = { transport, clientInfo, mcpServerUrl };
      log({ message: `Session created: ${sessionId}`, level: 'debug', logger: 'session' });
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      deleteSession(transport.sessionId);
    }
  };

  return transport;
};

export const getSession = (sessionId: string): Session | undefined => {
  return sessions[sessionId];
};

const deleteSession = (sessionId: string): void => {
  delete sessions[sessionId];
  log({ message: `Session closed: ${sessionId}`, level: 'debug', logger: 'session' });
};
