import type { PersonalizedCopy } from "../schemas/personalizedCopySchema";

const BANNED_WORDS = [
  "revolutionary",
  "game-changing",
  "best-in-class",
  "world-class",
  "cutting-edge",
  "unprecedented",
  "groundbreaking",
];

const ACTION_VERBS = [
  "Get",
  "Start",
  "Try",
  "Claim",
  "Join",
  "Download",
  "Book",
  "See",
  "Unlock",
];

interface RuleCheckResult {
  passed: boolean;
  failedRules: string[];
  sanitizedCopy: PersonalizedCopy;
}

/**
 * Run non-LLM rule checks on personalized copy.
 * Strips banned words silently rather than throwing.
 */
export function runRuleChecks(copy: PersonalizedCopy): RuleCheckResult {
  const failedRules: string[] = [];
  const sanitized = { ...copy };

  // Helper to strip banned words from a string
  function stripBanned(text: string): string {
    let result = text;
    for (const word of BANNED_WORDS) {
      const regex = new RegExp(word, "gi");
      if (regex.test(result)) {
        console.log(`[RULE VALIDATOR] Warning: stripped banned word "${word}"`);
        result = result.replace(regex, "").replace(/\s{2,}/g, " ").trim();
      }
    }
    return result;
  }

  // Sanitize all text fields by stripping banned words
  sanitized.new_hero_headline = stripBanned(sanitized.new_hero_headline);
  sanitized.new_subheadline = stripBanned(sanitized.new_subheadline);
  sanitized.new_cta_text = stripBanned(sanitized.new_cta_text);
  sanitized.new_value_props = sanitized.new_value_props.map(stripBanned);
  sanitized.changes_made = sanitized.changes_made.map(stripBanned);

  // Rule 1: Headline length
  if (sanitized.new_hero_headline.length > 80) {
    failedRules.push(
      `Headline exceeds 80 chars (${sanitized.new_hero_headline.length})`
    );
  }

  // Rule 2: CTA starts with action verb
  const ctaStartsWithVerb = ACTION_VERBS.some((verb) =>
    sanitized.new_cta_text.startsWith(verb)
  );
  if (!ctaStartsWithVerb) {
    failedRules.push(
      `CTA must start with an action verb: ${ACTION_VERBS.join(", ")}`
    );
  }

  // Rule 3: Exactly 3 value props
  if (sanitized.new_value_props.length !== 3) {
    failedRules.push(
      `Must have exactly 3 value props (got ${sanitized.new_value_props.length})`
    );
  }

  // Rule 4: Score is valid number 1-10
  if (
    typeof sanitized.personalization_score !== "number" ||
    sanitized.personalization_score < 1 ||
    sanitized.personalization_score > 10
  ) {
    failedRules.push("Personalization score must be a number between 1 and 10");
  }

  // Rule 5: No empty fields
  if (!sanitized.new_hero_headline) {
    failedRules.push("Headline is empty");
  }
  if (!sanitized.new_subheadline) {
    failedRules.push("Subheadline is empty");
  }
  if (!sanitized.new_cta_text) {
    failedRules.push("CTA text is empty");
  }
  if (sanitized.new_value_props.some((vp) => !vp || vp.trim() === "")) {
    failedRules.push("One or more value props are empty");
  }

  return {
    passed: failedRules.length === 0,
    failedRules,
    sanitizedCopy: sanitized,
  };
}
