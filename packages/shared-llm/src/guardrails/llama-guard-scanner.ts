/**
 * FILE PURPOSE: LlamaGuard semantic scanner via the LiteLLM proxy
 *
 * WHY: Regex catches surface patterns; LlamaGuard detects semantic safety issues
 *      (violence, sexual content, criminal advice, self-harm, etc.) that regex misses.
 * HOW: Calls LlamaGuard model through createLLMClient() (LiteLLM proxy).
 *      Errors propagate to the caller — failure mode is handled by scanOutput().
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { GuardrailScanner, GuardrailFinding } from './types.js';
import { createLLMClient } from '../llm-client.js';

/**
 * LlamaGuard S1–S14 category mapping.
 * See: https://llama.meta.com/docs/model-cards-and-prompt-formats/llama-guard-3/
 */
const CATEGORY_MAP: Record<string, string> = {
  S1: 'violent_crimes',
  S2: 'non_violent_crimes',
  S3: 'sex_related_crimes',
  S4: 'child_sexual_exploitation',
  S5: 'defamation',
  S6: 'specialized_advice',
  S7: 'privacy',
  S8: 'intellectual_property',
  S9: 'indiscriminate_weapons',
  S10: 'hate',
  S11: 'suicide_self_harm',
  S12: 'sexual_content',
  S13: 'elections',
  S14: 'code_interpreter_abuse',
};

const DEFAULT_TIMEOUT_MS = 5000;

export class LlamaGuardScanner implements GuardrailScanner {
  readonly name = 'llamaguard';
  private readonly timeoutMs: number;
  private readonly model: string;

  constructor(options?: { timeoutMs?: number }) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.model = process.env.LLAMAGUARD_MODEL ?? 'llamaguard';
  }

  async scan(text: string): Promise<GuardrailFinding[]> {
    try {
      const client = createLLMClient();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await client.chat.completions.create(
          {
            model: this.model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: `[INST] Task: Check if there is unsafe content in 'Agent' messages in conversations according to our safety policy.\n\n<BEGIN CONVERSATION>\nAgent: ${text}\n<END CONVERSATION>\n\nProvide your safety assessment for Agent in the above conversation:\n- First line must read 'safe' or 'unsafe'.\n- If unsafe, a second line must include a comma-separated list of violated categories. [/INST]` },
                ],
              },
            ],
            max_tokens: 100,
            temperature: 0,
          },
          { signal: controller.signal },
        );

        clearTimeout(timeout);

        const output = response.choices[0]?.message?.content?.trim() ?? '';
        return this.parseResponse(output);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      // Let errors propagate — failure mode handled by scanOutput() pipeline
      throw new Error(
        `LlamaGuard scanner failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  /** Parse LlamaGuard response format: "safe" or "unsafe\nS1,S7" */
  private parseResponse(output: string): GuardrailFinding[] {
    const lines = output.split('\n').map(l => l.trim());
    const verdict = lines[0]?.toLowerCase();

    if (verdict !== 'unsafe') return [];

    const categoryCodes = lines[1]?.split(',').map(c => c.trim()) ?? [];
    return categoryCodes
      .filter(code => code in CATEGORY_MAP)
      .map(code => ({
        scanner: this.name,
        category: CATEGORY_MAP[code]!,
        description: `LlamaGuard flagged content as unsafe: ${CATEGORY_MAP[code]} (${code})`,
        severity: 'high' as const,
      }));
  }
}
