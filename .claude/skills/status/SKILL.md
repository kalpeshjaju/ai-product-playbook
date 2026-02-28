name: status
description: Project health check — git state, tests, deploys, and issues in one shot. Use when the user says "/status" or asks about project health.
---

Run these checks in order and present a concise summary table. Do NOT explore or audit the codebase — just report status.

## Checks

1. **Git state**
   ```bash
   git status --short && git log --oneline -5
   ```

2. **Test suite**
   ```bash
   cd /Users/kalpeshjaju/Development/ai-product-playbook && npm test 2>&1 | tail -20
   ```

3. **Type check**
   ```bash
   cd /Users/kalpeshjaju/Development/ai-product-playbook && npx turbo run type-check 2>&1 | tail -10
   ```

4. **Lint**
   ```bash
   cd /Users/kalpeshjaju/Development/ai-product-playbook && npx turbo run lint 2>&1 | tail -10
   ```

5. **Architecture limits**
   ```bash
   cd /Users/kalpeshjaju/Development/ai-product-playbook && python scripts/check_architecture_limits.py 2>&1 | tail -5
   ```

6. **Open Sentry issues** (if MCP available)
   - Check via Sentry MCP for unresolved issues in the last 24h
   - If MCP unavailable, skip with "Sentry: not connected"

## Output Format

Present results as a markdown table:

| Area | Status | Details |
|------|--------|---------|
| Git | ... | branch, uncommitted changes count |
| Tests | ... | pass/fail count |
| Types | ... | clean or error count |
| Lint | ... | clean or warning count |
| Architecture | ... | pass or violations |
| Sentry | ... | issue count or "not connected" |
| Recent commits | ... | last 5 one-liners |

Keep the output under 30 lines. No exploration, no suggestions — just facts.
