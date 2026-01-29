# Deployment Guide: BTC Miner Valuation Terminal v9

## Overview

This guide covers deploying v9 of the BTC Miner Valuation Terminal to your GitHub repository and Render website.

---

## Step 1: Prepare Your Local Files

First, download or copy the v9 files to your local machine:

```
miner-app-v9/
├── public/
│   ├── index.html      # Main UI
│   ├── app.js          # Application logic
│   └── seed-data.json  # 3-tier hierarchical data
├── server.js           # Express server
├── package.json        # Node.js dependencies
└── DEPLOYMENT.md       # This file
```

---

## Step 2: Update Your GitHub Repository

### Option A: Replace existing files (Recommended)

```bash
# Navigate to your local repo
cd /path/to/your/miner-app-repo

# Create a backup branch (optional but recommended)
git checkout -b backup-v8
git push origin backup-v8
git checkout main

# Remove old files (be careful!)
rm -rf public/*
# OR if you have other files you want to keep, just remove specific files:
# rm public/app.js public/index.html public/seed-data.json

# Copy new v9 files
cp -r /path/to/miner-app-v9/* .

# Stage all changes
git add .

# Commit with descriptive message
git commit -m "Upgrade to v9: 3-tier hierarchical data model

- New data structure: Companies → Sites → Capacity Phases → Tenancies
- Added Data Quality tab with 7 validation tests (T1-T7)
- Hierarchical tree view for projects
- Full provenance tracking per entity
- Conversion tracking for BTC→HPC transitions
- 109 sites, 137 capacity phases, 187 tenancies

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to GitHub
git push origin main
```

### Option B: Create a new branch first

```bash
cd /path/to/your/miner-app-repo

# Create v9 branch
git checkout -b v9-upgrade

# Copy new files
cp -r /path/to/miner-app-v9/* .

# Commit
git add .
git commit -m "Upgrade to v9: 3-tier hierarchical data model"

# Push branch
git push origin v9-upgrade

# Then create a Pull Request on GitHub to merge into main
```

---

## Step 3: Deploy to Render

### If Render is already connected to your GitHub repo:

1. **Automatic Deployment**: If you have auto-deploy enabled, Render will automatically detect the push to `main` and redeploy.

2. **Manual Deployment**:
   - Go to your Render dashboard
   - Find your web service
   - Click "Manual Deploy" → "Deploy latest commit"

### If setting up Render for the first time:

1. **Create New Web Service**:
   - Go to [render.com](https://render.com) and sign in
   - Click "New" → "Web Service"
   - Connect your GitHub repository

2. **Configure the Service**:
   ```
   Name: btc-miner-terminal (or your preferred name)
   Environment: Node
   Region: Choose closest to your users
   Branch: main
   Build Command: npm install
   Start Command: npm start
   ```

3. **Environment Variables** (optional):
   - `PORT` will be set automatically by Render

4. **Click "Create Web Service"**

---

## Step 4: Verify Deployment

After deployment completes:

1. **Visit your Render URL** (e.g., `https://your-app.onrender.com`)

2. **Check all tabs work**:
   - Dashboard: Should show 17 companies with valuations
   - Projects: Should show hierarchical tree view
   - Map: Should show site locations
   - Data Quality: Should run tests and show results

3. **Test the Data Quality tab**:
   - Click "Run Tests"
   - Review any P0/P1/P2 issues
   - Try ignoring an issue
   - Export a report

---

## File Structure Explained

### `/public/seed-data.json` (New v2 Format)

```json
{
  "version": "2.0",
  "companies": [...],      // 17 companies with balance sheet data
  "sites": [...],          // 109 physical locations
  "capacity_phases": [...], // 137 building/expansion phases
  "tenancies": [...]       // 187 lease/use agreements (including HPC options)
}
```

### Key Changes from v8:

| v8 | v9 |
|----|-----|
| Flat project list | Hierarchical: Company → Site → Phase → Tenancy |
| Single `projects[]` array | Four arrays: `companies[]`, `sites[]`, `capacity_phases[]`, `tenancies[]` |
| No provenance tracking | `source: {url, type, published_at, evidence}` per entity |
| No conversion tracking | `conversion: {converts_from_tenancy_id, probability}` |
| No data quality checks | Data Quality tab with T1-T7 validation tests |

---

## Troubleshooting

### "Cannot find module 'express'"
```bash
npm install
```

### Render shows "Build failed"
- Check that `package.json` exists in the root
- Verify Node version is 18+ (check `engines` in package.json)

### Data not loading
- Open browser DevTools → Console
- Check for any fetch errors
- Verify `seed-data.json` is in `/public/`

### Tests show many P2 issues
- P2 (Provenance) issues are expected - the migration script doesn't have all source URLs
- You can ignore these or gradually add source URLs to the data

---

## Local Development

To run locally:

```bash
cd miner-app-v9
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

---

## Data Updates

To update the data:

1. Edit `public/seed-data.json` directly, or
2. Modify `seed-data.json` in v8 format and re-run `migrate-to-v2.js`:

```bash
cd miner-app-v8
# Edit seed-data.json with your changes
node migrate-to-v2.js
# Copy the new seed-data-v2.json to v9
cp seed-data-v2.json ../miner-app-v9/public/seed-data.json
```

---

## Questions?

The Data Quality tab will help identify issues with your data. Start by:
1. Running all tests
2. Fixing P0 (Critical) issues first
3. Reviewing P1 (Review) issues
4. Ignoring or fixing P2 (Hygiene) issues as time permits
