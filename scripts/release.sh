#!/bin/bash
#
# Release Script for VS Code Extension
# =====================================
#
# Creates a new release by bumping the version, updating the changelog,
# committing, and tagging. Uses commit-and-tag-version.
#
# Usage:
#   ./scripts/release.sh [patch|minor|major]
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

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

pnpm release -- --release-as "$BUMP_TYPE"

NEW_VERSION=$(node -p "require('./package.json').version")
echo ""
echo "Released v$NEW_VERSION"
echo "Run 'git push origin main --tags' to trigger the publish workflow"
