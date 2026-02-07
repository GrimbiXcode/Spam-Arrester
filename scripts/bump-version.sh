#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
agent_pkg="$root_dir/agent/package.json"
bot_pkg="$root_dir/bot/package.json"

get_version() {
  node -p "require('$1').version"
}

agent_version="$(get_version "$agent_pkg")"
bot_version="$(get_version "$bot_pkg")"

if [[ "$agent_version" != "$bot_version" ]]; then
  echo "Version mismatch: agent=$agent_version bot=$bot_version" >&2
  exit 1
fi

status_lines="$(git -C "$root_dir" status --porcelain)"
if [[ -n "$status_lines" ]]; then
  disallowed="$(printf "%s\n" "$status_lines" | awk '{print $2}' | grep -vE '^(agent|bot)/package\.json$' || true)"
  if [[ -n "$disallowed" ]]; then
    echo "Uncommitted changes outside version files detected:" >&2
    printf "%s\n" "$disallowed" >&2
    exit 1
  fi
fi

echo "Current version: $agent_version"
echo "Choose bump type:"
select bump in major minor patch; do
  if [[ -n "${bump:-}" ]]; then
    break
  fi
  echo "Please choose 1, 2, or 3."
done

new_tag="$(cd "$root_dir/agent" && npm version "$bump" --no-git-tag-version)"
new_version="${new_tag#v}"

cd "$root_dir/bot"
npm version "$new_version" --no-git-tag-version >/dev/null

default_msg="chore: bump version to $new_version"
read -r -p "Commit message [$default_msg]: " commit_msg
commit_msg="${commit_msg:-$default_msg}"

git -C "$root_dir" add "$agent_pkg" "$bot_pkg"
git -C "$root_dir" commit -m "$commit_msg"

if git -C "$root_dir" rev-parse -q --verify "refs/tags/v$new_version" >/dev/null; then
  echo "Git tag v$new_version already exists." >&2
  exit 1
fi

git -C "$root_dir" tag "v$new_version"
echo "Updated both projects to $new_version and created git tag v$new_version."
