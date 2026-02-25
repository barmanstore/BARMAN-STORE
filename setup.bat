#!/bin/bash

# BARMAN STORE - Quick Start Script

echo "🛍️  BARMAN STORE - Setup Script"
echo "================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "✅ Dependencies installed successfully!"
echo ""
echo "🚀 Starting BARMAN STORE..."
echo ""
echo "📍 Frontend will be available at: http://localhost:3000"
echo "📍 Backend API will be available at: http://localhost:5000"
echo ""
echo "To start the application:"
echo "1. Terminal 1: npm run server   (starts backend)"
echo "2. Terminal 2: npm run dev      (starts frontend)"
echo ""
echo "Or run both simultaneously:"
echo "npm run server & npm run dev"
echo ""
