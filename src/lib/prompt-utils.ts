/**
 * Shared prompt building utilities for caption endpoints.
 * Builds contextual trigger word sentences that are appended to user prompts.
 */

// ---------------------------------------------------------------------------
// Trigger word sentence builders
// ---------------------------------------------------------------------------

/**
 * Build the contextual sentence for a character/person trigger word.
 */
function buildPersonSentence(person: string): string {
  return `The Character in question is called '${person}'.`;
}

/**
 * Build the contextual sentence for an "other" trigger word (style, object, etc.).
 */
function buildOtherSentence(other: string): string {
  return `The thing being captioned here is called '${other}'. If this is not a recognizable object or subject, it refers to an artistic style.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build trigger word context sentences to append to the user prompt.
 * Returns an empty string if neither trigger word is provided.
 */
export function buildTriggerContext(
  triggerWordPerson: string,
  triggerWordOther: string
): string {
  const person = triggerWordPerson.trim();
  const other = triggerWordOther.trim();

  if (!person && !other) return "";

  const parts: string[] = [];
  if (person) parts.push(buildPersonSentence(person));
  if (other) parts.push(buildOtherSentence(other));

  return parts.join(" ");
}

/**
 * Build the final user prompt text sent to the vision API.
 * Replaces {trigger} placeholders, then appends trigger word context sentences.
 */
export function buildUserPrompt(
  userPrompt: string,
  triggerWordPerson: string,
  triggerWordOther: string
): string {
  const trimmedPrompt = userPrompt.trim();
  const person = triggerWordPerson.trim();
  const other = triggerWordOther.trim();

  // Combined trigger for {trigger} placeholder replacement (backward compat)
  const combinedTrigger = [person, other].filter(Boolean).join(" ");

  let result = trimmedPrompt;

  // Replace {trigger} placeholder if present
  if (result.includes("{trigger}") && combinedTrigger) {
    result = result.replace(/{trigger}/g, combinedTrigger);
  }

  // Append contextual trigger word sentences
  const triggerContext = buildTriggerContext(person, other);
  if (triggerContext) {
    result = result ? `${result} ${triggerContext}` : triggerContext;
  }

  return result;
}
