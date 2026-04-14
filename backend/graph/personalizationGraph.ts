import { runAdAnalysisChain } from "../chains/adAnalysisChain";
import { runPageIngestionChain } from "../chains/pageIngestionChain";
import { runPersonalizationChain } from "../chains/personalizationChain";
import { runValidationChain } from "../chains/validationChain";
import { runCROAnalysisChain } from "../chains/croAnalysisChain";
import { injectPersonalizedCopy } from "../utils/htmlInjector";
import { getActiveLLM } from "../utils/llmRouter";
import type { AdProfile } from "../schemas/adProfileSchema";
import type { PageProfile } from "../schemas/pageProfileSchema";
import type { PersonalizedCopy } from "../schemas/personalizedCopySchema";
import type { CROAnalysis } from "../schemas/croAnalysisSchema";
import type { PageIngestionResult } from "../chains/pageIngestionChain";
import type { ElementSelectors } from "../scrapers/pageScraper";

// ---------- State type ----------
export interface GraphState {
  adInput: {
    imageBase64?: string;
    mimeType?: string;
    adText?: string;
    adUrl?: string;
  };
  pageUrl: string;
  adProfile: AdProfile | null;
  pageProfile: PageProfile | null;
  personalizedCopy: PersonalizedCopy | null;
  validationResult: {
    valid: boolean;
    score?: number;
    reason?: string;
    step?: number;
    needsRetry?: boolean;
    sanitizedCopy?: PersonalizedCopy;
  } | null;
  retryCount: number;
  retryFeedback: string;
  finalOutput: any | null;
  error: string | null;
  llmUsed: "groq" | "deepseek";
  visionUsed: boolean;
  screenshotBase64: string;
  brandColors: { primary: string; background: string; text: string };
  faviconUrl: string;
  // NEW — for same-page injection
  fullHTML: string;
  elementSelectors: ElementSelectors;
  baseUrl: string;
  modifiedHTML: string;
  croAnalysis: CROAnalysis | null;
}

// ---------- Step event emitter type ----------
export type StepEmitter = (
  step: number,
  label: string,
  status: "active" | "done" | "error"
) => void;

// ---------- Pipeline runner ----------
export async function runPersonalizationGraph(
  input: {
    adInput: GraphState["adInput"];
    pageUrl: string;
  },
  emitStep?: StepEmitter
): Promise<GraphState> {
  console.log("\n" + "█".repeat(70));
  console.log("█  PERSONALIZATION PIPELINE — START");
  console.log("█".repeat(70));
  console.log(`[GRAPH] PageURL: ${input.pageUrl}`);
  console.log(`[GRAPH] Ad input: ${Object.keys(input.adInput).filter((k) => !!(input.adInput as any)[k]).join(", ")}`);
  const pipelineStart = Date.now();

  const state: GraphState = {
    adInput: input.adInput,
    pageUrl: input.pageUrl,
    adProfile: null,
    pageProfile: null,
    personalizedCopy: null,
    validationResult: null,
    retryCount: 0,
    retryFeedback: "",
    finalOutput: null,
    error: null,
    llmUsed: getActiveLLM(),
    visionUsed: !!input.adInput.imageBase64,
    screenshotBase64: "",
    brandColors: { primary: "#6366f1", background: "#ffffff", text: "#000000" },
    faviconUrl: "",
    fullHTML: "",
    elementSelectors: { headline: "", subheadline: "", ctaButtons: [], valueProps: [] },
    baseUrl: "",
    modifiedHTML: "",
    croAnalysis: null,
  };

  try {
    // --- NODE 1 & 2: Parallel ad analysis + page ingestion ---
    console.log("\n[GRAPH] ═══ PHASE 1: Parallel analysis (Ad + Page) ═══");
    emitStep?.(1, "Analyzing Ad Creative", "active");
    emitStep?.(2, "Scanning Landing Page", "active");

    const [adProfile, pageResult] = await Promise.all([
      runAdAnalysisChain(state.adInput),
      runPageIngestionChain(state.pageUrl),
    ]);

    state.adProfile = adProfile;
    state.pageProfile = pageResult.profile;
    state.screenshotBase64 = pageResult.screenshotBase64;
    state.brandColors = pageResult.brandColors;
    state.faviconUrl = pageResult.faviconUrl;
    state.fullHTML = pageResult.fullHTML;
    state.elementSelectors = pageResult.elementSelectors;
    state.baseUrl = pageResult.baseUrl;
    state.llmUsed = getActiveLLM();

    emitStep?.(1, "Analyzing Ad Creative", "done");
    emitStep?.(2, "Scanning Landing Page", "done");

    console.log("[GRAPH] PHASE 1 complete — both profiles ready");
    console.log(`[GRAPH]    Full HTML: ${(state.fullHTML.length / 1024).toFixed(0)}KB`);
    console.log(`[GRAPH]    Selectors: headline=${state.elementSelectors.headline ? "found" : "not found"}, cta=${state.elementSelectors.ctaButtons.length}`);

    // --- NODE 3 + 4: Personalize → Validate loop ---
    let isValid = false;

    while (!isValid && state.retryCount <= 3) {
      console.log(`\n[GRAPH] ═══ PHASE 2: Personalize → Validate (attempt ${state.retryCount + 1}/4) ═══`);

      // Personalize
      emitStep?.(3, "Generating Personalized Copy", "active");

      state.personalizedCopy = await runPersonalizationChain({
        adProfile: state.adProfile!,
        pageProfile: state.pageProfile!,
        retryFeedback: state.retryFeedback || undefined,
      });

      state.llmUsed = getActiveLLM();
      emitStep?.(3, "Generating Personalized Copy", "done");

      // Validate
      emitStep?.(4, "Validating Output", "active");

      state.validationResult = await runValidationChain(
        state.adProfile!,
        state.personalizedCopy!
      );

      state.llmUsed = getActiveLLM();

      if (state.validationResult.valid) {
        isValid = true;
        if (state.validationResult.sanitizedCopy) {
          state.personalizedCopy = state.validationResult.sanitizedCopy;
        }
        emitStep?.(4, "Validating Output", "done");
        console.log("[GRAPH] Validation PASSED");
      } else if (state.retryCount < 3) {
        state.retryCount++;
        state.retryFeedback = state.validationResult.reason || "Validation failed";
        console.log(`[GRAPH] Validation FAILED — retry ${state.retryCount}/3: "${state.retryFeedback}"`);
        emitStep?.(4, "Validating Output", "active");
      } else {
        console.log("[GRAPH] Max retries (3) reached, returning best attempt.");
        if (state.validationResult.sanitizedCopy) {
          state.personalizedCopy = state.validationResult.sanitizedCopy;
        }
        emitStep?.(4, "Validating Output", "done");
        break;
      }
    }

    // --- NODE 5: HTML Injection ---
    console.log("\n[GRAPH] ═══ PHASE 3: HTML Injection ═══");
    emitStep?.(5, "Injecting Personalized Copy", "active");

    if (state.fullHTML && state.personalizedCopy) {
      try {
        state.modifiedHTML = injectPersonalizedCopy(
          state.fullHTML,
          state.personalizedCopy,
          state.elementSelectors,
          state.baseUrl
        );
        console.log(`[GRAPH] HTML injection complete — ${(state.modifiedHTML.length / 1024).toFixed(0)}KB modified HTML`);
      } catch (injectionError: any) {
        console.warn(`[GRAPH] HTML injection failed: ${injectionError.message}`);
        state.modifiedHTML = "";
      }
    } else {
      console.warn("[GRAPH] No HTML or copy available for injection");
    }

    emitStep?.(5, "Injecting Personalized Copy", "done");

    // --- NODE 6: CRO Analysis (parallel-safe, uses screenshot + profiles) ---
    console.log("\n[GRAPH] ═══ PHASE 4: CRO Analysis ═══");
    emitStep?.(6, "Analyzing CRO Opportunities", "active");

    try {
      state.croAnalysis = await runCROAnalysisChain({
        pageProfile: state.pageProfile!,
        adProfile: state.adProfile!,
        screenshotBase64: state.screenshotBase64,
      });
      console.log(`[GRAPH] CRO analysis complete — score: ${state.croAnalysis.overall_score}/10, ${state.croAnalysis.suggestions.length} suggestions`);
    } catch (croError: any) {
      console.warn(`[GRAPH] CRO analysis failed: ${croError.message}`);
      state.croAnalysis = null;
    }

    emitStep?.(6, "Analyzing CRO Opportunities", "done");

    // --- NODE 6: Output ---
    const pipelineElapsed = Date.now() - pipelineStart;
    state.finalOutput = {
      success: true,
      warning:
        !state.validationResult?.valid
          ? "Low confidence result — validation did not fully pass after retries"
          : undefined,
      adProfile: state.adProfile,
      pageProfile: state.pageProfile,
      personalizedCopy: state.personalizedCopy,
      validationScore: state.validationResult?.score,
      validationReason: state.validationResult?.reason,
      llmUsed: state.llmUsed,
      visionUsed: state.visionUsed,
      screenshotBase64: state.screenshotBase64,
      brandColors: state.brandColors,
      faviconUrl: state.faviconUrl,
      modifiedHTML: state.modifiedHTML,
      originalHTML: state.fullHTML,
      croAnalysis: state.croAnalysis,
      // Pass through for refine re-injection
      elementSelectors: state.elementSelectors,
      baseUrl: state.baseUrl,
    };

    console.log("\n" + "█".repeat(70));
    console.log(`█  PIPELINE COMPLETE — ${pipelineElapsed}ms`);
    console.log(`█  LLM: ${state.llmUsed} | Vision: ${state.visionUsed} | Retries: ${state.retryCount}`);
    console.log(`█  Score: ${state.validationResult?.score}/10`);
    console.log(`█  Modified HTML: ${state.modifiedHTML ? `${(state.modifiedHTML.length / 1024).toFixed(0)}KB` : "none"}`);
    console.log("█".repeat(70) + "\n");

    return state;
  } catch (error: any) {
    // --- ERROR NODE ---
    const pipelineElapsed = Date.now() - pipelineStart;
    console.error("\n" + "█".repeat(70));
    console.error(`█  PIPELINE ERROR after ${pipelineElapsed}ms`);
    console.error(`█  ${error.message}`);
    console.error("█".repeat(70) + "\n");

    state.error = error.message;

    let stage = "unknown";
    if (!state.adProfile) stage = "ad_analysis";
    else if (!state.pageProfile) stage = "page_ingestion";
    else if (!state.personalizedCopy) stage = "personalization";
    else stage = "validation";

    console.error(`[GRAPH] Failed at stage: ${stage}`);

    state.finalOutput = {
      success: false,
      error: error.message,
      stage,
    };

    const errorStep = !state.adProfile
      ? 1
      : !state.pageProfile
        ? 2
        : !state.personalizedCopy
          ? 3
          : 4;
    emitStep?.(errorStep, "Error", "error");

    return state;
  }
}
