import { invokeLLMWithRetry } from "../utils/retryHandler";
import {
  personalizedCopySchema,
  type PersonalizedCopy,
} from "../schemas/personalizedCopySchema";
import type { AdProfile } from "../schemas/adProfileSchema";
import type { PageProfile } from "../schemas/pageProfileSchema";

interface PersonalizationInput {
  adProfile: AdProfile;
  pageProfile: PageProfile;
  retryFeedback?: string;
}

/**
 * Personalization Chain:
 * Takes ad profile + page profile and generates personalized copy.
 * Optionally includes retry feedback from validation failures.
 */
export async function runPersonalizationChain(
  input: PersonalizationInput
): Promise<PersonalizedCopy> {
  const { adProfile, pageProfile, retryFeedback } = input;

  console.log("\n" + "=".repeat(60));
  console.log("[PERSONALIZE] Generating personalized copy...");
  console.log(`[PERSONALIZE]    Ad: offer="${adProfile.offer}", tone=${adProfile.tone}`);
  console.log(`[PERSONALIZE]    Page: headline="${pageProfile.hero_headline.substring(0, 50)}"`);
  if (retryFeedback) {
    console.log(`[PERSONALIZE]    RETRY mode — feedback: "${retryFeedback}"`);
  }
  const startTime = Date.now();

  let prompt = `You are a CRO (Conversion Rate Optimization) expert.
Personalize this landing page to create perfect message match with the ad.

AD CREATIVE:
- Offer: ${adProfile.offer}
- Headline: ${adProfile.headline}
- Tone: ${adProfile.tone}
- Target Audience: ${adProfile.audience}
- Urgency Level: ${adProfile.urgency_level}
- Key Benefit: ${adProfile.key_benefit}
- Ad CTA: ${adProfile.cta_text}

CURRENT LANDING PAGE:
- Headline: ${pageProfile.hero_headline}
- Subheadline: ${pageProfile.subheadline}
- Value Props: ${pageProfile.value_props.join(", ")}
- Current CTA: ${pageProfile.cta_text}
- Current Tone: ${pageProfile.current_tone}

YOUR TASK:
Rewrite only these 4 elements to match the ad's message, tone and audience:
1. Hero headline — must echo the ad offer and headline
2. Subheadline — must reinforce the key benefit from the ad
3. CTA button text — must match the ad's urgency level
4. Exactly 3 value propositions — aligned with ad's promised benefits

HARD CONSTRAINTS:
- new_hero_headline: max 80 chars, must include core offer keyword from ad
- new_subheadline: max 150 chars
- new_cta_text: max 50 chars, MUST start with action verb: Get, Start, Try, Claim, Join, Download, Book, See, Unlock
- new_value_props: EXACTLY 3 strings, each max 100 chars
- personalization_score: integer 1-10 rating how well output matches ad
- changes_made: array of strings explaining each change made

DO NOT:
- Invent features or benefits not in the ad or original page
- Change brand name or product name
- Add pricing unless in original page
- Use these banned words: revolutionary, game-changing, best-in-class, world-class, cutting-edge, unprecedented, groundbreaking

Respond ONLY with raw JSON, no markdown, no explanation:
{
  "new_hero_headline": "",
  "new_subheadline": "",
  "new_cta_text": "",
  "new_value_props": ["", "", ""],
  "personalization_score": 0,
  "changes_made": [""]
}`;

  // Append retry feedback if this is a retry attempt
  if (retryFeedback) {
    prompt += `\n\nIMPORTANT CORRECTION NEEDED: Your previous attempt was rejected for this reason: "${retryFeedback}". Fix this issue in your response.`;
  }

  const parsed = await invokeLLMWithRetry(prompt);

  // Ensure personalization_score is a number
  if (typeof parsed.personalization_score === "string") {
    parsed.personalization_score = parseInt(parsed.personalization_score, 10);
  }

  try {
    const validated = personalizedCopySchema.parse(parsed);
    const elapsed = Date.now() - startTime;
    console.log(`[PERSONALIZE] Personalized copy validated in ${elapsed}ms`);
    console.log(`[PERSONALIZE]    new_headline="${validated.new_hero_headline}"`);
    console.log(`[PERSONALIZE]    new_cta="${validated.new_cta_text}"`);
    console.log(`[PERSONALIZE]    score=${validated.personalization_score}/10`);
    console.log(`[PERSONALIZE]    changes=${validated.changes_made.length} items`);
    console.log("=".repeat(60) + "\n");
    return validated;
  } catch (zodError: any) {
    console.error("[PERSONALIZE] Zod validation failed!");
    console.error("[PERSONALIZE]    Parsed data:", JSON.stringify(parsed));
    console.error("[PERSONALIZE]    Errors:", JSON.stringify(zodError.errors || zodError.issues));
    throw new Error(
      `Personalized copy validation failed: ${JSON.stringify(zodError.errors || zodError.issues)}`
    );
  }
}
