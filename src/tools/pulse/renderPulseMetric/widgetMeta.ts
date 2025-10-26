/**
 * Widget metadata for OpenAI Apps SDK integration
 */

// Add version to bust cache when widget changes
export const PULSE_WIDGET_URI = 'ui://widget/pulse-metric.html?v=4';

export function createPulseWidgetMeta() {
  return {
    'openai/outputTemplate': PULSE_WIDGET_URI,
    'openai/toolInvocation/invoking': 'Rendering Tableau Pulse metric...',
    'openai/toolInvocation/invoked': 'Rendered Tableau Pulse metric',
    'openai/widgetAccessible': true,
    'openai/resultCanProduceWidget': true,
  } as const;
}
