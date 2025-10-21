import { useState, useEffect } from "react";
import { useOpenAI } from "./hooks/useOpenAi";
import PulseCard from "./components/PulseCard";
import Controls from "./components/Controls";

// Pulse data can come from either OpenAI tool output or directly from window (MCP embedded mode)
interface PulseData {
  token: string;
  expiresAt: string;
  metricUrl: string;
  metricName: string;
  tableauHost: string;
}

declare global {
  interface Window {
    __PULSE_DATA__?: PulseData;
  }
}

export default function App() {
  const { toolOutput, widgetState, setWidgetState, requestDisplayMode, sendFollowUpMessage } = useOpenAI();
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pulseData, setPulseData] = useState<PulseData | null>(null);

  // Load pulse data from either window.__PULSE_DATA__ or toolOutput
  useEffect(() => {
    // Priority 1: Direct injection (MCP embedded mode)
    if (window.__PULSE_DATA__) {
      setPulseData(window.__PULSE_DATA__);
      return;
    }

    // Priority 2: OpenAI tool output
    if (toolOutput) {
      try {
        const data = JSON.parse(toolOutput);
        setPulseData(data);
      } catch {
        setPulseData(null);
      }
    }
  }, [toolOutput]);

  const handleFullscreen = () => {
    requestDisplayMode(isFullscreen ? "default" : "fullscreen");
    setIsFullscreen(!isFullscreen);
  };

  const handleSummarize = async () => {
    if (!pulseData?.metricUrl) return;

    // Request insight from the MCP tool
    sendFollowUpMessage({
      role: "user",
      content: `Get insights for the current metric using get_metric_insight`,
    });
  };

  const handleMetricChange = (metricId: string, metricUrl: string) => {
    // Save selected metric to widget state
    setWidgetState({
      ...widgetState,
      selectedMetric: metricId,
      selectedMetricUrl: metricUrl,
    });
  };

  const handleLayoutChange = (layout: string) => {
    setWidgetState({
      ...widgetState,
      layout,
    });
  };

  const handleTimeDimensionChange = (timeDimension: string) => {
    setWidgetState({
      ...widgetState,
      timeDimension,
    });
  };

  return (
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "#f5f5f5",
      overflow: "hidden",
    }}>
      {error && (
        <div style={{
          background: "#fee",
          color: "#c33",
          padding: "12px 16px",
          borderRadius: "4px",
          margin: "16px",
        }}>
          {error}
        </div>
      )}

      <Controls
        onFullscreen={handleFullscreen}
        onSummarize={handleSummarize}
        onMetricChange={handleMetricChange}
        onLayoutChange={handleLayoutChange}
        onTimeDimensionChange={handleTimeDimensionChange}
        isFullscreen={isFullscreen}
        currentLayout={(widgetState?.layout as string) || "kpi-and-insights"}
        currentTimeDimension={(widgetState?.timeDimension as string) || "last30days"}
      />

      {pulseData ? (
        <PulseCard
          token={pulseData.token}
          metricUrl={pulseData.metricUrl}
          tableauHost={pulseData.tableauHost}
          layout={(widgetState?.layout as string) || "kpi-and-insights"}
          timeDimension={(widgetState?.timeDimension as string) || "last30days"}
          onError={setError}
        />
      ) : (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          color: "#666",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "18px", fontWeight: 500, marginBottom: "8px" }}>
              No metric loaded
            </div>
            <div style={{ fontSize: "14px" }}>
              Use the Pulse connector tools to load a metric
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
