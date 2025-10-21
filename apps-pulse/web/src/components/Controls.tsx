interface ControlsProps {
  onFullscreen: () => void;
  onSummarize: () => void;
  onMetricChange: (metricId: string, metricUrl: string) => void;
  onLayoutChange: (layout: string) => void;
  onTimeDimensionChange: (timeDimension: string) => void;
  isFullscreen: boolean;
  currentLayout: string;
  currentTimeDimension: string;
}

export default function Controls({
  onFullscreen,
  onSummarize,
  onLayoutChange,
  onTimeDimensionChange,
  isFullscreen,
  currentLayout,
  currentTimeDimension,
}: ControlsProps) {
  return (
    <div style={{
      display: "flex",
      gap: "12px",
      padding: "12px 16px",
      background: "#fff",
      borderBottom: "1px solid #e0e0e0",
      flexWrap: "wrap",
      alignItems: "center",
    }}>
      <div style={{ flex: 1, minWidth: "200px" }}>
        <label style={{
          display: "block",
          fontSize: "12px",
          fontWeight: 500,
          color: "#666",
          marginBottom: "4px",
        }}>
          Time Range
        </label>
        <select
          value={currentTimeDimension}
          onChange={(e) => onTimeDimensionChange(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: "4px",
            border: "1px solid #ddd",
            fontSize: "14px",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          <option value="last7days">Last 7 days</option>
          <option value="last30days">Last 30 days</option>
          <option value="last90days">Last 90 days</option>
          <option value="ytd">Year to date</option>
        </select>
      </div>

      <div style={{ flex: 1, minWidth: "200px" }}>
        <label style={{
          display: "block",
          fontSize: "12px",
          fontWeight: 500,
          color: "#666",
          marginBottom: "4px",
        }}>
          Layout
        </label>
        <select
          value={currentLayout}
          onChange={(e) => onLayoutChange(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: "4px",
            border: "1px solid #ddd",
            fontSize: "14px",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          <option value="kpi-and-insights">KPI and Insights</option>
          <option value="kpi-only">KPI Only</option>
        </select>
      </div>

      <div style={{
        display: "flex",
        gap: "8px",
        marginLeft: "auto",
      }}>
        <button
          onClick={onSummarize}
          style={{
            background: "#fff",
            color: "#0066cc",
            border: "1px solid #0066cc",
            padding: "6px 14px",
            borderRadius: "4px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          📊 Summarize
        </button>
        <button
          onClick={onFullscreen}
          style={{
            background: "#0066cc",
            color: "#fff",
            border: "none",
            padding: "6px 14px",
            borderRadius: "4px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {isFullscreen ? "Exit Fullscreen" : "⛶ Fullscreen"}
        </button>
      </div>
    </div>
  );
}
