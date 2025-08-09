# Contributing to verifd

## Development Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start development servers:
   ```bash
   pnpm dev
   ```

## Code Style

- Use TypeScript for all JavaScript code
- Follow the `.editorconfig` settings
- Run `pnpm format` before committing
- Ensure tests pass with `pnpm test`

## Commit Convention

We follow conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build/tooling changes

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Update RELAY.md with your changes
4. Ensure all tests pass
5. Submit a PR with a clear description

## Architecture Decisions

Major decisions should be documented in RELAY.md under the "Decisions" section.

## Communication

- Use RELAY.md for async handoffs between Claude Code and developers
- Log structured changes in `/handoff/log/`
- Keep CLAUDE.md updated with any new conventions