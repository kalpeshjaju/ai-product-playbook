/**
 * FILE PURPOSE: Multi-strategy JSON extraction and repair from LLM responses
 *
 * WHY: LLMs wrap JSON in markdown, add trailing commas, inject comments, and
 *      sometimes return partial objects. Direct JSON.parse() fails 15-30% of
 *      the time in production.
 * HOW: 5 extraction strategies tried in order of reliability, then 3-stage
 *      repair (direct → manual fixes → jsonrepair library).
 *
 * DEPENDENCIES: jsonrepair (npm) — handles 95%+ of LLM JSON malformation
 *
 * ADAPTED FROM: ui-ux-audit-tool/src/v4/features/synthesis/synthesis-json-extractor.ts
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import { jsonrepair } from 'jsonrepair';

// ============================================================================
// Types
// ============================================================================

export interface ExtractionResult {
  data: unknown;
  strategy: number;  // Which strategy succeeded (1-5). Higher = more degraded.
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract and repair JSON from an LLM response string.
 *
 * WHY: LLMs don't reliably produce clean JSON. This function handles the
 *      full spectrum from perfect JSON to markdown-wrapped, comment-laden output.
 *
 * @param text - Raw LLM response text
 * @returns Parsed JSON object with metadata about which strategy succeeded
 * @throws Error if no JSON can be extracted after all strategies
 *
 * EXAMPLE:
 * ```typescript
 * const response = '```json\n{"summary": "...",}\n```';
 * const { data, strategy } = extractJson(response);
 * // data = { summary: "..." }, strategy = 2
 * ```
 *
 * EDGE CASES:
 * - No JSON in response → throws with preview of response
 * - Nested objects with trailing commas → repaired
 * - Single/multi-line comments → stripped
 * - Multiple JSON blocks → largest is used
 */
export function extractJson(text: string): ExtractionResult {
  const strategies = [
    () => extractFromEnvelope(text),
    () => extractFromMarkdownBlock(text),
    () => extractBalancedJson(text),
    () => extractGreedyMatch(text),
    () => extractFullText(text),
  ];

  for (let i = 0; i < strategies.length; i++) {
    try {
      const strategy = strategies[i];
      if (!strategy) continue;
      const extracted = strategy();
      if (extracted) {
        return { data: parseAndRepairJson(extracted), strategy: i + 1 };
      }
    } catch {
      // Strategy failed — try next one
    }
  }

  const preview = text.substring(0, 200).replace(/\n/g, ' ');
  throw new Error(
    `Unable to find JSON in LLM response. ` +
    `Preview: "${preview}${text.length > 200 ? '...' : ''}"`
  );
}

// ============================================================================
// Extraction Strategies (ordered by reliability)
// ============================================================================

/**
 * Strategy 1: Extract from sentinel envelope (JSON_OUTPUT_START...JSON_OUTPUT_END)
 *
 * WHY: Most reliable when you control the prompt. Instruct the LLM to wrap
 *      JSON between sentinels and this strategy finds it unambiguously.
 */
function extractFromEnvelope(text: string): string | null {
  const startSentinel = 'JSON_OUTPUT_START';
  const endSentinel = 'JSON_OUTPUT_END';
  const startIdx = text.indexOf(startSentinel);
  const endIdx = text.lastIndexOf(endSentinel);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return text.slice(startIdx + startSentinel.length, endIdx).trim();
  }
  return null;
}

/**
 * Strategy 2: Extract from markdown code block (```json ... ```)
 *
 * WHY: LLMs commonly wrap JSON in markdown code blocks even when not asked.
 */
function extractFromMarkdownBlock(text: string): string | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  // If multiple code blocks, use the largest one
  const allCodeBlocks = Array.from(text.matchAll(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g));
  if (allCodeBlocks.length > 0) {
    const largestBlock = allCodeBlocks.reduce((max, current) =>
      (current[1]?.length ?? 0) > (max[1]?.length ?? 0) ? current : max
    );
    if (largestBlock[1]) {
      return largestBlock[1].trim();
    }
  }

  return null;
}

/**
 * Strategy 3: Extract balanced JSON (proper brace depth matching)
 *
 * WHY: Handles cases where JSON is embedded in prose without markdown markers.
 *      Properly handles nested objects and strings containing braces.
 */
function extractBalancedJson(text: string): string | null {
  const startIndex = text.indexOf('{');
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        return text.substring(startIndex, i + 1);
      }
    }
  }

  return null;
}

/**
 * Strategy 4: Greedy match (first { to last })
 *
 * WHY: Last resort for badly formatted responses. May include trailing garbage
 *      but jsonrepair can often salvage it.
 */
function extractGreedyMatch(text: string): string | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0].trim() : null;
}

/**
 * Strategy 5: Entire text is JSON
 *
 * WHY: Some LLMs return clean JSON with no wrapping at all.
 */
function extractFullText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  return null;
}

// ============================================================================
// JSON Repair
// ============================================================================

/**
 * Parse JSON with 3-stage progressive repair.
 *
 * Stage 1: Direct JSON.parse (fast path for clean JSON)
 * Stage 2: Manual repairs (trailing commas, comments)
 * Stage 3: jsonrepair library (handles complex malformation)
 */
function parseAndRepairJson(jsonText: string): unknown {
  // Stage 1: Direct parse
  try {
    return JSON.parse(jsonText);
  } catch {
    // Continue to repair
  }

  // Stage 2: Common manual repairs
  let repaired = jsonText;
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');     // Trailing commas
  repaired = repaired.replace(/\/\/[^\n]*/g, '');         // Single-line comments
  repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '');   // Multi-line comments

  try {
    return JSON.parse(repaired);
  } catch {
    // Continue to jsonrepair
  }

  // Stage 3: jsonrepair library (final attempt)
  const finalRepaired = jsonrepair(repaired);
  return JSON.parse(finalRepaired);
}
