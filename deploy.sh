#!/bin/bash
echo "🚀 Deploying Sales Agent to Cloudflare..."

# Deploy backend first
echo "📦 Deploying backend..."
cd backend
npx wrangler publish
cd ..

# Deploy frontend
echo "🌐 Deploying frontend..."
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=sales-agent-frontend
cd ..

echo "✅ Deployment complete!"
echo "Remember to set environment variables in Cloudflare dashboard:"
echo "- CLIENT_ID (Twitter Client ID)"
echo "- CLIENT_SECRET (Twitter Client Secret)"
echo "- TWITTER_REDIRECT_URI"
echo "- NEXT_PUBLIC_API_URL (Backend URL)" 