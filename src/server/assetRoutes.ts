import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

import { Config } from '../config.js';
import { log } from '../logging/log.js';
import { Server } from '../server.js';
import { AssetManager } from '../services/AssetManager.js';
import { getDirname } from '../utils/getDirname.js';

/**
 * Handle GET /mcp/assets requests
 *
 * This endpoint validates signed URLs and serves assets with appropriate
 * CORS headers and security checks.
 */
export async function handleAssetRequest(
  req: Request,
  res: Response,
  config: Config,
  server?: Server,
): Promise<void> {
  const { assetId, expires, sig } = req.query;

  // Validate query parameters are present
  if (!assetId || !expires || !sig) {
    if (server) {
      log.warn(server, '[AssetEndpoint] Missing required query parameters');
    }
    return respondWithError(res, 403, 'Forbidden');
  }

  // Ensure parameters are strings
  const assetIdStr = String(assetId);
  const expiresStr = String(expires);
  const sigStr = String(sig);

  // Path traversal prevention: Strict validation of assetId
  if (!AssetManager.validateAssetId(assetIdStr)) {
    if (server) {
      log.warn(server, `[AssetEndpoint] Invalid assetId format: ${assetIdStr}`);
    }
    return respondWithError(res, 403, 'Forbidden');
  }

  // Parse expires timestamp
  const expiresNum = parseInt(expiresStr, 10);
  if (isNaN(expiresNum)) {
    if (server) {
      log.warn(server, '[AssetEndpoint] Invalid expires timestamp');
    }
    return respondWithError(res, 403, 'Forbidden');
  }

  // Validate signature
  const assetManager = new AssetManager(config, server);
  const validationResult = assetManager.validateSignature(assetIdStr, expiresNum, sigStr);

  if (validationResult === 'expired') {
    // Asset URL has expired (410 Gone)
    return respondWithError(res, 410, 'Gone');
  }

  if (validationResult === 'invalid') {
    // Invalid signature (403 Forbidden)
    return respondWithError(res, 403, 'Forbidden');
  }

  // Check if asset exists
  const exists = await assetManager.assetExists(assetIdStr);
  if (!exists) {
    if (server) {
      log.error(server, `[AssetEndpoint] Asset not found: ${assetIdStr}`);
    }
    return redirectToNotFound(res);
  }

  // Serve the asset
  try {
    const assetPath = assetManager.getAssetPath(assetIdStr);
    const assetData = await fs.readFile(assetPath);

    // Determine MIME type from extension
    const ext = path.extname(assetIdStr).toLowerCase();
    const mimeType = getMimeType(ext);

    // Check for metadata to set Content-Disposition
    const metadata = await assetManager.readMetadata(assetIdStr);
    if (metadata?.imageFilename) {
      const sanitizedFilename = AssetManager.sanitizeFilename(String(metadata.imageFilename));
      res.setHeader('Content-Disposition', `inline; filename="${sanitizedFilename}"`);
    }

    // Set Cache-Control based on remaining TTL
    const now = Math.floor(Date.now() / 1000);
    const remainingTTL = expiresNum - now;
    res.setHeader('Cache-Control', `public, max-age=${Math.max(0, remainingTTL)}`);

    // Set Content-Type
    res.setHeader('Content-Type', mimeType);

    // Log successful serve
    if (server) {
      log.info(server, `[AssetEndpoint] Successfully served asset: ${assetIdStr}`);
    }

    // Send the asset
    res.status(200).send(assetData);
  } catch (error) {
    if (server) {
      log.error(server, `[AssetEndpoint] Error serving asset ${assetIdStr}: ${error}`);
    }
    return redirectToNotFound(res);
  }
}

/**
 * Handle GET /defaults/:filename requests
 *
 * Serves the default error SVG files
 */
export async function handleDefaultsRequest(req: Request, res: Response): Promise<void> {
  const { filename } = req.params;

  // Validate filename
  if (!filename || !['vizImageExpired.svg', 'vizImageNotFound.svg'].includes(filename)) {
    res.status(404).send('Not found');
    return;
  }

  try {
    // Read the default SVG file
    const defaultsPath = path.join(getDirname(), '..', 'defaults', filename);
    const svgData = await fs.readFile(defaultsPath, 'utf-8');

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.status(200).send(svgData);
  } catch (error) {
    res.status(404).send('Not found');
  }
}

/**
 * Respond with error status code and redirect to appropriate error image
 *
 * @param res - Express response object
 * @param statusCode - HTTP status code (403 Forbidden, 410 Gone, etc.)
 * @param statusText - Status text for logging
 */
function respondWithError(res: Response, statusCode: number, statusText: string): void {
  const errorImage =
    statusCode === 410 ? '/defaults/vizImageExpired.svg' : '/defaults/vizImageNotFound.svg';

  // Set status code and redirect to error image
  res.status(statusCode).redirect(errorImage);
}

/**
 * Redirect to the not found image with 404 status
 */
function redirectToNotFound(res: Response): void {
  res.status(404).redirect('/defaults/vizImageNotFound.svg');
}

/**
 * Get MIME type from file extension
 */
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}
