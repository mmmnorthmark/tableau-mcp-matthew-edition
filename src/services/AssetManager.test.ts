import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Config } from '../config.js';
import { AssetManager, AssetMetadata } from './AssetManager.js';

describe('AssetManager', () => {
  let tempDir: string;
  let config: Config;
  let assetManager: AssetManager;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = path.join(process.cwd(), 'test-assets-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    // Create a test config
    config = {
      assetStoragePath: tempDir,
      assetSecretKey: 'test-secret-key-with-high-entropy-12345678',
      assetExpirationHours: 24,
      assetCorsOrigins: ['https://claude.ai'],
      server: 'https://test-server.com',
    } as Config;

    assetManager = new AssetManager(config);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  describe('store', () => {
    it('should store an asset and return a signed URL', async () => {
      const data = Buffer.from('<svg>test</svg>', 'utf-8');
      const result = await assetManager.store(data, 'svg');

      expect(result.url).toContain('https://test-server.com/mcp/assets');
      expect(result.url).toContain('assetId=');
      expect(result.url).toContain('expires=');
      expect(result.url).toContain('sig=');
      expect(result.assetId).toMatch(/^[a-f0-9-]+\.svg$/);

      // Verify file was created
      const filePath = path.join(tempDir, result.assetId);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(fileContent).toBe('<svg>test</svg>');
    });

    it('should include file extension in assetId', async () => {
      const data = Buffer.from('test image data');

      const svgResult = await assetManager.store(data, 'svg');
      expect(svgResult.assetId).toMatch(/\.svg$/);

      const pngResult = await assetManager.store(data, 'png');
      expect(pngResult.assetId).toMatch(/\.png$/);

      const jpgResult = await assetManager.store(data, 'jpg');
      expect(jpgResult.assetId).toMatch(/\.jpg$/);
    });

    it('should save metadata as sidecar JSON when imageFilename is provided', async () => {
      const data = Buffer.from('<svg>test</svg>');
      const metadata: AssetMetadata = {
        imageFilename: 'my-chart.svg',
      };

      const result = await assetManager.store(data, 'svg', metadata);

      // Extract UUID from assetId
      const uuid = path.parse(result.assetId).name;
      const metadataPath = path.join(tempDir, `${uuid}.json`);

      // Verify metadata file exists
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const savedMetadata = JSON.parse(metadataContent);
      expect(savedMetadata.imageFilename).toBe('my-chart.svg');
    });

    it('should not save metadata file when imageFilename is not provided', async () => {
      const data = Buffer.from('<svg>test</svg>');
      const result = await assetManager.store(data, 'svg');

      const uuid = path.parse(result.assetId).name;
      const metadataPath = path.join(tempDir, `${uuid}.json`);

      // Metadata file should not exist
      await expect(fs.access(metadataPath)).rejects.toThrow();
    });
  });

  describe('generateSignature', () => {
    it('should generate consistent signatures for the same input', () => {
      const assetId = 'test-asset.svg';
      const expires = 1234567890;

      const sig1 = assetManager.generateSignature(assetId, expires);
      const sig2 = assetManager.generateSignature(assetId, expires);

      expect(sig1).toBe(sig2);
      expect(sig1).toBeTruthy();
    });

    it('should generate different signatures for different inputs', () => {
      const assetId1 = 'test-asset-1.svg';
      const assetId2 = 'test-asset-2.svg';
      const expires = 1234567890;

      const sig1 = assetManager.generateSignature(assetId1, expires);
      const sig2 = assetManager.generateSignature(assetId2, expires);

      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different expiration times', () => {
      const assetId = 'test-asset.svg';
      const expires1 = 1234567890;
      const expires2 = 1234567891;

      const sig1 = assetManager.generateSignature(assetId, expires1);
      const sig2 = assetManager.generateSignature(assetId, expires2);

      expect(sig1).not.toBe(sig2);
    });

    it('should generate URL-safe base64 signatures', () => {
      const assetId = 'test-asset.svg';
      const expires = 1234567890;

      const sig = assetManager.generateSignature(assetId, expires);

      // URL-safe base64 should not contain +, /, or =
      expect(sig).not.toContain('+');
      expect(sig).not.toContain('/');
      expect(sig).not.toContain('=');
    });
  });

  describe('validateSignature', () => {
    it('should validate correct signatures', () => {
      const assetId = 'test-asset.svg';
      const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const signature = assetManager.generateSignature(assetId, expires);
      const result = assetManager.validateSignature(assetId, expires, signature);

      expect(result).toBe('valid');
    });

    it('should reject expired signatures', () => {
      const assetId = 'test-asset.svg';
      const expires = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      const signature = assetManager.generateSignature(assetId, expires);
      const result = assetManager.validateSignature(assetId, expires, signature);

      expect(result).toBe('expired');
    });

    it('should reject invalid signatures', () => {
      const assetId = 'test-asset.svg';
      const expires = Math.floor(Date.now() / 1000) + 3600;

      const validSignature = assetManager.generateSignature(assetId, expires);
      const invalidSignature = validSignature + 'tampered';

      const result = assetManager.validateSignature(assetId, expires, invalidSignature);

      expect(result).toBe('invalid');
    });

    it('should reject signatures with wrong assetId', () => {
      const assetId1 = 'test-asset-1.svg';
      const assetId2 = 'test-asset-2.svg';
      const expires = Math.floor(Date.now() / 1000) + 3600;

      const signature = assetManager.generateSignature(assetId1, expires);
      const result = assetManager.validateSignature(assetId2, expires, signature);

      expect(result).toBe('invalid');
    });

    it('should reject signatures with wrong expires', () => {
      const assetId = 'test-asset.svg';
      const expires1 = Math.floor(Date.now() / 1000) + 3600;
      const expires2 = Math.floor(Date.now() / 1000) + 7200;

      const signature = assetManager.generateSignature(assetId, expires1);
      const result = assetManager.validateSignature(assetId, expires2, signature);

      expect(result).toBe('invalid');
    });
  });

  describe('validateAssetId', () => {
    it('should accept valid UUID-based assetIds with supported extensions', () => {
      expect(AssetManager.validateAssetId('550e8400-e29b-41d4-a716-446655440000.svg')).toBe(true);
      expect(AssetManager.validateAssetId('550e8400-e29b-41d4-a716-446655440000.png')).toBe(true);
      expect(AssetManager.validateAssetId('550e8400-e29b-41d4-a716-446655440000.jpg')).toBe(true);
      expect(AssetManager.validateAssetId('550e8400-e29b-41d4-a716-446655440000.SVG')).toBe(true);
    });

    it('should reject assetIds without extensions', () => {
      expect(AssetManager.validateAssetId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    });

    it('should reject assetIds with unsupported extensions', () => {
      expect(AssetManager.validateAssetId('550e8400-e29b-41d4-a716-446655440000.exe')).toBe(false);
      expect(AssetManager.validateAssetId('550e8400-e29b-41d4-a716-446655440000.js')).toBe(false);
      expect(AssetManager.validateAssetId('550e8400-e29b-41d4-a716-446655440000.pdf')).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      expect(AssetManager.validateAssetId('../550e8400-e29b-41d4-a716-446655440000.svg')).toBe(
        false,
      );
      expect(AssetManager.validateAssetId('../../etc/passwd')).toBe(false);
      expect(AssetManager.validateAssetId('./550e8400-e29b-41d4-a716-446655440000.svg')).toBe(
        false,
      );
    });

    it('should reject assetIds with invalid characters', () => {
      expect(AssetManager.validateAssetId('test asset.svg')).toBe(false);
      expect(AssetManager.validateAssetId('test/asset.svg')).toBe(false);
      expect(AssetManager.validateAssetId('test\\asset.svg')).toBe(false);
      expect(AssetManager.validateAssetId('test;asset.svg')).toBe(false);
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove path separators', () => {
      expect(AssetManager.sanitizeFilename('path/to/file.svg')).toBe('path_to_file.svg');
      expect(AssetManager.sanitizeFilename('path\\to\\file.svg')).toBe('path_to_file.svg');
    });

    it('should remove dangerous characters', () => {
      expect(AssetManager.sanitizeFilename('file<>:"|?*.svg')).toBe('file_______.svg');
    });

    it('should handle leading dots', () => {
      expect(AssetManager.sanitizeFilename('.hidden.svg')).toBe('_hidden.svg');
    });

    it('should limit filename length to 255 characters', () => {
      const longName = 'a'.repeat(300) + '.svg';
      const sanitized = AssetManager.sanitizeFilename(longName);
      expect(sanitized.length).toBeLessThanOrEqual(255);
      expect(sanitized.endsWith('.svg')).toBe(true);
    });

    it('should preserve safe filenames', () => {
      expect(AssetManager.sanitizeFilename('my-chart-2024.svg')).toBe('my-chart-2024.svg');
      expect(AssetManager.sanitizeFilename('Sales_Dashboard_Q4.png')).toBe(
        'Sales_Dashboard_Q4.png',
      );
    });
  });

  describe('assetExists', () => {
    it('should return true for existing assets', async () => {
      const data = Buffer.from('<svg>test</svg>');
      const { assetId } = await assetManager.store(data, 'svg');

      const exists = await assetManager.assetExists(assetId);
      expect(exists).toBe(true);
    });

    it('should return false for non-existing assets', async () => {
      const exists = await assetManager.assetExists('non-existent-asset.svg');
      expect(exists).toBe(false);
    });
  });

  describe('readMetadata', () => {
    it('should read metadata when it exists', async () => {
      const data = Buffer.from('<svg>test</svg>');
      const metadata: AssetMetadata = {
        imageFilename: 'test-chart.svg',
        customField: 'custom-value',
      };

      const { assetId } = await assetManager.store(data, 'svg', metadata);
      const readMetadata = await assetManager.readMetadata(assetId);

      expect(readMetadata).not.toBeNull();
      expect(readMetadata?.imageFilename).toBe('test-chart.svg');
      expect(readMetadata?.customField).toBe('custom-value');
    });

    it('should return null when metadata does not exist', async () => {
      const data = Buffer.from('<svg>test</svg>');
      const { assetId } = await assetManager.store(data, 'svg');

      const metadata = await assetManager.readMetadata(assetId);
      expect(metadata).toBeNull();
    });

    it('should return null for non-existent assets', async () => {
      const metadata = await assetManager.readMetadata('non-existent-asset.svg');
      expect(metadata).toBeNull();
    });
  });
});
