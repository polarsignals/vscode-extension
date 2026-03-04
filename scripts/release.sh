#!/bin/bash
#
# Release Script for VS Code Extension
# =====================================
#
# Creates a new release by bumping the version, committing, and tagging.
# The git tag triggers the GitHub Actions publish workflow.
#
# Usage:
#   ./scripts/release.sh [patch|minor|major]
#
# Arguments:
#   patch  - Bump patch version (1.0.0 → 1.0.1) [default]
#   minor  - Bump minor version (1.0.0 → 1.1.0)
#   major  - Bump major version (1.0.0 → 2.0.0)
#
# Examples:
#   ./scripts/release.sh           # patch release
#   ./scripts/release.sh patch     # 1.0.0 → 1.0.1
#   ./scripts/release.sh minor     # 1.0.0 → 1.1.0
#   ./scripts/release.sh major     # 1.0.0 → 2.0.0
#
# After running, push to trigger the publish workflow:
#   git push origin main --tags
#
set -e

BUMP_TYPE="${1:-patch}"

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo "Error: Working directory not clean. Commit or stash changes first."
  exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Bump version using npm (works with pnpm too, just modifies package.json)
pnpm version "$BUMP_TYPE" --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "New version: $NEW_VERSION"

# Commit and tag
git add package.json
git commit -m "Release v$NEW_VERSION"
git tag "v$NEW_VERSION"

echo ""
echo "Created commit and tag for v$NEW_VERSION"
echo "Run 'git push origin main --tags' to trigger the publish workflow"
