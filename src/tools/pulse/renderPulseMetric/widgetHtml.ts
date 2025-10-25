/**
 * Generates the HTML for the Pulse metric widget
 * This widget receives all data from window.openai.structuredContent (no API calls needed)
 */
export function renderPulseMetricWidgetHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tableau Pulse Metric</title>
  <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      padding: 16px;
      background: transparent;
    }

    .metric-container {
      max-width: 800px;
      margin: 0 auto;
    }

    .metric-header {
      margin-bottom: 16px;
    }

    .metric-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #1a1a1a;
    }

    .metric-description {
      font-size: 14px;
      color: #666;
      margin-bottom: 16px;
    }

    .visualization {
      margin: 24px 0;
      border-radius: 8px;
      overflow: hidden;
    }

    .insights {
      margin-top: 24px;
    }

    .insight-item {
      padding: 12px;
      margin-bottom: 8px;
      background: #f3f4f6;
      border-radius: 6px;
      font-size: 14px;
      line-height: 1.5;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    .error {
      padding: 16px;
      background: #fee2e2;
      border: 1px solid #ef4444;
      border-radius: 6px;
      color: #991b1b;
      margin-bottom: 16px;
    }

    .dark-mode {
      background: #1a1a1a;
    }

    .dark-mode .metric-title {
      color: #ffffff;
    }

    .dark-mode .metric-description {
      color: #a3a3a3;
    }

    .dark-mode .insight-item {
      background: #2a2a2a;
      color: #e5e5e5;
    }

    .dark-mode .loading {
      color: #a3a3a3;
    }
  </style>
</head>
<body>
  <div class="metric-container">
    <div id="loading" class="loading">
      Loading metric data...
    </div>
    <div id="error" class="error" style="display: none;"></div>
    <div id="content" style="display: none;">
      <div class="metric-header">
        <h1 class="metric-title" id="metric-name"></h1>
        <p class="metric-description" id="metric-description"></p>
      </div>
      <div id="visualization" class="visualization"></div>
      <div id="insights" class="insights"></div>
    </div>
  </div>

  <script>
    // Apply theme from OpenAI globals
    function applyTheme() {
      if (window.openai?.theme === 'dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    }

    // Listen for theme changes
    window.addEventListener('openai:set_globals', (event) => {
      if (event.detail?.globals?.theme) {
        applyTheme();
      }
    });

    // Show error message
    function showError(message) {
      const errorEl = document.getElementById('error');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      document.getElementById('loading').style.display = 'none';
    }

    // Render the metric using data from structuredContent
    async function renderMetric() {
      try {
        applyTheme();

        // Get data from OpenAI's structuredContent (provided by the tool)
        const data = window.openai?.structuredContent;

        if (!data) {
          throw new Error('No metric data provided');
        }

        // Set basic info
        document.getElementById('metric-name').textContent = data.metric?.name || 'Pulse Metric';
        document.getElementById('metric-description').textContent = data.metric?.description || '';

        // Parse the insight bundle
        const insightBundle = data.insightBundle;
        if (insightBundle?.result?.insight_groups) {
          const allInsights = [];

          // Collect all insights from all groups
          insightBundle.result.insight_groups.forEach(group => {
            if (group.insights) {
              allInsights.push(...group.insights);
            }
          });

          // Render insights
          const insightsHtml = allInsights
            .filter(insight => insight.result?.markup)
            .map(insight => \`<div class="insight-item">\${insight.result.markup}</div>\`)
            .join('');

          if (insightsHtml) {
            document.getElementById('insights').innerHTML = insightsHtml;
          }

          // Find and render Vega-Lite visualization
          const vizInsight = allInsights.find(insight => insight.result?.viz);
          if (vizInsight?.result?.viz) {
            const vegaSpec = vizInsight.result.viz;

            // Render with vega-embed
            await vegaEmbed('#visualization', vegaSpec, {
              actions: false,
              theme: window.openai?.theme === 'dark' ? 'dark' : 'default',
            });
          }
        }

        // Show content
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';

      } catch (error) {
        console.error('Error rendering metric:', error);
        showError(\`Error: \${error.message}\`);
      }
    }

    // Check if window.openai is available
    if (typeof window.openai === 'undefined') {
      showError('This widget requires the OpenAI Apps SDK environment.');
    } else {
      // Start rendering
      renderMetric();
    }
  </script>
</body>
</html>`;
}
