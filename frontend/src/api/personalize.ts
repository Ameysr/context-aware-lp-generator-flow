import axios from "axios";

// In dev: Vite proxy handles /api → localhost:3001
// In production: point to the deployed Render backend
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface StepEvent {
  type: "step";
  step: number;
  label: string;
  status: "active" | "done" | "error";
}

interface ResultEvent {
  type: "result";
  data: any;
}

interface ErrorEvent {
  type: "error";
  error: string;
  stage: string;
}

type SSECallback = {
  onStep: (step: number, label: string, status: string) => void;
  onResult: (data: any) => void;
  onError: (error: string, stage?: string) => void;
};

/**
 * Connect to SSE stream for real-time step updates.
 * Returns the sessionId and an EventSource instance.
 */
export function connectToStream(
  callbacks: SSECallback
): Promise<{ sessionId: string; eventSource: EventSource }> {
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${API_BASE}/api/personalize/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          resolve({ sessionId: data.sessionId, eventSource });
        } else if (data.type === "step") {
          const stepData = data as StepEvent;
          callbacks.onStep(stepData.step, stepData.label, stepData.status);
        } else if (data.type === "result") {
          const resultData = data as ResultEvent;
          callbacks.onResult(resultData.data);
          eventSource.close();
        } else if (data.type === "error") {
          const errorData = data as ErrorEvent;
          callbacks.onError(errorData.error, errorData.stage);
          eventSource.close();
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    eventSource.onerror = () => {
      callbacks.onError("Connection to server lost.");
      eventSource.close();
      reject(new Error("SSE connection failed"));
    };
  });
}

/**
 * Submit personalization request to the backend.
 */
export async function submitPersonalize(payload: {
  pageUrl: string;
  adImageBase64?: string;
  mimeType?: string;
  adText?: string;
  adUrl?: string;
  sessionId?: string;
}): Promise<any> {
  const response = await axios.post(`${API_BASE}/api/personalize`, payload, {
    timeout: 120000, // 2 min timeout for full pipeline
  });
  return response.data;
}
