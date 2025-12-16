# Deployment Setup

This repository uses GitHub Actions to automatically build and deploy two versions of the puzzle application:

## Deployment Targets

1. **Standard Build** → `release` branch in this repository (eugen-eugen/puzzle)
   - Full-featured PWA with all controls
   - Includes service worker, manifest.json, and local pictures
   - Deployed at: https://eugen-eugen.github.io/puzzle/

2. **Restricted Build** → `main` branch in [eugen-eugen/pzl](https://github.com/eugen-eugen/pzl)
   - Minimal version without PWA features and control bar
   - Only remote pictures included
   - Deployed at: https://eugen-eugen.github.io/pzl/

## Required Setup

### 1. Create PZL_DEPLOY_TOKEN Secret

To deploy to the `eugen-eugen/pzl` repository, you need to create a GitHub Personal Access Token:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name: "Deploy to pzl repository"
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
5. Generate token and copy it

### 2. Add Secret to This Repository

1. Go to this repository's Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `PZL_DEPLOY_TOKEN`
4. Value: Paste the token you copied
5. Click "Add secret"

### 3. Create Target Repository

Ensure the `eugen-eugen/pzl` repository exists:

```bash
# Create repository on GitHub first, then:
git clone https://github.com/eugen-eugen/pzl.git
cd pzl
echo "# Puzzle Lab - Restricted Mode" > README.md
git add README.md
git commit -m "Initial commit"
git push -u origin main
```

## Workflow Overview

The workflow runs on every push to `main` branch:

```
┌─────────┐
│  Tests  │
└────┬────┘
     │
     ├─────────────────┬─────────────────┐
     │                 │                 │
┌────▼────────┐  ┌────▼────────────┐  ┌─▼──────────────┐
│   Standard  │  │   Restricted    │  │                │
│    Build    │  │      Build      │  │  (Parallel)    │
└────┬────────┘  └────┬────────────┘  └────────────────┘
     │                │
     │                │
┌────▼────────┐  ┌────▼────────────┐
│   Deploy    │  │     Deploy      │
│  to release │  │  to pzl repo    │
│   branch    │  │   main branch   │
└─────────────┘  └─────────────────┘
```

## Build Differences

| Feature | Standard Build | Restricted Build |
|---------|---------------|------------------|
| Control Bar | ✅ Visible | ❌ Hidden |
| Image Upload | ✅ Yes | ❌ No (hidden) |
| PWA Features | ✅ Yes | ❌ No |
| Service Worker | ✅ Yes | ❌ No |
| Manifest.json | ✅ Yes | ❌ No |
| Local Pictures | ✅ Included | ❌ Excluded |
| Remote Pictures | ✅ Included | ✅ Included |
| Base Path | `/puzzle/` | `/pzl/` |

## Triggering Deployments

Deployments happen automatically when you push to `main`:

```bash
git add .
git commit -m "feat: add new feature"
git push origin main
```

Both builds will run in parallel after tests pass.

## Manual Deployment

To manually trigger a deployment without pushing:

1. Go to Actions tab in GitHub
2. Select "Build and Deploy to Release Branch" workflow
3. Click "Run workflow"
4. Select `main` branch
5. Click "Run workflow"

## Troubleshooting

### Deployment to pzl fails with "authentication failed"
- Check that `PZL_DEPLOY_TOKEN` secret is set correctly
- Verify the token has `repo` scope
- Ensure the token hasn't expired

### Build fails with "Could not resolve entry module"
- Check that vite.config.js syntax is correct
- Ensure all plugins are properly closed with matching braces

### Restricted build includes unwanted files
- Verify BUILD_MODE=restricted is set in the build command
- Check vite.config.js plugins for proper conditional logic
