import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Canvas } from 'canvas';
import { Ok } from 'ts-results-es';
import * as vega from 'vega';
import * as vegaLite from 'vega-lite';
import z from 'zod';

import { Server } from '../../../server.js';
import { Tool } from '../../tool.js';

const paramsSchema = {
  vegaLiteSpec: z
    .string()
    .describe('The Vega-Lite specification as a JSON string'),
  width: z
    .number()
    .optional()
    .default(800)
    .describe('Width of the SVG output in pixels (default: 800)'),
  height: z
    .number()
    .optional()
    .default(400)
    .describe('Height of the SVG output in pixels (default: 400)'),
};

/**
 * Transform Vega-Lite spec to fix custom formatter issues for headless rendering.
 * Converts customFormatterMaps to Vega-native labelExpr.
 */
function transformVegaLiteSpec(spec: any): any {
  const transformed = JSON.parse(JSON.stringify(spec)); // Deep clone
  const formatterMaps = transformed.customFormatterMaps || {};

  // Helper to create a labelExpr from a formatter map
  function createLabelExpr(mapName: string): string {
    const map = formatterMaps[mapName];
    if (!map) return 'datum.value';

    // Build a JavaScript expression that does the lookup
    const entries = Object.entries(map);
    let expr = 'datum.value';

    // Build the conditional chain in reverse
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, value] = entries[i];
      // Escape single quotes in the value
      const escapedValue = (value as string).replace(/'/g, "\\'");
      expr = `datum.value === '${key}' ? '${escapedValue}' : ${expr}`;
    }

    return expr;
  }

  // Helper function to recursively transform layers
  function transformLayer(layer: any) {
    if (!layer) return;

    // Fix x-axis formatting - replace custom format with labelExpr
    if (layer.encoding?.x?.axis?.format?.custom) {
      const xAxis = layer.encoding.x.axis;
      const mapName = xAxis.format.mapName;

      // Replace custom format with labelExpr
      delete xAxis.format;
      xAxis.labelExpr = createLabelExpr(mapName);
    }

    // Fix y-axis formatting - replace custom format with labelExpr
    if (layer.encoding?.y?.axis?.format?.custom) {
      const yAxis = layer.encoding.y.axis;
      const mapName = yAxis.format.mapName;

      // Replace custom format with labelExpr
      delete yAxis.format;
      yAxis.labelExpr = createLabelExpr(mapName);
    }

    // Recursively transform child layers
    if (layer.layer && Array.isArray(layer.layer)) {
      layer.layer.forEach(transformLayer);
    }
  }

  // Transform top-level encoding first (this is where x/y axes are defined)
  transformLayer(transformed);

  // Then transform all child layers
  if (transformed.layer && Array.isArray(transformed.layer)) {
    transformed.layer.forEach(transformLayer);
  }

  // Remove customFormatterMaps from the final spec (no longer needed)
  delete transformed.customFormatterMaps;

  return transformed;
}

/**
 * Render a Vega-Lite spec to SVG using headless canvas rendering.
 */
async function renderVegaLiteToSvg(
  vegaLiteSpec: any,
  width: number,
  height: number,
): Promise<string> {
  // Transform the spec to replace custom formatters
  const transformedSpec = transformVegaLiteSpec(vegaLiteSpec);

  // Override width/height (replace "container" with actual pixel values)
  transformedSpec.width = width;
  transformedSpec.height = height;

  // Compile Vega-Lite to Vega
  const vegaSpec = vegaLite.compile(transformedSpec).spec;

  // Create a new Vega view with canvas renderer
  const view = new vega.View(vega.parse(vegaSpec), {
    renderer: 'none', // We'll use toSVG() instead of canvas
    logLevel: vega.Warn,
  });

  // Run the view to generate the visualization
  await view.runAsync();

  // Generate SVG string
  const svg = await view.toSVG();

  return svg;
}

export const getRenderPulseSvgTool = (server: Server): Tool<typeof paramsSchema> => {
  const renderPulseSvgTool = new Tool({
    server,
    name: 'render-pulse-svg',
    description: `
Render a Tableau Pulse Vega-Lite specification to SVG format.

This tool takes a Vega-Lite specification (including those with Tableau Pulse custom formatters)
and renders it to an SVG string. It handles custom formatter maps by converting them to
Vega-native labelExpr expressions.

**Parameters:**
- \`vegaLiteSpec\` (required): The Vega-Lite specification as a JSON string
- \`width\` (optional): Width of the SVG output in pixels (default: 800)
- \`height\` (optional): Height of the SVG output in pixels (default: 400)

**Example Usage:**
\`\`\`json
{
  "vegaLiteSpec": "{\\"$schema\\": \\"https://vega.github.io/schema/vega-lite/v5.json\\", ...}",
  "width": 1200,
  "height": 600
}
\`\`\`

**Returns:**
An SVG string that can be saved to a file or embedded in HTML.

**Note:**
- This tool automatically handles Tableau Pulse's customFormatterMaps
- Supports all standard Vega-Lite visualizations
- Renders headlessly (no browser required)
`,
    paramsSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    callback: async ({ vegaLiteSpec, width, height }, { requestId }): Promise<CallToolResult> => {
      return await renderPulseSvgTool.logAndExecute({
        requestId,
        args: { vegaLiteSpec, width, height },
        getSuccessResult: (svg) => ({
          isError: false,
          content: [
            {
              type: 'text',
              text: svg,
            },
          ],
        }),
        callback: async () => {
          // Parse the Vega-Lite spec
          let spec = JSON.parse(vegaLiteSpec);

          // Handle wrapped specs (e.g., {"ban_chart": {...}})
          // If the parsed object has exactly one key and it's not a Vega-Lite root property,
          // unwrap it
          const vegaLiteRootProps = ['$schema', 'mark', 'layer', 'facet', 'hconcat', 'vconcat', 'concat', 'repeat', 'data', 'encoding'];
          const keys = Object.keys(spec);

          if (keys.length === 1 && !vegaLiteRootProps.includes(keys[0])) {
            // Unwrap the spec
            spec = spec[keys[0]];
          }

          // Render to SVG
          const svg = await renderVegaLiteToSvg(spec, width || 800, height || 400);

          return new Ok(svg);
        },
      });
    },
  });

  return renderPulseSvgTool;
};
