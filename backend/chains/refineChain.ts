import { invokeLLMWithRetry } from "../utils/retryHandler";
import { personalizedCopySchema, type PersonalizedCopy } from "../schemas/personalizedCopySchema";
import { runRuleChecks } from "../validators/ruleValidator";
import type { AdProfile } from "../schemas/adProfileSchema";
import type { PageProfile } from "../schemas/pageProfileSchema";

interface RefineInput {
  currentCopy: PersonalizedCopy;
  instruction: string;
  adProfile: AdProfile;
  pageProfile: PageProfile;
}

export interface RefineResult {
  copy: PersonalizedCopy;
  textReplacements: Array<{ find: string; replace: string }>;
}

/**
 * Refine Chain:
 * Takes the current personalized copy + a user instruction and regenerates
 * copy that satisfies the instruction while still matching the ad.
 * Also outputs text_replacements for global find-replace across the entire page
 * (e.g., brand name changes, arbitrary text swaps the user asks for).
 */
export async function runRefineChain(input: RefineInput): Promise<RefineResult> {
  const { currentCopy, instruction, adProfile, pageProfile } = input;

  console.log("\n" + "=".repeat(60));
  console.log("[REFINE] Starting refinement...");
  console.log(`[REFINE]    Instruction: "${instruction}"`);
  const startTime = Date.now();

  const prompt = `You are a CRO copywriter refining an already-personalized landing page.

ORIGINAL AD:
- Offer: ${adProfile.offer}
- Headline: ${adProfile.headline}
- Tone: ${adProfile.tone}
- Key Benefit: ${adProfile.key_benefit}
- Target Audience: ${adProfile.audience}

ORIGINAL PAGE:
- Headline: ${pageProfile.hero_headline}
- CTA: ${pageProfile.cta_text}

CURRENT PERSONALIZED COPY (what you must improve):
- Headline: ${currentCopy.new_hero_headline}
- Subheadline: ${currentCopy.new_subheadline}
- CTA: ${currentCopy.new_cta_text}
- Value Props: ${currentCopy.new_value_props.join(" | ")}

USER INSTRUCTION:
"${instruction}"

YOUR TASK:
Apply the user's instruction to refine the current personalized copy.
Only change what the instruction asks for. Keep everything else close to the current copy.
Still maintain message match with the original ad.

IMPORTANT — text_replacements:
If the user wants to change specific text ANYWHERE on the page (like a brand name, a word in the nav bar, or text that isn't in the 4 copy fields), add entries to "text_replacements". Each entry is a case-sensitive find-and-replace pair applied globally across the entire page HTML.
Example: if user says "change Linear to Binear", add {"find": "Linear", "replace": "Binear"}.
If the user's instruction only affects the 4 copy fields, leave text_replacements as an empty array.

HARD CONSTRAINTS:
- new_hero_headline: max 80 chars
- new_subheadline: max 150 chars  
- new_cta_text: max 50 chars, MUST start with: Get, Start, Try, Claim, Join, Download, Book, See, Unlock
- new_value_props: EXACTLY 3 strings, each max 100 chars
- personalization_score: integer 1-10
- changes_made: array of strings describing what changed and why
- text_replacements: array of { "find": "...", "replace": "..." } objects
- DO NOT invent facts not in the ad or original page
- DO NOT use: revolutionary, game-changing, best-in-class, world-class, cutting-edge, unprecedented, groundbreaking

Respond ONLY with raw JSON:
{
  "new_hero_headline": "",
  "new_subheadline": "",
  "new_cta_text": "",
  "new_value_props": ["", "", ""],
  "personalization_score": 0,
  "changes_made": [""],
  "text_replacements": []
}`;

  const parsed = await invokeLLMWithRetry(prompt);

  // Coerce score to number
  if (typeof parsed.personalization_score === "string") {
    parsed.personalization_score = parseInt(parsed.personalization_score, 10);
  }

  // Extract text_replacements before Zod validation (Zod schema doesn't have this field)
  const textReplacements: Array<{ find: string; replace: string }> =
    Array.isArray(parsed.text_replacements) ? parsed.text_replacements : [];

  // Remove non-schema field before Zod parsing
  delete parsed.text_replacements;

  try {
    const validated = personalizedCopySchema.parse(parsed);

    // Run rule checks and silently sanitize
    const ruleResult = runRuleChecks(validated);
    const finalCopy = ruleResult.sanitizedCopy;

    const elapsed = Date.now() - startTime;
    console.log(`[REFINE] Done in ${elapsed}ms — score: ${finalCopy.personalization_score}/10`);
    console.log(`[REFINE]    new_headline: "${finalCopy.new_hero_headline}"`);
    if (textReplacements.length > 0) {
      console.log(`[REFINE]    text_replacements: ${textReplacements.map(r => `"${r.find}" → "${r.replace}"`).join(", ")}`);
    }
    console.log("=".repeat(60) + "\n");

    return { copy: finalCopy, textReplacements };
  } catch (zodError: any) {
    console.error("[REFINE] Zod validation failed:", JSON.stringify(zodError.errors || zodError.issues));
    throw new Error(`Refined copy failed schema validation: ${JSON.stringify(zodError.errors || zodError.issues)}`);
  }
}
