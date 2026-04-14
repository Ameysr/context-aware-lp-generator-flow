import { useState, useCallback, useRef } from "react";
import { connectToStream, submitPersonalize } from "../api/personalize";

export type AppState = "idle" | "loading" | "result";

export interface AdInput {
  imageBase64?: string;
  mimeType?: string;
  adText?: string;
  adUrl?: string;
}

export interface StepStatuses {
  [key: number]: "pending" | "active" | "done" | "error";
}

export interface PersonalizeResult {
  success: boolean;
  warning?: string;
  adProfile?: {
    headline: string;
    offer: string;
    tone: string;
    audience: string;
    urgency_level: string;
    key_benefit: string;
    cta_text: string;
  };
  pageProfile?: any;
  personalizedCopy?: {
    new_hero_headline: string;
    new_subheadline: string;
    new_cta_text: string;
    new_value_props: string[];
    personalization_score: number;
    changes_made: string[];
  };
  validationScore?: number;
  validationReason?: string;
  llmUsed?: "groq" | "deepseek";
  visionUsed?: boolean;
  processingTime?: number;
  screenshotBase64?: string;
  brandColors?: { primary: string; background: string; text: string };
  faviconUrl?: string;
  previewId?: string;
  originalPreviewId?: string;
  elementSelectors?: { headline: string; subheadline: string; ctaButtons: string[]; valueProps: string[] };
  baseUrl?: string;
  croAnalysis?: {
    overall_score: number;
    summary: string;
    suggestions: Array<{
      severity: "critical" | "warning" | "good";
      category: string;
      title: string;
      description: string;
      fix: string;
    }>;
  } | null;
  error?: string;
  stage?: string;
}

export function usePersonalize() {
  const [adInput, setAdInput] = useState<AdInput>({});
  const [pageUrl, setPageUrl] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [result, setResult] = useState<PersonalizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<StepStatuses>({
    1: "pending",
    2: "pending",
    3: "pending",
    4: "pending",
    5: "pending",
    6: "pending",
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  const resetSteps = useCallback(() => {
    setStepStatuses({
      1: "pending",
      2: "pending",
      3: "pending",
      4: "pending",
      5: "pending",
      6: "pending",
    });
    setCurrentStep(0);
    setError(null);
    setResult(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    // Validate inputs
    if (!pageUrl) {
      setError("Please enter a landing page URL.");
      return;
    }

    try {
      new URL(pageUrl);
    } catch {
      setError("Please enter a valid URL.");
      return;
    }

    const hasAdInput =
      adInput.imageBase64 || adInput.adText || adInput.adUrl;
    if (!hasAdInput) {
      setError("Please provide ad content — upload an image, paste text, or enter a URL.");
      return;
    }

    // Reset state
    resetSteps();
    setAppState("loading");

    try {
      // Connect to SSE stream
      const { sessionId, eventSource } = await connectToStream({
        onStep: (step, _label, status) => {
          setStepStatuses((prev) => ({ ...prev, [step]: status as any }));
          if (status === "active") {
            setCurrentStep(step);
          }
        },
        onResult: (data) => {
          setResult(data);
          setAppState("result");
        },
        onError: (errMsg) => {
          setError(errMsg);
          setAppState("idle");
        },
      });

      eventSourceRef.current = eventSource;

      // Submit the personalization request
      const response = await submitPersonalize({
        pageUrl,
        adImageBase64: adInput.imageBase64,
        mimeType: adInput.mimeType,
        adText: adInput.adText,
        adUrl: adInput.adUrl,
        sessionId,
      });

      // If SSE didn't deliver the result already, use the REST response
      if (!result) {
        setResult(response);
        setAppState("result");
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err.message || "An error occurred.";
      setError(message);
      setAppState("idle");
    } finally {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  }, [adInput, pageUrl, resetSteps, result]);

  const handleReset = useCallback(() => {
    setAdInput({});
    setPageUrl("");
    setAppState("idle");
    resetSteps();
  }, [resetSteps]);

  return {
    adInput,
    setAdInput,
    pageUrl,
    setPageUrl,
    appState,
    result,
    error,
    currentStep,
    stepStatuses,
    handleSubmit,
    handleReset,
  };
}
