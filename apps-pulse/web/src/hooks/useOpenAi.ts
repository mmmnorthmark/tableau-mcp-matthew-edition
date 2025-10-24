import { useState, useEffect } from "react";

interface ToolInput {
  [key: string]: unknown;
}

interface WidgetState {
  [key: string]: unknown;
}

interface FollowUpMessage {
  role: "user" | "assistant";
  content: string;
}

interface OpenAIHelpers {
  toolInput: ToolInput | null;
  toolOutput: string | null;
  widgetState: WidgetState;
  setWidgetState: (state: WidgetState) => void;
  requestDisplayMode: (mode: "default" | "fullscreen") => void;
  sendFollowUpMessage: (message: FollowUpMessage) => void;
  openExternal: (options: { href: string }) => void;
}

declare global {
  interface Window {
    openai?: {
      getToolInput: () => Promise<ToolInput>;
      getToolOutput: () => Promise<string>;
      getStructuredContent: () => Promise<any>;
      getWidgetState: () => Promise<WidgetState>;
      setWidgetState: (state: WidgetState) => Promise<void>;
      requestDisplayMode: (mode: "default" | "fullscreen") => Promise<void>;
      sendFollowUpMessage: (message: FollowUpMessage) => Promise<void>;
      openExternal: (options: { href: string }) => Promise<void>;
    };
  }
}

export function useOpenAI(): OpenAIHelpers {
  const [toolInput, setToolInput] = useState<ToolInput | null>(null);
  const [toolOutput, setToolOutput] = useState<string | null>(null);
  const [widgetState, setWidgetStateInternal] = useState<WidgetState>({});

  useEffect(() => {
    // Initialize OpenAI context
    const init = async () => {
      if (window.openai) {
        try {
          const [input, state] = await Promise.all([
            window.openai.getToolInput(),
            window.openai.getWidgetState(),
          ]);

          // Try getStructuredContent() first (new API), fallback to getToolOutput()
          let output = null;
          if (window.openai.getStructuredContent) {
            output = await window.openai.getStructuredContent();
          } else {
            output = await window.openai.getToolOutput();
          }

          setToolInput(input);
          setToolOutput(output);
          setWidgetStateInternal(state || {});
        } catch (error) {
          console.error("Failed to initialize OpenAI context:", error);
        }
      }
    };
    init();
  }, []);

  const setWidgetState = async (state: WidgetState) => {
    setWidgetStateInternal(state);
    if (window.openai) {
      try {
        await window.openai.setWidgetState(state);
      } catch (error) {
        console.error("Failed to set widget state:", error);
      }
    }
  };

  const requestDisplayMode = async (mode: "default" | "fullscreen") => {
    if (window.openai) {
      try {
        await window.openai.requestDisplayMode(mode);
      } catch (error) {
        console.error("Failed to request display mode:", error);
      }
    }
  };

  const sendFollowUpMessage = async (message: FollowUpMessage) => {
    if (window.openai) {
      try {
        await window.openai.sendFollowUpMessage(message);
      } catch (error) {
        console.error("Failed to send follow-up message:", error);
      }
    }
  };

  const openExternal = async (options: { href: string }) => {
    if (window.openai) {
      try {
        await window.openai.openExternal(options);
      } catch (error) {
        console.error("Failed to open external link:", error);
      }
    }
  };

  return {
    toolInput,
    toolOutput,
    widgetState,
    setWidgetState,
    requestDisplayMode,
    sendFollowUpMessage,
    openExternal,
  };
}
