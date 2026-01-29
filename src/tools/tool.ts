import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult, RequestId, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { ZodiosError } from '@zodios/core';
import { Result } from 'ts-results-es';
import { z, ZodRawShape, ZodTypeAny } from 'zod';
import { fromError, isZodErrorLike } from 'zod-validation-error';

import { getToolLogMessage, log } from '../logging/log.js';
import { Server } from '../server.js';
import { tableauAuthInfoSchema } from '../server/oauth/schemas.js';
import { getTelemetryProvider } from '../telemetry/init.js';
import { getExceptionMessage } from '../utils/getExceptionMessage.js';
import { Provider, TypeOrProvider } from '../utils/provider.js';
import { ToolName } from './toolName.js';

type ArgsValidator<Args extends ZodRawShape | undefined = undefined> = Args extends ZodRawShape
  ? (args: z.objectOutputType<Args, ZodTypeAny>) => void
  : never;

export type ConstrainedResult<T> =
  | {
      type: 'success';
      result: T;
    }
  | {
      type: 'empty';
      message: string;
    }
  | {
      type: 'error';
      message: string;
    };

/**
 * The parameters for creating a tool instance
 *
 * @typeParam Args - The schema of the tool's parameters
 */
export type ToolParams<Args extends ZodRawShape | undefined = undefined> = {
  // The MCP server instance
  server: Server;

  // The name of the tool
  name: ToolName;

  // The description of the tool
  description: TypeOrProvider<string>;

  // The schema of the tool's parameters
  paramsSchema: TypeOrProvider<Args>;

  // The annotations of the tool
  annotations: TypeOrProvider<ToolAnnotations>;

  // Optional title for the tool (used by OpenAI Apps SDK)
  title?: string;

  // Optional metadata for the tool (used by OpenAI Apps SDK)
  _meta?: Record<string, unknown>;

  // A function that validates the tool's arguments provided by the client
  argsValidator?: TypeOrProvider<ArgsValidator<Args>>;

  // The implementation of the tool itself
  callback: TypeOrProvider<ToolCallback<Args>>;
};

/**
 * The parameters the logAndExecute method
 *
 * @typeParam T - The type of the result the tool's implementation returns
 * @typeParam E - The type of the error the tool's implementation can return
 * @typeParam Args - The schema of the tool's parameters
 */
type LogAndExecuteParams<T, E, Args extends ZodRawShape | undefined = undefined> = {
  // The request ID of the tool call
  requestId: RequestId;

  // The Authentication info provided when OAuth is enabled
  authInfo: AuthInfo | undefined;

  // The arguments of the tool call
  args: Args extends ZodRawShape ? z.objectOutputType<Args, ZodTypeAny> : undefined;

  // A function that contains the business logic of the tool to be logged and executed
  callback: () => Promise<Result<T, E | ZodiosError>>;

  // A function that can transform a successful result of the callback into a CallToolResult
  getSuccessResult?: (result: T) => CallToolResult;

  // A function that can transform an error result of the callback into a string.
  // Required if the callback can return an error result.
  getErrorText?: (error: E) => string;

  // A function that constrains the success result of the tool
  constrainSuccessResult: (result: T) => ConstrainedResult<T> | Promise<ConstrainedResult<T>>;
};

/**
 * Represents an MCP tool
 *
 * @template Args - The schema of the tool's parameters or undefined if the tool has no parameters
 */
export class Tool<Args extends ZodRawShape | undefined = undefined> {
  server: Server;
  name: ToolName;
  description: TypeOrProvider<string>;
  paramsSchema: TypeOrProvider<Args>;
  annotations: TypeOrProvider<ToolAnnotations>;
  title?: string;
  _meta?: Record<string, unknown>;
  argsValidator?: TypeOrProvider<ArgsValidator<Args>>;
  callback: TypeOrProvider<ToolCallback<Args>>;

  constructor({
    server,
    name,
    description,
    paramsSchema,
    annotations,
    title,
    _meta,
    argsValidator,
    callback,
  }: ToolParams<Args>) {
    this.server = server;
    this.name = name;
    this.description = description;
    this.paramsSchema = paramsSchema;
    this.annotations = annotations;
    this.title = title;
    this._meta = _meta;
    this.argsValidator = argsValidator;
    this.callback = callback;
  }

  logInvocation({
    requestId,
    args,
    username,
  }: {
    requestId: RequestId;
    args: unknown;
    username?: string;
  }): void {
    log.debug(
      this.server,
      getToolLogMessage({
        requestId,
        toolName: this.name,
        args,
        username,
      }),
    );
  }

  // Overload for E = undefined (getErrorText omitted)
  async logAndExecute<T>(
    params: Omit<LogAndExecuteParams<T, undefined, Args>, 'getErrorText'>,
  ): Promise<CallToolResult>;

  // Overload for E != undefined (getSuccessResult omitted)
  async logAndExecute<T, E>(
    params: Required<Omit<LogAndExecuteParams<T, E, Args>, 'getSuccessResult'>>,
  ): Promise<CallToolResult>;

  // Overload for E != undefined (getErrorText required)
  async logAndExecute<T, E>(
    params: Required<LogAndExecuteParams<T, E, Args>>,
  ): Promise<CallToolResult>;

  // Implementation
  async logAndExecute<T, E>({
    requestId,
    args,
    authInfo,
    callback,
    getSuccessResult,
    getErrorText,
    constrainSuccessResult,
  }: LogAndExecuteParams<T, E, Args>): Promise<CallToolResult> {
    const username = authInfo?.extra
      ? tableauAuthInfoSchema.safeParse(authInfo.extra).data?.username
      : undefined;

    this.logInvocation({ requestId, args, username });

    // Record custom metric for this tool call
    const telemetry = getTelemetryProvider();
    telemetry.recordMetric('mcp.tool.calls', 1, {
      tool_name: this.name,
      request_id: requestId.toString(),
    });

    if (args) {
      try {
        (await Provider.from(this.argsValidator))?.(args);
      } catch (error) {
        return getErrorResult(requestId, error);
      }
    }

    try {
      const result = await callback();

      if (result.isOk()) {
        const constrainedResult = await constrainSuccessResult(result.value);

        if (constrainedResult.type !== 'success') {
          return {
            isError: constrainedResult.type === 'error',
            content: [{ type: 'text', text: constrainedResult.message }],
          };
        }

        if (getSuccessResult) {
          return getSuccessResult(constrainedResult.result);
        }

        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: JSON.stringify(constrainedResult.result),
            },
          ],
        };
      }

      if (result.error instanceof ZodiosError) {
        return getErrorResult(requestId, result.error);
      }

      if (getErrorText) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: getErrorText(result.error),
            },
          ],
        };
      } else {
        return getErrorResult(requestId, result.error);
      }
    } catch (error) {
      return getErrorResult(requestId, error);
    }
  }
}

function getErrorResult(requestId: RequestId, error: unknown): CallToolResult {
  // Log the error details to console for debugging
  console.error(`[Tool Error] requestId: ${requestId}`);
  console.error(`[Tool Error] Error type: ${error?.constructor?.name || typeof error}`);
  console.error(`[Tool Error] Error message: ${getExceptionMessage(error)}`);

  if (error instanceof Error && error.stack) {
    console.error(`[Tool Error] Stack trace:\n${error.stack}`);
  }

  if (error instanceof ZodiosError) {
    console.error(`[Tool Error] Zodios error details:`, {
      status: error.status,
      cause: error.cause,
      data: JSON.stringify(error.data, null, 2),
    });
  }

  if (error instanceof ZodiosError && isZodErrorLike(error.cause)) {
    // Schema validation errors on otherwise successful API calls will not return an "error" result to the MCP client.
    // We instead return the full response from the API with a data quality warning message
    // that mentions why the schema validation failed.
    // This should make it so users don't get "stuck" when our schemas are too strict or wrong.
    // The only con is that the full response from the API might be larger than normal
    // since a successful schema validation "trims" the response down to the shape of the schema.
    const validationError = fromError(error.cause);
    console.error(`[Tool Error] Validation error: ${validationError.toString()}`);

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            data: error.data,
            warning: validationError.toString(),
          }),
        },
      ],
    };
  }

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `requestId: ${requestId}, error: ${getExceptionMessage(error)}`,
      },
    ],
  };
}

/**
 * Represents an OpenAI Apps SDK tool (widget tool)
 * Extends the standard Tool class with Apps SDK-specific metadata
 *
 * @template Args - The schema of the tool's parameters or undefined if the tool has no parameters
 */
export class AppTool<Args extends ZodRawShape | undefined = undefined> extends Tool<Args> {
  /**
   * Indicates this is an OpenAI Apps SDK tool that needs special handling
   */
  readonly isAppTool = true;

  constructor(params: Required<Pick<ToolParams<Args>, 'title' | '_meta'>> & ToolParams<Args>) {
    super(params);

    // Validate that required Apps SDK metadata is present
    if (!this._meta?.['openai/outputTemplate']) {
      throw new Error('AppTool requires _meta with openai/outputTemplate');
    }
  }

  /**
   * Returns the tool descriptor in OpenAI Apps SDK format
   * with _meta and title at the top level
   */
  toOpenAIToolDescriptor() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.getInputSchema(),
      title: this.title,
      _meta: this._meta,
      annotations: this.annotations,
    };
  }

  /**
   * Converts Zod paramsSchema to JSON Schema for OpenAI
   */
  private getInputSchema() {
    if (!this.paramsSchema) {
      return {
        type: 'object',
        properties: {},
        additionalProperties: false,
      };
    }

    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, schema] of Object.entries(this.paramsSchema)) {
      // Extract Zod schema info
      const zodSchema = schema as any;
      const isOptional = zodSchema._def?.typeName === 'ZodOptional';

      // Basic type mapping (can be extended)
      properties[key] = { type: 'string' };

      if (!isOptional) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
      $schema: 'http://json-schema.org/draft-07/schema#',
    };
  }
}
