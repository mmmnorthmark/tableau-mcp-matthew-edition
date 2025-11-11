import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import * as vega from 'vega';
import * as vegaLite from 'vega-lite';
import z from 'zod';

import { getConfig } from '../../../config.js';
import { log } from '../../../logging/log.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Server } from '../../../server.js';
import { AssetManager } from '../../../services/AssetManager.js';
import { Tool } from '../../tool.js';
import { getPulseDisabledError } from '../getPulseDisabledError.js';

const paramsSchema = {
  metricId: z.string().describe('The ID of the Pulse metric to render'),
  definitionId: z
    .string()
    .optional()
    .describe('The ID of the Pulse metric definition (optional, will be fetched if not provided)'),
  insightType: z
    .enum(['popc', 'currenttrend', 'unusualchange', 'topcontributor', 'all'])
    .optional()
    .default('all')
    .describe(
      'The type of insight visualization to render: popc (period-over-period comparison/BAN), currenttrend (time series), unusualchange (anomaly detection), topcontributor (breakdown), or all (default: all)',
    ),
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
 * Type guard to check if a value is a valid visualization object with content.
 */
function isValidVizObject(viz: unknown): viz is Record<string, unknown> {
  return typeof viz === 'object' && viz !== null && Object.keys(viz).length > 0;
}

/**
 * Transform Vega-Lite spec to fix custom formatter issues for headless rendering.
 * Converts customFormatterMaps to Vega-native labelExpr.
 */
function transformVegaLiteSpec(spec: any): any {
  const transformed = JSON.parse(JSON.stringify(spec)); // Deep clone
  const formatterMaps = transformed.customFormatterMaps || {};

  // Helper to escape strings for use in Vega expressions
  function escapeForVegaExpr(str: string): string {
    return str
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/'/g, "\\'") // Escape single quotes
      .replace(/\n/g, '\\n') // Escape newlines
      .replace(/\r/g, '\\r') // Escape carriage returns
      .replace(/\t/g, '\\t'); // Escape tabs
  }

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
      // Escape both key and value for use in Vega expression
      const escapedKey = escapeForVegaExpr(key);
      const escapedValue = escapeForVegaExpr(value as string);
      expr = `datum.value === '${escapedKey}' ? '${escapedValue}' : ${expr}`;
    }

    return expr;
  }

  // Helper function to recursively transform layers
  function transformLayer(layer: any): void {
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

type ScenegraphBounds = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type BoxPadding = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

const DEFAULT_PADDING: BoxPadding = { top: 8, left: 12, bottom: 12, right: 28 };
const OVERFLOW_EPSILON = 1;

function normalizePadding(
  padding?: number | Partial<BoxPadding>,
  fallback: BoxPadding = DEFAULT_PADDING,
): BoxPadding {
  if (typeof padding === 'number') {
    const normalized = Math.max(0, padding);
    return {
      top: normalized,
      bottom: normalized,
      left: normalized,
      right: normalized,
    };
  }

  return {
    top: Math.max(0, padding?.top ?? fallback.top),
    bottom: Math.max(0, padding?.bottom ?? fallback.bottom),
    left: Math.max(0, padding?.left ?? fallback.left),
    right: Math.max(0, padding?.right ?? fallback.right),
  };
}

function addPadding(base: BoxPadding, extra: BoxPadding): BoxPadding {
  return {
    top: base.top + extra.top,
    bottom: base.bottom + extra.bottom,
    left: base.left + extra.left,
    right: base.right + extra.right,
  };
}

function computePaddingAdjustment(
  bounds: ScenegraphBounds | undefined,
  viewWidth: number,
  viewHeight: number,
): BoxPadding | null {
  if (!bounds) {
    return null;
  }

  const leftOverflow = bounds.x1 < 0 ? Math.ceil(Math.abs(bounds.x1) + OVERFLOW_EPSILON) : 0;
  const topOverflow = bounds.y1 < 0 ? Math.ceil(Math.abs(bounds.y1) + OVERFLOW_EPSILON) : 0;
  const rightOverflow =
    bounds.x2 > viewWidth ? Math.ceil(bounds.x2 - viewWidth + OVERFLOW_EPSILON) : 0;
  const bottomOverflow =
    bounds.y2 > viewHeight ? Math.ceil(bounds.y2 - viewHeight + OVERFLOW_EPSILON) : 0;

  if (!leftOverflow && !topOverflow && !rightOverflow && !bottomOverflow) {
    return null;
  }

  return {
    top: topOverflow,
    bottom: bottomOverflow,
    left: leftOverflow,
    right: rightOverflow,
  };
}

/**
 * Parse SVG attributes from the root SVG element.
 */
function parseSvgAttributes(svgString: string): {
  width: number | null;
  height: number | null;
  viewBox: string | null;
} {
  const svgMatch = svgString.match(/<svg[^>]*>/);
  if (!svgMatch) {
    return { width: null, height: null, viewBox: null };
  }

  const svgTag = svgMatch[0];
  const widthMatch = svgTag.match(/width=["']([^"']+)["']/);
  const heightMatch = svgTag.match(/height=["']([^"']+)["']/);
  const viewBoxMatch = svgTag.match(/viewBox=["']([^"']+)["']/);

  const width = widthMatch ? parseFloat(widthMatch[1]) : null;
  const height = heightMatch ? parseFloat(heightMatch[1]) : null;
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : null;

  return { width, height, viewBox };
}

/**
 * Parse transform attribute to extract translation values.
 */
function parseTransform(transform: string | null): { tx: number; ty: number } {
  if (!transform) return { tx: 0, ty: 0 };

  // Match translate(x, y) or translate(x y)
  const translateMatch = transform.match(/translate\(([^,)]+)[,\s]+([^)]+)\)/);
  if (translateMatch) {
    return {
      tx: parseFloat(translateMatch[1]) || 0,
      ty: parseFloat(translateMatch[2]) || 0,
    };
  }

  return { tx: 0, ty: 0 };
}

/**
 * Calculate bounding box for a path element.
 * Handles common SVG path commands: M, L, H, V, C, Q, Z
 */
function getPathBounds(d: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const coords: Array<{ x: number; y: number }> = [];
  
  // Parse path commands and extract coordinates
  // Match command letters followed by numbers
  const commandRegex = /([MmLlHhVvCcQqZz])\s*([-\d\s.,eE]+)?/g;
  let currentX = 0;
  let currentY = 0;
  let match;

  while ((match = commandRegex.exec(d)) !== null) {
    const commandChar = match[1];
    const isRelative = commandChar === commandChar.toLowerCase();
    const command = commandChar.toUpperCase();
    const params = match[2] ? match[2].trim().split(/[\s,]+/).map(parseFloat).filter((n) => !isNaN(n)) : [];

    if (command === 'M' || command === 'L') {
      // MoveTo or LineTo: takes pairs of x,y coordinates
      for (let i = 0; i < params.length; i += 2) {
        if (i + 1 < params.length) {
          if (isRelative) {
            currentX += params[i];
            currentY += params[i + 1];
          } else {
            currentX = params[i];
            currentY = params[i + 1];
          }
          coords.push({ x: currentX, y: currentY });
        }
      }
    } else if (command === 'H') {
      // Horizontal line: takes x coordinates
      for (const x of params) {
        currentX = isRelative ? currentX + x : x;
        coords.push({ x: currentX, y: currentY });
      }
    } else if (command === 'V') {
      // Vertical line: takes y coordinates
      for (const y of params) {
        currentY = isRelative ? currentY + y : y;
        coords.push({ x: currentX, y: currentY });
      }
    } else if (command === 'C') {
      // Cubic Bezier: takes 6 parameters (x1,y1 x2,y2 x,y)
      // Include control points and end point
      for (let i = 0; i < params.length; i += 6) {
        if (i + 5 < params.length) {
          const cp1x = isRelative ? currentX + params[i] : params[i];
          const cp1y = isRelative ? currentY + params[i + 1] : params[i + 1];
          const cp2x = isRelative ? currentX + params[i + 2] : params[i + 2];
          const cp2y = isRelative ? currentY + params[i + 3] : params[i + 3];
          currentX = isRelative ? currentX + params[i + 4] : params[i + 4];
          currentY = isRelative ? currentY + params[i + 5] : params[i + 5];
          coords.push({ x: cp1x, y: cp1y }); // control point 1
          coords.push({ x: cp2x, y: cp2y }); // control point 2
          coords.push({ x: currentX, y: currentY }); // end point
        }
      }
    } else if (command === 'Q') {
      // Quadratic Bezier: takes 4 parameters (x1,y1 x,y)
      for (let i = 0; i < params.length; i += 4) {
        if (i + 3 < params.length) {
          const cpx = isRelative ? currentX + params[i] : params[i];
          const cpy = isRelative ? currentY + params[i + 1] : params[i + 1];
          currentX = isRelative ? currentX + params[i + 2] : params[i + 2];
          currentY = isRelative ? currentY + params[i + 3] : params[i + 3];
          coords.push({ x: cpx, y: cpy }); // control point
          coords.push({ x: currentX, y: currentY }); // end point
        }
      }
    } else if (command === 'Z') {
      // Close path - no coordinates, just closes back to start
      // We'll use the first point if available
      if (coords.length > 0) {
        coords.push({ x: coords[0].x, y: coords[0].y });
        currentX = coords[0].x;
        currentY = coords[0].y;
      }
    }
  }

  if (coords.length === 0) return null;

  const xs = coords.map((c) => c.x);
  const ys = coords.map((c) => c.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/**
 * Calculate bounding box for a circle element.
 */
function getCircleBounds(cx: number, cy: number, r: number): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return {
    minX: cx - r,
    minY: cy - r,
    maxX: cx + r,
    maxY: cy + r,
  };
}

/**
 * Calculate bounding box for a line element.
 */
function getLineBounds(x1: number, y1: number, x2: number, y2: number): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  };
}

/**
 * Calculate bounding box for a rect element.
 */
function getRectBounds(x: number, y: number, width: number, height: number): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return {
    minX: x,
    minY: y,
    maxX: x + width,
    maxY: y + height,
  };
}

/**
 * Calculate bounding box for a text element (approximate).
 */
function getTextBounds(x: number, y: number, fontSize: number = 14, textLength: number = 0): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  // Approximate text bounds - text-anchor affects this but we'll use a conservative estimate
  const estimatedWidth = textLength > 0 ? textLength * 0.6 : fontSize * 5; // Rough estimate
  const estimatedHeight = fontSize * 1.2;

  return {
    minX: x - estimatedWidth / 2, // Assume middle anchor for safety
    minY: y - estimatedHeight,
    maxX: x + estimatedWidth / 2,
    maxY: y + estimatedHeight / 2,
  };
}

/**
 * Calculate the actual bounding box of all visible content in the SVG.
 * This function accounts for transforms applied to groups and elements.
 */
function calculateSvgContentBounds(svgString: string): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  const bounds: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];

  // Track open groups and their transforms to build a transform stack
  // We'll process the SVG sequentially and track which groups are open
  const transformStack: Array<{ tx: number; ty: number }> = [{ tx: 0, ty: 0 }];

  // Find all group open/close tags and content elements
  // Use a more comprehensive regex that captures both opening and closing tags
  const allTagsRegex = /<(g|path|circle|line|rect|text)([^>]*?)(\/)?>|<\/(g)>/g;
  let match;

  while ((match = allTagsRegex.exec(svgString)) !== null) {
    const tagName = match[1] || match[4]; // match[4] is for closing tags
    const attributes = match[2] || '';
    const isSelfClosing = match[3] === '/';
    const isClosing = !!match[4];

    if (isClosing && tagName === 'g') {
      // Closing group tag - pop transform stack
      if (transformStack.length > 1) {
        transformStack.pop();
      }
      continue;
    }

    if (tagName === 'g' && !isSelfClosing) {
      // Opening group tag - push transform onto stack
      const transformMatch = attributes.match(/transform=["']([^"']+)["']/);
      const parsedTransform = transformMatch ? parseTransform(transformMatch[1]) : { tx: 0, ty: 0 };
      const currentTransform = transformStack[transformStack.length - 1];
      transformStack.push({
        tx: currentTransform.tx + parsedTransform.tx,
        ty: currentTransform.ty + parsedTransform.ty,
      });
      continue;
    }

    // Process content elements (path, circle, line, rect, text)
    if (tagName && ['path', 'circle', 'line', 'rect', 'text'].includes(tagName)) {
      const currentTransform = transformStack[transformStack.length - 1];

      // Check for element-level transform
      const elementTransformMatch = attributes.match(/transform=["']([^"']+)["']/);
      let elementTransform = { tx: 0, ty: 0 };
      if (elementTransformMatch) {
        elementTransform = parseTransform(elementTransformMatch[1]);
      }

      // Combine group and element transforms
      const totalTransform = {
        tx: currentTransform.tx + elementTransform.tx,
        ty: currentTransform.ty + elementTransform.ty,
      };

      // Extract element-specific attributes and calculate bounds
      let elementBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

      if (tagName === 'path') {
        const dMatch = attributes.match(/d=["']([^"']+)["']/);
        if (dMatch) {
          elementBounds = getPathBounds(dMatch[1]);
        }
      } else if (tagName === 'circle') {
        const cxMatch = attributes.match(/cx=["']([^"']+)["']/);
        const cyMatch = attributes.match(/cy=["']([^"']+)["']/);
        const rMatch = attributes.match(/r=["']([^"']+)["']/);
        if (cxMatch && cyMatch && rMatch) {
          const cx = parseFloat(cxMatch[1]);
          const cy = parseFloat(cyMatch[1]);
          const r = parseFloat(rMatch[1]);
          elementBounds = getCircleBounds(cx, cy, r);
        }
      } else if (tagName === 'line') {
        const x1Match = attributes.match(/x1=["']([^"']+)["']/);
        const y1Match = attributes.match(/y1=["']([^"']+)["']/);
        const x2Match = attributes.match(/x2=["']([^"']+)["']/);
        const y2Match = attributes.match(/y2=["']([^"']+)["']/);
        if (x1Match && y1Match && x2Match && y2Match) {
          elementBounds = getLineBounds(
            parseFloat(x1Match[1]),
            parseFloat(y1Match[1]),
            parseFloat(x2Match[1]),
            parseFloat(y2Match[1]),
          );
        }
      } else if (tagName === 'rect') {
        const xMatch = attributes.match(/x=["']([^"']+)["']/);
        const yMatch = attributes.match(/y=["']([^"']+)["']/);
        const widthMatch = attributes.match(/width=["']([^"']+)["']/);
        const heightMatch = attributes.match(/height=["']([^"']+)["']/);
        if (xMatch && yMatch && widthMatch && heightMatch) {
          elementBounds = getRectBounds(
            parseFloat(xMatch[1]),
            parseFloat(yMatch[1]),
            parseFloat(widthMatch[1]),
            parseFloat(heightMatch[1]),
          );
        }
      } else if (tagName === 'text') {
        const xMatch = attributes.match(/x=["']([^"']+)["']/);
        const yMatch = attributes.match(/y=["']([^"']+)["']/);
        const fontSizeMatch = attributes.match(/font-size=["']([^"']+)["']/);
        // Find text content after this element
        const afterElement = svgString.substring(match.index + match[0].length);
        const textMatch = afterElement.match(/^([^<]+)</);
        if (xMatch && yMatch) {
          const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 14;
          const textLength = textMatch ? textMatch[1].trim().length : 0;
          elementBounds = getTextBounds(parseFloat(xMatch[1]), parseFloat(yMatch[1]), fontSize, textLength);
        }
      }

      // Apply total transform and add to bounds
      if (elementBounds) {
        bounds.push({
          minX: elementBounds.minX + totalTransform.tx,
          minY: elementBounds.minY + totalTransform.ty,
          maxX: elementBounds.maxX + totalTransform.tx,
          maxY: elementBounds.maxY + totalTransform.ty,
        });
      }
    }
  }

  if (bounds.length === 0) {
    return null;
  }

  // Find overall bounds
  const minX = Math.min(...bounds.map((b) => b.minX));
  const minY = Math.min(...bounds.map((b) => b.minY));
  const maxX = Math.max(...bounds.map((b) => b.maxX));
  const maxY = Math.max(...bounds.map((b) => b.maxY));

  return { minX, minY, maxX, maxY };
}

/**
 * Adjust SVG viewBox to encompass all visible content.
 */
function adjustSvgViewBox(svgString: string): string {
  const contentBounds = calculateSvgContentBounds(svgString);
  if (!contentBounds) {
    return svgString; // No content found, return as-is
  }

  const svgAttrs = parseSvgAttributes(svgString);
  const currentViewBox = svgAttrs.viewBox;

  // Calculate content dimensions
  const contentWidth = contentBounds.maxX - contentBounds.minX;
  const contentHeight = contentBounds.maxY - contentBounds.minY;

  // Add small padding margin (2% of content size, minimum 5px)
  const paddingX = Math.max(5, contentWidth * 0.02);
  const paddingY = Math.max(5, contentHeight * 0.02);

  // Get SVG dimensions to ensure background rect is included
  const svgWidth = svgAttrs.width ?? contentBounds.maxX;
  const svgHeight = svgAttrs.height ?? contentBounds.maxY;

  // Calculate bounds that include both content and background rect (0,0 to width,height)
  const overallMinX = Math.min(0, contentBounds.minX - paddingX);
  const overallMinY = Math.min(0, contentBounds.minY - paddingY);
  const overallMaxX = Math.max(svgWidth, contentBounds.maxX + paddingX);
  const overallMaxY = Math.max(svgHeight, contentBounds.maxY + paddingY);

  // Calculate new viewBox bounds
  let newMinX = overallMinX;
  let newMinY = overallMinY;
  let newWidth = overallMaxX - overallMinX;
  let newHeight = overallMaxY - overallMinY;

  // Ensure non-negative values (clamp to 0)
  if (newMinX < 0) {
    newWidth += Math.abs(newMinX);
    newMinX = 0;
  }
  if (newMinY < 0) {
    newHeight += Math.abs(newMinY);
    newMinY = 0;
  }

  // Ensure minimum dimensions
  if (newWidth < 1) newWidth = 1;
  if (newHeight < 1) newHeight = 1;

  const newViewBox = `${newMinX} ${newMinY} ${newWidth} ${newHeight}`;

  // Replace or add viewBox attribute
  if (currentViewBox) {
    return svgString.replace(/viewBox=["'][^"']+["']/, `viewBox="${newViewBox}"`);
  } else {
    // Insert viewBox after the opening <svg tag
    return svgString.replace(/<svg([^>]*)>/, `<svg$1 viewBox="${newViewBox}">`);
  }
}

async function renderVegaSpec(vegaSpec: any): Promise<{
  svg: string;
  bounds: ScenegraphBounds | undefined;
  viewWidth: number;
  viewHeight: number;
}> {
  const view = new vega.View(vega.parse(vegaSpec), {
    renderer: 'none',
    logLevel: vega.Warn,
  });

  await view.runAsync();

  const svg = await view.toSVG();
  const bounds = view.scenegraph()?.root?.bounds as ScenegraphBounds | undefined;
  const viewWidth = view.width();
  const viewHeight = view.height();

  view.finalize();

  return { svg, bounds, viewWidth, viewHeight };
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

  // Preserve step-based height (e.g., {step: 30} for categorical charts)
  const isStepHeight =
    typeof transformedSpec.height === 'object' && transformedSpec.height?.step != null;

  // 1) Use the true container size (no manual margin math)
  transformedSpec.width = Math.max(1, width);
  if (!isStepHeight) {
    transformedSpec.height = Math.max(1, height);
  }

  // 2) Safer autosize for headless export (use 'pad' instead of 'fit')
  transformedSpec.autosize = {
    ...(transformedSpec.autosize ?? {}),
    type: 'pad',
    contains: 'padding',
  };

  // 3) Compile Vega-Lite to Vega
  const vegaSpec: any = vegaLite.compile(transformedSpec).spec;

  // 4) Full bounds so strokes/labels at edges are included in layout
  vegaSpec.bounds = 'full';
  vegaSpec.autosize = {
    ...(vegaSpec.autosize ?? {}),
    type: 'pad',
    contains: 'padding',
  };

  // 5) Normalize padding so we can safely expand it if marks overflow
  const initialPadding = normalizePadding(vegaSpec.padding);
  let currentPadding = initialPadding;
  let svg = '';

  // Render with padding expansion loop (max 3 passes to avoid infinite adjustments)
  for (let attempt = 0; attempt < 3; attempt++) {
    vegaSpec.padding = currentPadding;
    const { svg: currentSvg, bounds, viewWidth, viewHeight } = await renderVegaSpec(vegaSpec);
    svg = currentSvg;

    const adjustment = computePaddingAdjustment(bounds, viewWidth, viewHeight);
    if (!adjustment) {
      break;
    }

    currentPadding = addPadding(currentPadding, adjustment);
  }

  // Adjust viewBox to encompass all visible content (fixes cropping issue)
  svg = adjustSvgViewBox(svg);

  return svg;
}

export const getRenderPulseSvgTool = (server: Server): Tool<typeof paramsSchema> => {
  const renderPulseSvgTool = new Tool({
    server,
    name: 'render-pulse-svg',
    description: `
Render Tableau Pulse metric visualizations to SVG format.

This tool fetches a Pulse metric's insight bundle and renders the specified visualization type(s)
to SVG. It automatically handles Tableau Pulse's custom formatters and returns one or more SVG strings.

**Parameters:**
- \`metricId\` (required): The ID of the Pulse metric to render
- \`definitionId\` (optional): The ID of the Pulse metric definition
- \`insightType\` (optional): Type of visualization to render (default: 'all')
  - \`popc\`: Period-over-period comparison (BAN chart)
  - \`currenttrend\`: Time series chart
  - \`unusualchange\`: Anomaly detection chart
  - \`topcontributor\`: Breakdown/contributor chart
  - \`all\`: All available visualizations
- \`width\` (optional): Width of the SVG output in pixels (default: 800)
- \`height\` (optional): Height of the SVG output in pixels (default: 400)

**Example Usage:**
\`\`\`json
{
  "metricId": "CF32DDCC-362B-4869-9487-37DA4D152552",
  "insightType": "currenttrend",
  "width": 1200,
  "height": 600
}
\`\`\`

**Returns:**
A JSON object with an array of visualizations, each containing:
- \`insightType\`: The type of insight visualization
- \`svg\`: The SVG content as a string (when MCP_ASSET_STRATEGY='inline')
- \`url\`: A secure, signed URL to access the SVG (when MCP_ASSET_STRATEGY='local' or 's3')
- \`assetId\`: The unique identifier for the stored asset

**Asset Strategies:**
- \`disabled\`: Asset generation is disabled (tool will fail with error)
- \`inline\`: SVG content is returned directly in the response (no URLs)
- \`local\`: SVG is stored locally and a signed URL is returned
- \`s3\`: SVG is stored in S3 and a signed URL is returned (requires S3 configuration)

**Note:**
- Automatically transforms customFormatterMaps to Vega-native labelExpr
- Renders headlessly (no browser required)
- Returns multiple visualizations if insightType is 'all' or if multiple insights of the same type exist
- URLs (when using 'local' or 's3') are signed and will expire based on MCP_ASSET_EXPIRATION_HOURS configuration
`,
    paramsSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    callback: async (
      { metricId, definitionId, insightType, width, height },
      { requestId },
    ): Promise<CallToolResult> => {
      const config = getConfig();
      return await renderPulseSvgTool.logAndExecute({
        requestId,
        args: { metricId, definitionId, insightType, width, height },
        getSuccessResult: (result) => ({
          isError: false,
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }),
        callback: async () => {
          return await useRestApi({
            config,
            requestId,
            server,
            jwtScopes: [
              'tableau:insight_metrics:read',
              'tableau:insight_definitions_metrics:read',
              'tableau:insights:read',
            ],
            callback: async (restApi) => {
              // Fetch metric data
              const metricsResult = await restApi.pulseMethods.listPulseMetricsFromMetricIds([
                metricId,
              ]);

              if (metricsResult.isErr() || metricsResult.value.length === 0) {
                throw new Error(`Metric not found: ${metricId}`);
              }

              const metric = metricsResult.value[0];
              const defId = definitionId || metric.definition_id;

              // Fetch metric definition
              const definitionsResult =
                await restApi.pulseMethods.listPulseMetricDefinitionsFromMetricDefinitionIds([
                  defId,
                ]);

              if (definitionsResult.isErr() || definitionsResult.value.length === 0) {
                throw new Error(`Metric definition not found: ${defId}`);
              }

              const definition = definitionsResult.value[0];

              // Build insight bundle request (same as renderPulseMetric)
              const representation_options = {
                ...definition.representation_options,
                sentiment_type:
                  definition.representation_options.sentiment_type || 'SENTIMENT_TYPE_UNSPECIFIED',
              };

              const bundleRequest = {
                bundle_request: {
                  version: 1,
                  options: {
                    output_format: 'OUTPUT_FORMAT_HTML' as const,
                    time_zone: 'UTC',
                    language: 'LANGUAGE_EN_US' as const,
                    locale: 'LOCALE_EN_US' as const,
                  },
                  input: {
                    metadata: {
                      name: definition.metadata?.name || 'Pulse Metric',
                      metric_id: metric.id,
                      definition_id: defId,
                    },
                    metric: {
                      definition: {
                        datasource: definition.specification.datasource,
                        basic_specification: definition.specification.basic_specification,
                        is_running_total: definition.specification.is_running_total,
                      },
                      metric_specification: metric.specification,
                      extension_options: definition.extension_options,
                      representation_options,
                      insights_options: definition.insights_options || {
                        show_insights: true,
                        settings: [],
                      },
                      goals: metric.goals || {},
                    },
                  },
                },
              };

              // Generate insight bundle with Vega-Lite specs
              const bundleResult = await restApi.pulseMethods.generatePulseMetricValueInsightBundle(
                bundleRequest,
                'detail',
              );

              if (bundleResult.isErr()) {
                throw new Error(`Failed to generate insight bundle: ${bundleResult.error}`);
              }

              const insightBundle = bundleResult.value;

              if (!insightBundle.bundle_response) {
                throw new Error('Invalid response from Pulse API: missing bundle_response');
              }

              // Log insight groups for debugging
              log.info(
                server,
                `[renderPulseSvg] Processing ${insightBundle.bundle_response.result.insight_groups.length} insight groups`,
                { requestId },
              );

              // Extract insights with visualizations
              const allInsights: Array<{ type: string; groupType: string; viz: any }> = [];
              insightBundle.bundle_response.result.insight_groups.forEach((group, groupIdx) => {
                log.info(
                  server,
                  `[renderPulseSvg] Group ${groupIdx}: type="${group.type}", insights=${group.insights?.length || 0}`,
                  { requestId },
                );

                if (group.insights) {
                  group.insights.forEach((insight, insightIdx) => {
                    const hasViz = !!insight.result?.viz;
                    const vizIsValid = hasViz && isValidVizObject(insight.result.viz);
                    const vizKeys = vizIsValid ? Object.keys(insight.result.viz).length : 0;

                    log.info(
                      server,
                      `[renderPulseSvg] Group ${groupIdx} Insight ${insightIdx}: type="${insight.insight_type}", result.type="${insight.result?.type}", hasViz=${hasViz}, vizIsValid=${vizIsValid}, vizKeys=${vizKeys}`,
                      { requestId },
                    );

                    // Only include insights with non-empty viz objects
                    if (
                      insight.result?.viz &&
                      insight.insight_type &&
                      isValidVizObject(insight.result.viz)
                    ) {
                      allInsights.push({
                        type: insight.insight_type,
                        groupType: group.type,
                        viz: insight.result.viz,
                      });
                    }
                  });
                }
              });

              log.info(
                server,
                `[renderPulseSvg] Found ${allInsights.length} insights with visualizations: ${allInsights.map((i) => `${i.type}(${i.groupType})`).join(', ')}`,
                { requestId },
              );

              // Filter by insight type
              const insightsToRender =
                insightType === 'all'
                  ? allInsights
                  : allInsights.filter((insight) => insight.type === insightType);

              if (insightsToRender.length === 0) {
                throw new Error(
                  `No visualizations found for insight type: ${insightType}. Available types: ${[...new Set(allInsights.map((i) => i.type))].join(', ')}`,
                );
              }

              // Render each visualization to SVG and store with AssetManager
              const assetManager = new AssetManager(config, server);
              const isInlineStrategy = config.assetStrategy === 'inline';

              const visualizations = await Promise.all(
                insightsToRender.map(async (insight, index) => {
                  const svg = await renderVegaLiteToSvg(insight.viz, width || 800, height || 400);

                  // Store the SVG using AssetManager
                  const svgBuffer = Buffer.from(svg, 'utf-8');
                  const filename = `${definition.metadata?.name || 'pulse-metric'}-${insight.type}-${index + 1}.svg`;

                  const { url, assetId } = await assetManager.store(svgBuffer, 'svg', {
                    imageFilename: filename,
                  });

                  // For inline strategy, the 'url' field contains the SVG data directly
                  return {
                    insightType: insight.type,
                    ...(isInlineStrategy ? { svg: url } : { url }),
                    assetId,
                  };
                }),
              );

              return new Ok({
                metricId: metric.id,
                metricName: definition.metadata?.name,
                visualizations,
              });
            },
          });
        },
        getErrorText: getPulseDisabledError,
      });
    },
  });

  return renderPulseSvgTool;
};
