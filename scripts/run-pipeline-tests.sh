#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
components=(agent bot)

export TG_API_ID="${TG_API_ID:-12345}"
export TG_API_HASH="${TG_API_HASH:-test_hash_for_ci}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Please install Node.js and npm first." >&2
  exit 1
fi

for component in "${components[@]}"; do
  component_dir="$root_dir/$component"
  echo "==> [$component] npm ci"
  (cd "$component_dir" && npm ci)

  echo "==> [$component] npm run lint"
  (cd "$component_dir" && npm run lint)

  echo "==> [$component] npm test"
  (cd "$component_dir" && npm test)

  echo "==> [$component] npm run build"
  (cd "$component_dir" && npm run build)
done

echo "Pipeline tests completed for: ${components[*]}"
