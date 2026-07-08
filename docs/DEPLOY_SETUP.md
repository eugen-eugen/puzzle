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

### Create Fine-Grained Personal Access Token (Recommended)

GitHub's built-in `GITHUB_TOKEN` only works for the repository where the workflow runs. For cross-repository deployment, you need a Personal Access Token scoped to the target repository.

**Why fine-grained tokens are better:**
- ✅ Scoped to only the `pzl` repository
- ✅ More secure than classic tokens
- ✅ Can set expiration (recommended: 1 year)

**Steps:**

1. Go to GitHub Settings → Developer settings → [Personal access tokens → Fine-grained tokens](https://github.com/settings/tokens?type=beta)

2. Click "Generate new token"

3. Configure the token:
   - **Token name**: `Deploy to pzl repository`
   - **Expiration**: 1 year (or custom)
   - **Repository access**: Select "Only select repositories"
     - Choose: `eugen-eugen/pzl`
   - **Permissions**:
     - Repository permissions → Contents: **Read and write**

4. Click "Generate token" and copy it

5. Add to puzzle repository secrets:
   - Go to https://github.com/eugen-eugen/puzzle/settings/secrets/actions
   - Click "New repository secret"
   - Name: `PZL_DEPLOY_TOKEN`
   - Value: Paste the token
   - Click "Add secret"

### Create Target Repository

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

## Local Development

Start the Vite development server with hot module replacement:

```bash
cd client
npm run dev
```

The app will be available at http://localhost:3000/puzzle/. Any changes to source files are immediately reflected in the browser without manual reload.

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

### Deployment to pzl fails with "403 Permission denied"
- Verify `PZL_DEPLOY_TOKEN` secret is set in the puzzle repository
- Check the token hasn't expired (regenerate if needed)
- Ensure the token has "Contents: Read and write" permission for the pzl repository
- Make sure you selected the `eugen-eugen/pzl` repository when creating the fine-grained token

### Deployment to pzl fails with "authentication failed"
- The token might be invalid or expired
- Regenerate the token with correct permissions and update the secret

### Build fails with "Could not resolve entry module"
- Check that client/vite.config.js syntax is correct
- Ensure all plugins are properly closed with matching braces

### Restricted build includes unwanted files
- Verify BUILD_MODE=restricted is set in the build command
- Check client/vite.config.js plugins for proper conditional logic
