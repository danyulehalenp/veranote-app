#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd /Users/danielhale/.openclaw/workspace/app-prototype
exec npm run dev:test
