#!/bin/bash

echo "========================================"
echo "   Bank Inquired API - Installation"
echo "========================================"
echo

echo "📦 Installing dependencies..."
npm install

echo
echo "📁 Creating logs directory..."
mkdir -p logs

echo
echo "✅ Installation completed!"
echo
echo "🚀 To start the application:"
echo "   Development: npm run dev"
echo "   Production: npm start"
echo "   With PM2: npm run pm2:start"
echo
echo "🧪 To run tests:"
echo "   npm test"
echo
echo "📖 For more information, see README.md"
echo 