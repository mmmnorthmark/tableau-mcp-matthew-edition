import { useEffect, useRef, useState } from "react";

interface PulseCardProps {
  token: string;
  metricUrl: string;
  tableauHost: string;
  layout?: string;
  timeDimension?: string;
  onError?: (error: string) => void;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "tableau-pulse": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        id?: string;
        src?: string;
        width?: string;
        height?: string;
        token?: string;
        layout?: string;
        "disable-explore-filter"?: boolean;
      };
    }
  }
}

export default function PulseCard({
  token,
  metricUrl,
  tableauHost,
  layout = "kpi-and-insights",
  timeDimension = "last30days",
  onError,
}: PulseCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const pulseRef = useRef<HTMLElement>(null);
  const embeddingApiLoaded = useRef(false);

  useEffect(() => {
    // Load Tableau Embedding API v3
    const loadEmbeddingApi = async () => {
      if (embeddingApiLoaded.current) return;

      try {
        const scriptUrl = `${tableauHost}/javascripts/api/tableau.embedding.3.latest.min.js`;

        // Check if script already exists
        const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
        if (existingScript) {
          embeddingApiLoaded.current = true;
          setIsLoading(false);
          return;
        }

        // Load the script
        const script = document.createElement("script");
        script.src = scriptUrl;
        script.type = "module";
        script.onload = () => {
          embeddingApiLoaded.current = true;
          setIsLoading(false);
        };
        script.onerror = () => {
          const error = "Failed to load Tableau Embedding API";
          setEmbedError(error);
          onError?.(error);
          setIsLoading(false);
        };
        document.head.appendChild(script);
      } catch (error) {
        const errorMsg = `Error loading Embedding API: ${error}`;
        setEmbedError(errorMsg);
        onError?.(errorMsg);
        setIsLoading(false);
      }
    };

    loadEmbeddingApi();
  }, [tableauHost, onError]);

  useEffect(() => {
    // Apply time dimension when it changes
    if (pulseRef.current && embeddingApiLoaded.current && timeDimension) {
      try {
        // Access the pulse element's API
        const pulseElement = pulseRef.current as any;
        if (pulseElement.setTimeDimension) {
          pulseElement.setTimeDimension(timeDimension);
        }
      } catch (error) {
        console.error("Failed to set time dimension:", error);
      }
    }
  }, [timeDimension]);

  if (embedError) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        background: "#fff",
        margin: "16px",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}>
        <div style={{
          fontSize: "18px",
          fontWeight: 500,
          color: "#c33",
          marginBottom: "16px",
        }}>
          Unable to load Pulse metric
        </div>
        <div style={{
          fontSize: "14px",
          color: "#666",
          marginBottom: "24px",
        }}>
          {embedError}
        </div>
        <button
          onClick={() => {
            if (window.openai) {
              window.openai.openExternal({ href: metricUrl });
            } else {
              window.open(metricUrl, "_blank");
            }
          }}
          style={{
            background: "#0066cc",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Open in Tableau
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
      }}>
        <div style={{ color: "#666" }}>Loading Tableau Pulse...</div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      padding: "16px",
      overflow: "auto",
    }}>
      <tableau-pulse
        ref={pulseRef}
        id="pulse"
        src={metricUrl}
        width="100%"
        height="640"
        token={token}
        layout={layout}
        disable-explore-filter={layout === "kpi-only"}
      />
    </div>
  );
}
