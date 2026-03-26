#!/bin/bash

# GitHub PR Tracker - Setup & Deployment Guide
# ==========================================

echo "🚀 GitHub PR Tracker - Cloudflare Workers Deployment"
echo "=================================================="
echo ""

# Step 1: Prerequisites Check
echo "📋 Step 1: Prerequisites Check"
echo "==============================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Visit: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js $(node --version) installed"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi
echo "✅ npm $(npm --version) installed"

# Check if Wrangler is installed or installable
echo "✅ Wrangler will be installed via npm"
echo ""

# Step 2: Dependencies
echo "📦 Step 2: Installing Dependencies"
echo "===================================="
echo ""
npm install
if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo ""

# Step 3: Build
echo "🔨 Step 3: Building TypeScript"
echo "================================"
echo ""
npm run build
if [ $? -eq 0 ]; then
    echo "✅ TypeScript compiled successfully"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi
echo ""

# Step 4: GitHub Token Setup
echo "🔐 Step 4: GitHub Token Setup"
echo "==============================="
echo ""
echo "You need a GitHub Personal Access Token to proceed."
echo ""
echo "To generate a token:"
echo "1. Visit: https://github.com/settings/tokens"
echo "2. Click 'Generate new token' > 'Generate new token (classic)'"
echo "3. Required scopes: 'public_repo' (minimum) or 'repo' (full access)"
echo "4. Copy the token"
echo ""
echo "Now run:"
echo ""
echo "  npx wrangler secret put GITHUB_TOKEN"
echo ""
echo "And paste your token when prompted."
echo ""
echo "To verify the secret was saved:"
echo "  npx wrangler secret list"
echo ""

# Step 5: Local Development
echo "🔧 Step 5: Local Development"
echo "=============================="
echo ""
echo "To test locally:"
echo ""
echo "  npx wrangler dev"
echo ""
echo "Then visit: http://localhost:8787"
echo ""

# Step 6: Deployment
echo "🚀 Step 6: Deployment"
echo "======================"
echo ""
echo "Make sure you've set up the GitHub token first (see Step 4)"
echo ""
echo "To deploy to Cloudflare:"
echo ""
echo "  npx wrangler deploy"
echo ""
echo "Your app will be live at:"
echo "  https://pr-tracker.<your-account>.workers.dev"
echo ""
echo "You can also configure a custom domain in Cloudflare Dashboard."
echo ""
