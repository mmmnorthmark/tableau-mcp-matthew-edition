import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportedForTesting } from './config.js';

describe('Config', () => {
  const { Config } = exportedForTesting;

  const originalEnv = process.env;

  const minimalPatInstance = {
    name: 'test',
    server: 'https://test-server.com',
    auth: 'pat',
    patName: 'test-pat-name',
    patValue: 'test-pat-value',
  } as const;

  const setDefaultInstances = () => {
    process.env.TABLEAU_INSTANCES = JSON.stringify([minimalPatInstance]);
    process.env.CONFIG_FILE_PATH = undefined;
  };

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      TRANSPORT: undefined,
      HTTP_PORT_ENV_VAR_NAME: undefined,
      PORT: undefined,
      CUSTOM_PORT: undefined,
      CORS_ORIGIN_CONFIG: undefined,
      TABLEAU_INSTANCES: undefined,
      CONFIG_FILE_PATH: undefined,
      DATASOURCE_CREDENTIALS: undefined,
      DEFAULT_LOG_LEVEL: undefined,
      DISABLE_LOG_MASKING: undefined,
      INCLUDE_TOOLS: undefined,
      EXCLUDE_TOOLS: undefined,
      MAX_RESULT_LIMIT: undefined,
      DISABLE_QUERY_DATASOURCE_FILTER_VALIDATION: undefined,
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should throw error when TABLEAU_INSTANCES and CONFIG_FILE_PATH are missing', () => {
    expect(() => new Config()).toThrow(
      'Tableau instance configuration required. Set either TABLEAU_INSTANCES or CONFIG_FILE_PATH environment variable.',
    );
  });

  it('should throw error when TABLEAU_INSTANCES contains invalid JSON', () => {
    process.env.TABLEAU_INSTANCES = 'invalid json';

    expect(() => new Config()).toThrow('Failed to parse TABLEAU_INSTANCES');
  });

  it('should parse a valid TABLEAU_INSTANCES configuration', () => {
    setDefaultInstances();

    const config = new Config();
    expect(config.instances).toHaveLength(1);
    expect(config.instances[0].name).toBe('test');
    expect(config.instances[0].patName).toBe('test-pat-name');
  });

  it('should set default log level to debug when not specified', () => {
    setDefaultInstances();

    const config = new Config();
    expect(config.defaultLogLevel).toBe('debug');
  });

  it('should set custom log level when specified', () => {
    setDefaultInstances();
    process.env.DEFAULT_LOG_LEVEL = 'info';

    const config = new Config();
    expect(config.defaultLogLevel).toBe('info');
  });

  it('should set disableLogMasking to false by default', () => {
    setDefaultInstances();

    const config = new Config();
    expect(config.disableLogMasking).toBe(false);
  });

  it('should set disableLogMasking to true when specified', () => {
    setDefaultInstances();
    process.env.DISABLE_LOG_MASKING = 'true';

    const config = new Config();
    expect(config.disableLogMasking).toBe(true);
  });

  it('should set maxResultLimit to null when not specified', () => {
    setDefaultInstances();

    const config = new Config();
    expect(config.maxResultLimit).toBe(null);
  });

  it('should set maxResultLimit to null when specified as a non-number', () => {
    setDefaultInstances();
    process.env.MAX_RESULT_LIMIT = 'abc';

    const config = new Config();
    expect(config.maxResultLimit).toBe(null);
  });

  it('should set maxResultLimit to null when specified as a negative number', () => {
    setDefaultInstances();
    process.env.MAX_RESULT_LIMIT = '-100';

    const config = new Config();
    expect(config.maxResultLimit).toBe(null);
  });

  it('should set maxResultLimit to the specified value when specified', () => {
    setDefaultInstances();
    process.env.MAX_RESULT_LIMIT = '100';

    const config = new Config();
    expect(config.maxResultLimit).toBe(100);
  });

  it('should set disableQueryDatasourceFilterValidation to false by default', () => {
    setDefaultInstances();

    const config = new Config();
    expect(config.disableQueryDatasourceFilterValidation).toBe(false);
  });

  it('should set disableQueryDatasourceFilterValidation to true when specified', () => {
    setDefaultInstances();
    process.env.DISABLE_QUERY_DATASOURCE_FILTER_VALIDATION = 'true';

    const config = new Config();
    expect(config.disableQueryDatasourceFilterValidation).toBe(true);
  });

  it('should set datasourceCredentials to empty string by default', () => {
    setDefaultInstances();

    const config = new Config();
    expect(config.datasourceCredentials).toBe('');
  });

  it('should set datasourceCredentials when specified', () => {
    setDefaultInstances();
    process.env.DATASOURCE_CREDENTIALS = '{"ds-luid":[{"luid":"conn","u":"user","p":"pass"}]}';

    const config = new Config();
    expect(config.datasourceCredentials).toBe(
      '{"ds-luid":[{"luid":"conn","u":"user","p":"pass"}]}',
    );
  });

  it('should default transport to stdio when not specified', () => {
    setDefaultInstances();

    const config = new Config();
    expect(config.transport).toBe('stdio');
  });

  it('should set transport to http when specified', () => {
    setDefaultInstances();
    process.env.TRANSPORT = 'http';

    const config = new Config();
    expect(config.transport).toBe('http');
  });

  describe('Tool filtering', () => {
    it('should set empty arrays for includeTools and excludeTools when not specified', () => {
      setDefaultInstances();

      const config = new Config();
      expect(config.includeTools).toEqual([]);
      expect(config.excludeTools).toEqual([]);
    });

    it('should parse INCLUDE_TOOLS into an array of valid tool names', () => {
      setDefaultInstances();
      process.env.INCLUDE_TOOLS = 'query-datasource,list-fields';

      const config = new Config();
      expect(config.includeTools).toEqual(['query-datasource', 'list-fields']);
    });

    it('should parse EXCLUDE_TOOLS into an array of valid tool names', () => {
      setDefaultInstances();
      process.env.EXCLUDE_TOOLS = 'query-datasource';

      const config = new Config();
      expect(config.excludeTools).toEqual(['query-datasource']);
    });

    it('should filter out invalid tool names from INCLUDE_TOOLS', () => {
      setDefaultInstances();
      process.env.INCLUDE_TOOLS = 'query-datasource,order-hamburgers';

      const config = new Config();
      expect(config.includeTools).toEqual(['query-datasource']);
    });

    it('should filter out invalid tool names from EXCLUDE_TOOLS', () => {
      setDefaultInstances();
      process.env.EXCLUDE_TOOLS = 'query-datasource,order-hamburgers';

      const config = new Config();
      expect(config.excludeTools).toEqual(['query-datasource']);
    });

    it('should throw error when both INCLUDE_TOOLS and EXCLUDE_TOOLS are specified', () => {
      setDefaultInstances();
      process.env.INCLUDE_TOOLS = 'query-datasource';
      process.env.EXCLUDE_TOOLS = 'list-fields';

      expect(() => new Config()).toThrow('Cannot specify both INCLUDE_TOOLS and EXCLUDE_TOOLS');
    });
  });

  describe('HTTP port parsing', () => {
    it('should set httpPort to default when HTTP_PORT_ENV_VAR_NAME and PORT are not set', () => {
      setDefaultInstances();

      const config = new Config();
      expect(config.httpPort).toBe(3927);
    });

    it('should set httpPort to the value of PORT when set', () => {
      setDefaultInstances();
      process.env.PORT = '8080';

      const config = new Config();
      expect(config.httpPort).toBe(8080);
    });

    it('should set httpPort to the value of the environment variable specified by HTTP_PORT_ENV_VAR_NAME when set', () => {
      setDefaultInstances();
      process.env.HTTP_PORT_ENV_VAR_NAME = 'CUSTOM_PORT';
      process.env.CUSTOM_PORT = '41664';

      const config = new Config();
      expect(config.httpPort).toBe(41664);
    });

    it('should set httpPort to default when HTTP_PORT_ENV_VAR_NAME is set and custom port is not set', () => {
      setDefaultInstances();
      process.env.HTTP_PORT_ENV_VAR_NAME = 'CUSTOM_PORT';

      const config = new Config();
      expect(config.httpPort).toBe(3927);
    });

    it('should set httpPort to default when PORT is set to an invalid value', () => {
      setDefaultInstances();
      process.env.PORT = 'invalid';

      const config = new Config();
      expect(config.httpPort).toBe(3927);
    });

    it('should set httpPort to default when HTTP_PORT_ENV_VAR_NAME is set and custom port is invalid', () => {
      setDefaultInstances();
      process.env.HTTP_PORT_ENV_VAR_NAME = 'CUSTOM_PORT';
      process.env.CUSTOM_PORT = 'invalid';

      const config = new Config();
      expect(config.httpPort).toBe(3927);
    });
  });

  describe('CORS origin config parsing', () => {
    it('should set corsOriginConfig to true when CORS_ORIGIN_CONFIG is not set', () => {
      setDefaultInstances();

      const config = new Config();
      expect(config.corsOriginConfig).toBe(true);
    });

    it('should set corsOriginConfig to true when CORS_ORIGIN_CONFIG is "true"', () => {
      setDefaultInstances();
      process.env.CORS_ORIGIN_CONFIG = 'true';

      const config = new Config();
      expect(config.corsOriginConfig).toBe(true);
    });

    it('should set corsOriginConfig to "*" when CORS_ORIGIN_CONFIG is "*"', () => {
      setDefaultInstances();
      process.env.CORS_ORIGIN_CONFIG = '*';

      const config = new Config();
      expect(config.corsOriginConfig).toBe('*');
    });

    it('should set corsOriginConfig to false when CORS_ORIGIN_CONFIG is "false"', () => {
      setDefaultInstances();
      process.env.CORS_ORIGIN_CONFIG = 'false';

      const config = new Config();
      expect(config.corsOriginConfig).toBe(false);
    });

    it('should set corsOriginConfig to the specified origin when CORS_ORIGIN_CONFIG is a valid URL', () => {
      setDefaultInstances();
      process.env.CORS_ORIGIN_CONFIG = 'https://example.com:8080';

      const config = new Config();
      expect(config.corsOriginConfig).toBe('https://example.com:8080');
    });

    it('should set corsOriginConfig to the specified origins when CORS_ORIGIN_CONFIG is an array of URLs', () => {
      setDefaultInstances();
      process.env.CORS_ORIGIN_CONFIG = '["https://example.com", "https://example.org"]';

      const config = new Config();
      expect(config.corsOriginConfig).toEqual(['https://example.com', 'https://example.org']);
    });

    it('should throw error when CORS_ORIGIN_CONFIG is not a valid URL', () => {
      setDefaultInstances();
      process.env.CORS_ORIGIN_CONFIG = 'invalid';

      expect(() => new Config()).toThrow(
        'The environment variable CORS_ORIGIN_CONFIG is not a valid URL: invalid',
      );
    });

    it('should throw error when CORS_ORIGIN_CONFIG is not a valid array of URLs', () => {
      setDefaultInstances();
      process.env.CORS_ORIGIN_CONFIG = '["https://example.com", "invalid"]';

      expect(() => new Config()).toThrow(
        'The environment variable CORS_ORIGIN_CONFIG is not a valid array of URLs: ["https://example.com", "invalid"]',
      );
    });
  });
});
