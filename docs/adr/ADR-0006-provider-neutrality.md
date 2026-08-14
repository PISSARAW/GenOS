# ADR-0006: Mandatory Provider Neutrality

## Status
Accepted

## Context
GenOS must operate across OpenAI, Anthropic, Gemini, Ollama, vLLM, and fake providers.

## Decision
Define provider-neutral model interfaces and keep provider-specific code outside core domain.

## Consequences
- Testability without paid APIs.
- Lower lock-in and broader ecosystem support.
