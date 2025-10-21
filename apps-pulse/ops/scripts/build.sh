#!/bin/bash

# Build script - builds web bundle, then MCP server with inlined UI

set -e

cd "$(dirname "$0")/../.."

echo "🔨 Building Tableau Pulse Apps SDK..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install it first:"
    echo "   npm install -g pnpm"
    exit 1
fi

# Build web widget first
echo ""
echo "📦 Building React widget..."
pnpm run web:build

# Build MCP server (includes bundling UI template)
echo ""
echo "🔧 Building MCP server..."
pnpm run mcp:build

echo ""
echo "✅ Build complete!"
echo ""
echo "To start production server:"
echo "   cd mcp && pnpm start"
