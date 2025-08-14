#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
pnpm -w --filter @verifd/shared build
cd apps/web-verify
pnpm build  # next build