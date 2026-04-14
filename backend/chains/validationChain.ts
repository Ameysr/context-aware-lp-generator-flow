import { runRuleChecks } from "../validators/ruleValidator";
import { invokeLLMWithRetry } from "../utils/retryHandler";
import type { PersonalizedCopy } from "../schemas/personalizedCopySchema";
import type { AdProfile } from "../schemas/adProfileSchema";

interface ValidationResult {
  valid: boolean;
  score?: number;
  reason?: string;
  step?: number;
  needsRetry?: boolean;
  sanitizedCopy?: PersonalizedCopy;
}

/**
 * Validation Chain:
 * Step 1 — Non-LLM rule checks (ruleValidator)
 * Step 2 — LLM self-check via Groq (only if step 1 passes)
 */
export async function runValidationChain(
  adProfile: AdProfile,
  personalizedCopy: PersonalizedCopy
): Promise<ValidationResult> {
  console.log("\n" + "=".repeat(60));
  console.log("[VALIDATION] Running validation pipeline...");
  const startTime = Date.now();

  // STEP 1: Rule-based validation (no LLM)
  console.log("[VALIDATION] Step 1: Rule-based checks...");
  const ruleCheck = runRuleChecks(personalizedCopy);

  if (!ruleCheck.passed) {
    console.log(`[VALIDATION] Step 1 FAILED — ${ruleCheck.failedRules.length} rules broken:`);
    ruleCheck.failedRules.forEach((r) => console.log(`[VALIDATION]    • ${r}`));
    console.log("=".repeat(60) + "\n");
    return {
      valid: false,
      reason: `Rule failed: ${ruleCheck.failedRules.join("; ")}`,
      step: 1,
      needsRetry: true,
      sanitizedCopy: ruleCheck.sanitizedCopy,
    };
  }

  console.log("[VALIDATION] Step 1 passed — all rules OK");

  // Use sanitized copy going forward (banned words stripped)
  const sanitized = ruleCheck.sanitizedCopy;

  // STEP 2: LLM self-check via Groq
  console.log("[VALIDATION] Step 2: LLM self-check scoring...");

  const prompt = `Rate how well this personalized copy matches the original ad creative.

ORIGINAL AD:
- Offer: ${adProfile.offer}
- Headline: ${adProfile.headline}
- Tone: ${adProfile.tone}
- Key Benefit: ${adProfile.key_benefit}

PERSONALIZED COPY:
- Headline: ${sanitized.new_hero_headline}
- Subheadline: ${sanitized.new_subheadline}
- CTA: ${sanitized.new_cta_text}
- Value Props: ${sanitized.new_value_props.join(", ")}

Score 1-10:
10 = perfect message match, same tone, clear connection to ad
7  = good match, minor gaps
5  = partial match, noticeable disconnects
1  = no connection to ad

Respond ONLY with raw JSON:
{ "score": 8, "reason": "one sentence explanation" }`;

  try {
    const parsed = await invokeLLMWithRetry(prompt);
    const score =
      typeof parsed.score === "number"
        ? parsed.score
        : parseInt(parsed.score, 10);
    const reason = parsed.reason || "No reason provided";

    const elapsed = Date.now() - startTime;
    console.log(`[VALIDATION] LLM Score: ${score}/10 — "${reason}"`);
    console.log(`[VALIDATION]    Elapsed: ${elapsed}ms`);

    if (score >= 7) {
      console.log(`[VALIDATION] PASSED (score >= 7)`);
      console.log("=".repeat(60) + "\n");
      return {
        valid: true,
        score,
        reason,
        sanitizedCopy: sanitized,
      };
    }

    console.log(`[VALIDATION] FAILED — score ${score} < 7, needs retry`);
    console.log("=".repeat(60) + "\n");
    return {
      valid: false,
      score,
      reason,
      needsRetry: true,
      sanitizedCopy: sanitized,
    };
  } catch (error: any) {
    // If LLM validation fails, fall back to accepting the rule-checked result
    const elapsed = Date.now() - startTime;
    console.warn(`[VALIDATION] LLM self-check failed (${elapsed}ms): ${error.message}`);
    console.warn("[VALIDATION]    Accepting rule-checked result as fallback.");
    console.log("=".repeat(60) + "\n");
    return {
      valid: true,
      score: 6,
      reason: "LLM self-check unavailable, passed rule checks only",
      sanitizedCopy: sanitized,
    };
  }
}
