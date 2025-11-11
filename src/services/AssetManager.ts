import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { Config } from '../config.js';
import { log } from '../logging/log.js';
import { Server } from '../server.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export interface AssetMetadata {
  imageFilename?: string;
  [key: string]: unknown;
}

export interface StoreResult {
  url: string;
  assetId: string;
}

/**
 * AssetManager - Centralized service for storing and signing assets
 *
 * Responsibilities:
 * - Storage abstraction (local disk for MVP)
 * - HMAC-SHA256 signature generation
 * - URL construction with expiration and signature
 */
export class AssetManager {
  private config: Config;
  private server?: Server;

  constructor(config: Config, server?: Server) {
    this.config = config;
    this.server = server;
  }

  /**
   * Store an asset and return a signed URL or inline data
   *
   * @param data - The raw asset data as a Buffer
   * @param extension - File extension (e.g., 'svg', 'png', 'jpg')
   * @param metadata - Optional metadata including imageFilename
   * @returns Object containing the URL/data and assetId
   */
  async store(data: Buffer, extension: string, metadata?: AssetMetadata): Promise<StoreResult> {
    // Check if asset serving is disabled
    if (this.config.assetStrategy === 'disabled') {
      throw new Error('Asset serving is disabled. Set MCP_ASSET_STRATEGY to "inline", "local", or "s3" to enable asset generation.');
    }

    // Generate a unique asset ID (UUID)
    const uuid = crypto.randomUUID();

    // CRITICAL: Include extension in assetId to avoid ambiguity (per PRD Section 6 Phase 1)
    const assetId = `${uuid}.${extension}`;

    // Handle inline strategy - return data directly without storing
    if (this.config.assetStrategy === 'inline') {
      const dataStr = data.toString('utf-8');

      if (this.server) {
        log.info(this.server, `[AssetManager] Returning inline asset: ${assetId} (${data.length} bytes)`);
      }

      return { url: dataStr, assetId };
    }

    // For local/s3 strategies, store the file
    // Ensure storage directory exists
    await fs.mkdir(this.config.assetStoragePath, { recursive: true });

    // Save the file to local storage
    const filePath = path.join(this.config.assetStoragePath, assetId);
    await fs.writeFile(filePath, data);

    // If metadata with imageFilename is provided, save it as a sidecar JSON file
    if (metadata?.imageFilename) {
      const metadataPath = path.join(this.config.assetStoragePath, `${uuid}.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

    // Generate signed URL using MCP server URL
    const url = this.generateSignedUrl(assetId);

    if (this.server) {
      log.info(this.server, `[AssetManager] Stored asset: ${assetId}`);
    }

    return { url, assetId };
  }

  /**
   * Generate a signed URL for an asset
   *
   * @param assetId - The asset ID (including extension)
   * @returns Full signed URL
   */
  private generateSignedUrl(assetId: string): string {
    // Calculate expiration timestamp
    const expiresAt = Date.now() + (this.config.assetExpirationHours * 60 * 60 * 1000);
    const expires = Math.floor(expiresAt / 1000); // Convert to seconds

    // Generate HMAC-SHA256 signature
    const signature = this.generateSignature(assetId, expires);

    // Construct the base URL from the MCP server URL (NOT the Tableau server)
    const baseUrl = this.config.mcpServerUrl;

    // Build the full signed URL
    const url = `${baseUrl}/tableau-mcp/assets?assetId=${encodeURIComponent(assetId)}&expires=${expires}&sig=${signature}`;

    return url;
  }

  /**
   * Generate HMAC-SHA256 signature
   *
   * The signature covers: assetId + expires + secret
   * Format: HMAC-SHA256(assetId:expires:secret, key=secret)
   *
   * @param assetId - The asset ID
   * @param expires - Expiration timestamp in seconds
   * @returns URL-safe base64-encoded signature
   */
  generateSignature(assetId: string, expires: number): string {
    // Message includes: assetId + expires + secret
    const message = `${assetId}:${expires}:${this.config.assetSecretKey}`;
    const hmac = crypto.createHmac('sha256', this.config.assetSecretKey);
    hmac.update(message);

    // Return URL-safe base64 encoding
    return hmac.digest('base64url');
  }

  /**
   * Validate a signature for an asset request
   *
   * @param assetId - The asset ID from the request
   * @param expires - The expiration timestamp from the request
   * @param providedSig - The signature from the request
   * @returns Validation result: 'valid', 'expired', or 'invalid'
   */
  validateSignature(
    assetId: string,
    expires: number,
    providedSig: string,
  ): 'valid' | 'expired' | 'invalid' {
    // Check if expired first
    const now = Math.floor(Date.now() / 1000);
    if (now > expires) {
      if (this.server) {
        log.warn(this.server, `[AssetManager] Expired access attempt for asset: ${assetId}`);
      }
      return 'expired';
    }

    // Validate signature
    const calculatedSig = this.generateSignature(assetId, expires);

    // Use timing-safe comparison to prevent timing attacks
    // First check if lengths match (timing-safe comparison requires equal lengths)
    if (calculatedSig.length !== providedSig.length) {
      if (this.server) {
        log.warn(this.server, `[AssetManager] Invalid signature attempt for asset: ${assetId}`);
      }
      return 'invalid';
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(calculatedSig),
      Buffer.from(providedSig),
    );

    if (!isValid) {
      if (this.server) {
        log.warn(this.server, `[AssetManager] Invalid signature attempt for asset: ${assetId}`);
      }
      return 'invalid';
    }

    return 'valid';
  }

  /**
   * Sanitize a filename for cross-platform browser safety
   *
   * @param filename - The original filename
   * @returns Sanitized filename
   */
  static sanitizeFilename(filename: string): string {
    // Remove path separators and null bytes
    let sanitized = filename.replace(/[/\\<>:"|?*\x00-\x1F]/g, '_');

    // Limit length to 255 characters (filesystem limit)
    if (sanitized.length > 255) {
      const ext = path.extname(sanitized);
      const base = path.basename(sanitized, ext);
      sanitized = base.substring(0, 255 - ext.length) + ext;
    }

    // Ensure it doesn't start with a dot (hidden file)
    if (sanitized.startsWith('.')) {
      sanitized = '_' + sanitized.substring(1);
    }

    return sanitized;
  }

  /**
   * Validate assetId against strict regex to prevent path traversal
   *
   * @param assetId - The asset ID to validate
   * @returns true if valid, false otherwise
   */
  static validateAssetId(assetId: string): boolean {
    // Strict allowlist pattern: UUID followed by supported extension
    const pattern = /^[a-f0-9-]+\.(svg|png|jpg)$/i;
    return pattern.test(assetId);
  }

  /**
   * Get the file path for an asset
   *
   * @param assetId - The asset ID (must be validated first!)
   * @returns Absolute file path
   */
  getAssetPath(assetId: string): string {
    return path.join(this.config.assetStoragePath, assetId);
  }

  /**
   * Get the metadata file path for an asset
   *
   * @param assetId - The asset ID (with extension)
   * @returns Absolute path to metadata JSON file
   */
  getMetadataPath(assetId: string): string {
    const uuid = path.parse(assetId).name; // Remove extension
    return path.join(this.config.assetStoragePath, `${uuid}.json`);
  }

  /**
   * Check if an asset file exists
   *
   * @param assetId - The asset ID
   * @returns true if exists, false otherwise
   */
  async assetExists(assetId: string): Promise<boolean> {
    try {
      const filePath = this.getAssetPath(assetId);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read asset metadata if it exists
   *
   * @param assetId - The asset ID
   * @returns Metadata object or null if not found
   */
  async readMetadata(assetId: string): Promise<AssetMetadata | null> {
    try {
      const metadataPath = this.getMetadataPath(assetId);
      const data = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(data) as AssetMetadata;
    } catch {
      return null;
    }
  }
}
