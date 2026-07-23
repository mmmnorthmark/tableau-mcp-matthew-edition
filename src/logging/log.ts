import { LoggingLevel, RequestId } from '@modelcontextprotocol/sdk/types.js';

import { Server } from '../server.js';
import { log as baseLog } from './logger.js';

// Compatibility shim for fork code (asset serving, pulse render tools) that was
// written against the pre-restructure `log.info(server, message, options)` API.
// Delegates to the upstream structured logger. The `server` argument is accepted
// for call-site compatibility but no longer used for MCP notifications.

type LogMethodOptions = Partial<{ logger: string; requestId: RequestId }>;

function getLogFn(
  level: LoggingLevel,
): (server: Server, message: string, options?: LogMethodOptions) => void {
  return (_server, message, options = {}) => {
    baseLog({
      message: options.requestId ? `requestId=${options.requestId} ${message}` : message,
      level,
      logger: options.logger ?? 'server',
    });
  };
}

export const log = {
  debug: getLogFn('debug'),
  info: getLogFn('info'),
  notice: getLogFn('notice'),
  warning: getLogFn('warning'),
  warn: getLogFn('warning'),
  error: getLogFn('error'),
  critical: getLogFn('critical'),
  alert: getLogFn('alert'),
  emergency: getLogFn('emergency'),
};
