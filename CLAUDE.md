# AI Product Playbook — LLM Development Guide

> **Source of truth for all LLMs working on this project.**
> Claude, Cursor, Gemini, GPT, Codex — everyone reads this file.

## Project

- **What**: Tools and products built around the LLM-Maintained Enterprise Playbook
- **Owner**: Kalpesh Jaju
- **Stack**: See `docs/MOAT-STACK-SETUP.md` for the moat stack (Promptfoo, Composio, Inception, Langfuse, LiteLLM, prompt versioning + A/B).

## Rules

- Push to GitHub after every implementation
- Include confidence scores on technical recommendations
- Ask for clarification when requirements are ambiguous
- Use explicit types, no `any` — prefer `unknown`
- Never commit console.log, commented-out code, or unused imports
- Write code so any LLM can understand it instantly (clear names, comments on non-obvious logic)

## Conventions

- Keep files under 400 lines, functions under 75 lines
- Every file gets a top-level comment: what it does, why it exists
- Error messages must include context (what failed, where, why)
- No `any` types — use `unknown` with type guards

## For New LLMs Joining

1. Read this file first
2. Read `LLM-MAINTAINED-ENTERPRISE-PLAYBOOK.md` for the philosophy
3. Check git log for recent context
4. Ask if anything is unclear — don't guess
