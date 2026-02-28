# Constraints

> Hard limits that ALL LLMs must follow. Violations are bugs, not style preferences.
> **Owner**: Kalpesh Jaju

## Architecture Constraints
- [ ] Files must be under 600 lines
- [ ] Functions must be under 120 lines
- [ ] No circular dependencies between modules
  **Enforced by**: `scripts/check_architecture_limits.py` + CI gate

## Code Style Constraints
- [ ] No `any` types in TypeScript (use `unknown`)
- [ ] No `Any` types in Python (use explicit types or `object`)
- [ ] No console.log / print() in production code
- [ ] No commented-out code
  **Enforced by**: ESLint / ruff + CI gate

## Dependency Constraints
- [ ] No new dependency without a DECISIONS.md entry
- [ ] Pin all dependency versions
  **Enforced by**: CI check on package.json / requirements.txt changes

## Business Rule Constraints
<!-- Add as product requirements emerge -->

## Security Constraints
- [ ] No secrets in code (use environment variables)
- [ ] No raw user input in prompts without sanitization
- [ ] No internal tracebacks exposed to clients
  **Enforced by**: GitGuardian pre-commit + Semgrep CI
