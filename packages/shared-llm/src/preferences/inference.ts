/**
 * FILE PURPOSE: Rule-based preference inference from feedback signals
 *
 * WHY: STRATEGY pillar — infer user preferences from feedback patterns
 *      without ML complexity. Pattern matching on feedback history to
 *      populate the user_preferences table automatically.
 *
 * HOW: Analyzes a batch of feedback signals and produces preference
 *      key-value pairs with confidence scores.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

/** A single feedback signal from an AI generation. */
export interface FeedbackSignal {
  userFeedback: string;       // accepted | rejected | edited | regenerated | ignored
  thumbs: number | null;      // -1 | 0 | 1
  model: string;
  taskType: string;
  latencyMs: number;
  qualityScore: number | null;
  userEditDiff: string | null;
}

/** An inferred preference with confidence score. */
export interface InferredPreference {
  preferenceKey: string;
  preferenceValue: unknown;
  confidence: number;         // 0.0 - 1.0
  evidenceCount: number;
  source: 'inferred';
}

/**
 * Infer preferences from a batch of feedback signals.
 *
 * Rules:
 * 1. If >60% of accepted outputs use model X → preferred_model = X
 * 2. If >50% of edits shorten the output → preferred_length = concise
 * 3. If >40% regenerated with avg latency > 3000ms → preferred_speed = fast
 * 4. If thumbs average > 0.5 for a task type → preferred_task_quality = high
 *
 * @param signals - Feedback signals to analyze (min 5 for reliable inference)
 * @param minEvidenceCount - Minimum signals required per inference (default: 5)
 */
export function inferPreferences(
  signals: FeedbackSignal[],
  minEvidenceCount = 5,
): InferredPreference[] {
  if (signals.length < minEvidenceCount) return [];

  const preferences: InferredPreference[] = [];

  // Rule 1: Model preference from accepted outputs
  const accepted = signals.filter((s) => s.userFeedback === 'accepted');
  if (accepted.length >= minEvidenceCount) {
    const modelCounts = new Map<string, number>();
    for (const s of accepted) {
      modelCounts.set(s.model, (modelCounts.get(s.model) ?? 0) + 1);
    }
    for (const [model, count] of modelCounts) {
      if (count / accepted.length > 0.6) {
        preferences.push({
          preferenceKey: 'preferred_model',
          preferenceValue: model,
          confidence: 0.7,
          evidenceCount: count,
          source: 'inferred',
        });
      }
    }
  }

  // Rule 2: Length preference from edit patterns
  const edited = signals.filter((s) => s.userFeedback === 'edited' && s.userEditDiff);
  if (edited.length >= minEvidenceCount) {
    const shortened = edited.filter((s) => {
      // Heuristic: if edit diff starts with '-' lines (deletions), output was shortened
      const lines = (s.userEditDiff ?? '').split('\n');
      const deletions = lines.filter((l) => l.startsWith('-')).length;
      const additions = lines.filter((l) => l.startsWith('+')).length;
      return deletions > additions;
    });
    if (shortened.length / edited.length > 0.5) {
      preferences.push({
        preferenceKey: 'preferred_length',
        preferenceValue: 'concise',
        confidence: 0.6,
        evidenceCount: shortened.length,
        source: 'inferred',
      });
    }
  }

  // Rule 3: Speed preference from regeneration patterns
  const regenerated = signals.filter((s) => s.userFeedback === 'regenerated');
  if (regenerated.length >= minEvidenceCount) {
    const avgLatency = regenerated.reduce((sum, s) => sum + s.latencyMs, 0) / regenerated.length;
    if (regenerated.length / signals.length > 0.4 && avgLatency > 3000) {
      preferences.push({
        preferenceKey: 'preferred_speed',
        preferenceValue: 'fast',
        confidence: 0.6,
        evidenceCount: regenerated.length,
        source: 'inferred',
      });
    }
  }

  // Rule 4: Quality preference from thumbs patterns per task type
  const taskTypes = new Set(signals.map((s) => s.taskType));
  for (const taskType of taskTypes) {
    const taskSignals = signals.filter((s) => s.taskType === taskType && s.thumbs !== null);
    if (taskSignals.length >= minEvidenceCount) {
      const avgThumbs = taskSignals.reduce((sum, s) => sum + (s.thumbs ?? 0), 0) / taskSignals.length;
      if (avgThumbs > 0.5) {
        preferences.push({
          preferenceKey: `preferred_quality_${taskType}`,
          preferenceValue: 'high',
          confidence: 0.7,
          evidenceCount: taskSignals.length,
          source: 'inferred',
        });
      }
    }
  }

  return preferences;
}
