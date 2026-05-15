# Contributing

Keep gameplay changes deterministic and test-first. Shared behavior belongs in packages, not app code. The game engine must stay pure and replayable: no time, storage, network, random, DOM, or server dependencies.

## Required Checks

- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm test:e2e

## PRD Anchors

- Deterministic event-sourced engine
- WebRTC peer synchronization
- Invite-based room joins
- Bots and reconnect recovery
- Premium animated UI with accessible reduced-motion paths
