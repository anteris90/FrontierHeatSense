#!/bin/bash

# EVE Frontier HeatSense v8.0 - Quick Deploy Script
# Usage: ./deploy_v8.sh

set -e  # Exit on error

echo "🚀 EVE Frontier HeatSense - Deploy"
echo "========================================"
echo ""

# Get repo path
REPO_PATH="$HOME/Documents/Projects/evef-heatsense/FrontierHeatSense"

# Check if repo exists
if [ ! -d "$REPO_PATH" ]; then
    echo "❌ Error: Repository not found at $REPO_PATH"
    echo "Please update REPO_PATH in this script"
    exit 1
fi

cd "$REPO_PATH"

echo "📂 Working directory: $REPO_PATH"
echo ""

# Check if we're in a git repo
if [ ! -d ".git" ]; then
    echo "❌ Error: Not a git repository"
    exit 1
fi

# Check git status
echo "📊 Current git status:"
git status --short
echo ""

# Prompt for confirmation
read -p "🤔 Deploy to GitHub Pages? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deploy cancelled"
    exit 0
fi

echo ""
echo "🔄 Deploying..."
echo ""

# Add index.html
git add index.html
git add README.md
git add deploy.sh
git add dangerous-systems.html

# Commit
git commit -m "Update"

# Push
git push origin main

echo ""
echo "✅ Deployed successfully!"
echo ""
echo "🌐 Your site will be live in 1-2 minutes at:"
echo "   https://anteris90.github.io/FrontierHeatSense/"
echo ""

