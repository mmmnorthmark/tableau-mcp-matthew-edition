import { appendFile } from 'node:fs/promises';

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { getExceptionMessage } from '../utils/getExceptionMessage.js';
import type { LogEntry } from './types.js';

let _fileLogger: FileLogger | undefined;

export const setFileLogger = (logger: FileLogger): void => {
  _fileLogger = logger;
};

export const getFileLogger = (): FileLogger | undefined => _fileLogger;

export class FileLogger {
  private readonly _logDirectory: string;
  private readonly _fileMutexes = new Map<string, Promise<void>>();
  private readonly _consoleOutput: boolean;

  constructor({
    logDirectory,
    consoleOutput = true,
  }: {
    logDirectory: string;
    consoleOutput?: boolean;
  }) {
    this._logDirectory = logDirectory;
    this._consoleOutput = consoleOutput;

    if (!existsSync(this._logDirectory)) {
      mkdirSync(this._logDirectory, { recursive: true });
    }
  }

  async log(entry: LogEntry): Promise<void> {
    // Create a new log file each hour e.g. 2025-10-15T21-00-00-000Z.log
    const timestamp = new Date().toISOString();
    const filename = `${new Date(new Date().setMinutes(0, 0, 0)).toISOString().replace(/[:.]/g, '-')}.log`;
    const logFilePath = join(this._logDirectory, filename);

    // Also output to console if enabled
    if (this._consoleOutput) {
      const logEntry = { timestamp, ...entry };
      const level = (entry.level as string) || 'info';

      // Format console output for readability
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

      if (typeof entry.message === 'string') {
        // Simple string message
        console.error(`${prefix} ${entry.message}`);
      } else if (entry.message && typeof entry.message === 'object') {
        // Structured message object
        console.error(`${prefix} ${JSON.stringify(entry.message, null, 2)}`);
      } else {
        // Full log entry
        console.error(`${prefix} ${JSON.stringify(logEntry, null, 2)}`);
      }
    }

    // Get or create a mutex for this specific log file
    const mutexKey = logFilePath;
    const currentMutex = this._fileMutexes.get(mutexKey) ?? Promise.resolve();

    // Chain the file write operation after the current mutex
    const newMutex = currentMutex.then(async () => {
      try {
        // appendFile will create the file if it doesn't exist
        await appendFile(logFilePath, JSON.stringify({ timestamp, ...entry }) + '\n');
      } catch (error) {
        process.stderr.write(
          `Failed to write to log file ${logFilePath}: ${getExceptionMessage(error)}\n`,
        );
      }
    });

    this._fileMutexes.set(mutexKey, newMutex);

    // Clean up completed mutexes to prevent memory leaks
    newMutex.finally(() => {
      if (this._fileMutexes.get(mutexKey) === newMutex) {
        this._fileMutexes.delete(mutexKey);
      }
    });

    // Wait for the file write operation to complete
    await newMutex;
  }
}
