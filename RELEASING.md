# Release Process

This document describes how to publish new versions of Spam Arrester Docker images.

## Overview

Docker images are automatically built and published to GitHub Container Registry (ghcr.io) via GitHub Actions when you push tags or commits.

## Image Registry

Images are published to:
- **Agent**: `ghcr.io/<your-github-username>/spam-arrester-agent`
- **Bot**: `ghcr.io/<your-github-username>/spam-arrester-bot`

## Architecture Support

⚠️ **AMD64 only** - TDLib does not support ARM architecture, so both images are built for `linux/amd64` only.

## Automated Builds

### On Every Push to `main`

```bash
git push origin main
```

Creates images tagged with:
- `main` (branch name)
- `main-<git-sha>` (commit hash)

### On Pull Requests

Images are built but NOT pushed (validation only).

### On Version Tags (Releases)

```bash
# Create and push a semantic version tag
git tag v1.0.0
git push origin v1.0.0
```

Creates images tagged with:
- `v1.0.0` (full version)
- `1.0` (major.minor)
- `1` (major only)
- `latest` (if this is the latest tag)

## Release Workflow

### 1. Pre-Release Checks

```bash
# Ensure all tests pass
cd agent && npm test && cd ..
cd bot && npm test && cd ..

# Ensure linting passes
cd agent && npm run lint && cd ..
cd bot && npm run lint && cd ..

# Ensure builds succeed
cd agent && npm run build && cd ..
cd bot && npm run build && cd ..

# Ensure Docker images build
docker build -t spam-arrester-agent:test -f docker/Dockerfile .
docker build -t spam-arrester-bot:test -f docker/Dockerfile.bot .
```

### 2. Version Bump

Update version in relevant files:
- `agent/package.json`
- `bot/package.json`

```bash
# Example: bump to 1.0.0
cd agent && npm version 1.0.0 --no-git-tag-version && cd ..
cd bot && npm version 1.0.0 --no-git-tag-version && cd ..
```

### 3. Commit Changes

```bash
git add agent/package.json bot/package.json
git commit -m "chore: bump version to 1.0.0"
git push origin main
```

### 4. Create and Push Tag

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 5. Monitor Build

1. Go to your GitHub repository
2. Click "Actions" tab
3. Watch the "Build and Publish Docker Images" workflow
4. Verify both agent and bot images are built and pushed successfully

### 6. Verify Published Images

```bash
# View available tags on GitHub
# Visit: https://github.com/<username>/spam-arrester/pkgs/container/spam-arrester-agent
# Visit: https://github.com/<username>/spam-arrester/pkgs/container/spam-arrester-bot

# Pull and test the published images
docker pull ghcr.io/<username>/spam-arrester-agent:v1.0.0
docker pull ghcr.io/<username>/spam-arrester-bot:v1.0.0
```

## Using Published Images

Update `docker-compose.yml` to use published images:

```yaml
services:
  bot:
    image: ghcr.io/<username>/spam-arrester-bot:v1.0.0
    # ... rest of config

  # Agent containers created by bot will use:
  # image: ghcr.io/<username>/spam-arrester-agent:v1.0.0
```

Or update the bot's `.env` file:

```bash
AGENT_IMAGE=ghcr.io/<username>/spam-arrester-agent:v1.0.0
```

## Image Visibility

By default, GitHub Container Registry images are **private**. To make them public:

1. Go to package settings on GitHub
2. Navigate to `https://github.com/users/<username>/packages/container/spam-arrester-agent/settings`
3. Scroll to "Danger Zone"
4. Click "Change visibility" → "Public"
5. Repeat for the bot image

## Versioning Strategy

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version (1.x.x): Breaking changes
- **MINOR** version (x.1.x): New features, backward compatible
- **PATCH** version (x.x.1): Bug fixes, backward compatible

### Examples

- `v0.1.0` - Initial alpha release (Phase 1 complete)
- `v0.2.0` - Bot orchestrator added (Phase 2 complete)
- `v0.3.0` - ML integration added (Phase 3)
- `v1.0.0` - First stable release
- `v1.1.0` - New feature (e.g., learning system)
- `v1.1.1` - Bug fix

## Rollback

If a release has issues:

```bash
# Tag previous working version as latest
git tag -f v1.0.0 <previous-commit-sha>
git push -f origin v1.0.0

# Or revert to previous image
docker pull ghcr.io/<username>/spam-arrester-agent:v0.9.0
```

## CI/CD Pipeline Details

The GitHub Actions workflow (`.github/workflows/docker-publish.yml`) performs:

1. **Test Job**: Runs linting, tests, and TypeScript builds for both components
2. **Build Agent Job**: Builds and pushes agent Docker image
3. **Build Bot Job**: Builds and pushes bot Docker image

All jobs run in parallel for faster feedback.

## Troubleshooting

### Build Failures

Check GitHub Actions logs:
1. Go to "Actions" tab
2. Click on failed workflow run
3. Expand failed job to see error details

Common issues:
- **TypeScript errors**: Fix in code, commit, and push
- **Test failures**: Fix tests, commit, and push
- **Docker build errors**: Verify Dockerfiles and dependencies
- **Permission denied**: Ensure GitHub Actions has package write permissions (should be automatic)

### Images Not Appearing

1. Verify workflow completed successfully
2. Check package permissions (Settings → Actions → General → Workflow permissions)
3. Ensure you're logged in: `echo ${{ secrets.GITHUB_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin`

## Local Testing of Workflow

You can test the Docker builds locally before pushing:

```bash
# Simulate what GitHub Actions will do
docker buildx build --platform linux/amd64 -f docker/Dockerfile -t spam-arrester-agent:local .
docker buildx build --platform linux/amd64 -f docker/Dockerfile.bot -t spam-arrester-bot:local .
```
