import { readFileSync } from 'fs';
import { join } from 'path';

import type { Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';

import { createPulseWidgetMeta, PULSE_WIDGET_URI } from './widgetMeta.js';

// Path to the single-file widget built by vite-plugin-singlefile
const WIDGET_HTML_PATH = join(process.cwd(), 'assets/widget/index.html');

/**
 * Get the list of Pulse widget resources for MCP resource handlers
 */
export function getPulseWidgetResources(): Resource[] {
  return [
    {
      uri: PULSE_WIDGET_URI,
      name: 'Tableau Pulse Metric Widget',
      description: 'Interactive Tableau Pulse metric visualization widget for OpenAI Apps SDK',
      mimeType: 'text/html+skybridge',
      _meta: createPulseWidgetMeta(),
    },
  ];
}

/**
 * Get the list of Pulse widget resource templates
 */
export function getPulseWidgetResourceTemplates(): ResourceTemplate[] {
  return [
    {
      uriTemplate: PULSE_WIDGET_URI,
      name: 'Tableau Pulse Metric Widget',
      description: 'Interactive Tableau Pulse metric visualization widget for OpenAI Apps SDK',
      mimeType: 'text/html+skybridge',
      _meta: createPulseWidgetMeta(),
    },
  ];
}

/**
 * Read a Pulse widget resource by URI
 */
export function readPulseWidgetResource(uri: string): {
  uri: string;
  mimeType: string;
  text: string;
  _meta: ReturnType<typeof createPulseWidgetMeta>;
} {
  if (uri !== PULSE_WIDGET_URI) {
    throw new Error(`Unknown resource URI: ${uri}`);
  }

  // Read the single-file widget HTML (all assets inlined by vite-plugin-singlefile)
  const widgetHtml = readFileSync(WIDGET_HTML_PATH, 'utf-8');

  return {
    uri: PULSE_WIDGET_URI,
    mimeType: 'text/html+skybridge',
    text: widgetHtml,
    _meta: createPulseWidgetMeta(),
  };
}
