#!/bin/bash

# Development script - runs MCP server and web dev server concurrently

set -e

cd "$(dirname "$0")/../.."

echo "🚀 Starting Tableau Pulse Apps SDK development servers..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install it first:"
    echo "   npm install -g pnpm"
    exit 1
fi

# Check if .env file exists
if [ ! -f "ops/dev.env" ]; then
    echo "⚠️  Warning: ops/dev.env not found. Copy ops/dev.env.example and configure it."
    echo "   cp ops/dev.env.example ops/dev.env"
    exit 1
fi

# Run both dev servers in parallel
echo ""
echo "📦 MCP server will run on http://localhost:3000"
echo "🌐 Web dev server will run on http://localhost:5173"
echo ""
echo "In another terminal, run ngrok:"
echo "   ngrok http 3000 --config ops/ngrok.yml"
echo ""

# Use pnpm to run both workspaces in watch mode
pnpm run mcp:dev & pnpm run web:dev

# Wait for both processes
wait
