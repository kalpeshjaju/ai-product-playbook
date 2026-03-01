/**
 * FILE PURPOSE: CostLedger budget enforcement middleware
 *
 * WHY: Prevents runaway LLM costs by checking budget before each API call.
 *      Returns 429 with a cost report when budget is exceeded.
 * HOW: Wraps costLedger.ensureBudget() in a try/catch, returning structured
 *      budget info on either path.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { costLedger, CostLimitExceededError } from '@playbook/shared-llm';
import type { CostReport } from '@playbook/shared-llm';

export interface CostBudgetCheck {
  allowed: boolean;
  report: CostReport;
}

/**
 * Check whether the global cost budget allows another LLM call.
 * Returns { allowed: false } with the current cost report when exceeded.
 */
export function checkCostBudget(): CostBudgetCheck {
  try {
    costLedger.ensureBudget();
    return { allowed: true, report: costLedger.getReport() };
  } catch (err) {
    if (err instanceof CostLimitExceededError) {
      return { allowed: false, report: costLedger.getReport() };
    }
    throw err;
  }
}
