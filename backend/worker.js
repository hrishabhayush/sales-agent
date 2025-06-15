// Cloudflare Workers JavaScript version of the backend

// In-memory storage (use KV or D1 in production)
let userSessions = {};
let userTokens = {};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle CORS preflight
function handleCORS() {
  return new Response(null, {
    headers: corsHeaders,
  });
}

// Generate random string
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Base64 URL encode
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Generate PKCE parameters
function generatePKCE() {
  const codeVerifier = generateRandomString(128);
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  
  return crypto.subtle.digest('SHA-256', data).then(hash => {
    const codeChallenge = base64UrlEncode(String.fromCharCode(...new Uint8Array(hash)));
    return { codeVerifier, codeChallenge };
  });
}

// Main request handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }
    
    try {
      // Routes
      if (path === '/' && request.method === 'GET') {
        return new Response(JSON.stringify({
          message: "Sales Agent Twitter API is running",
          status: "healthy"
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (path === '/test' && request.method === 'GET') {
        return new Response(JSON.stringify({
          message: "API is accessible",
          environment_set: !!env.CLIENT_ID,
          timestamp: new Date().toISOString()
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (path === '/twitter/auth-url' && request.method === 'GET') {
        const clientId = env.CLIENT_ID;
        if (!clientId) {
          return new Response(JSON.stringify({
            error: "Twitter Client ID not configured"
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const { codeVerifier, codeChallenge } = await generatePKCE();
        const state = generateRandomString(32);
        
        // Store session data (in production, use KV storage)
        userSessions[state] = {
          codeVerifier,
          codeChallenge
        };
        
        const redirectUri = env.TWITTER_REDIRECT_URI || `${url.origin}/twitter/callback`;
        
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: 'tweet.read tweet.write users.read offline.access',
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256'
        });
        
        const authUrl = `https://twitter.com/i/oauth2/authorize?${params}`;
        
        return new Response(JSON.stringify({
          auth_url: authUrl,
          state: state
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Twitter callback
      if (path === '/twitter/callback' && request.method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        
        if (error) {
          return new Response(`Twitter authorization error: ${error}`, { status: 400 });
        }
        
        if (!state || !userSessions[state]) {
          return new Response('Invalid or expired state parameter', { status: 400 });
        }
        
        const session = userSessions[state];
        const clientId = env.CLIENT_ID;
        const clientSecret = env.CLIENT_SECRET;
        const redirectUri = env.TWITTER_REDIRECT_URI || `${url.origin}/twitter/callback`;
        
        // Exchange code for tokens
        const tokenData = new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: session.codeVerifier
        });
        
        const authHeader = btoa(`${clientId}:${clientSecret}`);
        
        const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
          method: 'POST',
          body: tokenData,
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        
        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          return new Response(`Failed to exchange code for tokens: ${errorText}`, { status: 400 });
        }
        
        const tokens = await tokenResponse.json();
        
        // Store tokens
        const userId = generateRandomString(16);
        userTokens[userId] = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          scope: tokens.scope
        };
        
        // Clean up session
        delete userSessions[state];
        
        // Redirect to frontend
        const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000';
        return Response.redirect(`${frontendUrl}?twitter_connected=true&user_id=${userId}`);
      }
      
      // Generate tweet
      if (path === '/generate-twitter-post' && request.method === 'POST') {
        const body = await request.json();
        const query = body.query;
        
        if (!query?.trim()) {
          return new Response(JSON.stringify({ error: "Query cannot be empty" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Simple tweet generation (replace with your AI logic)
        const content = `🚀 ${query}\n\n#AI #SalesAutomation #Growth`;
        
        return new Response(JSON.stringify({ content }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Post tweet
      if (path === '/post-twitter-post' && request.method === 'POST') {
        const body = await request.json();
        const content = body.content;
        const userId = body.user_id;
        
        if (!content?.trim()) {
          return new Response(JSON.stringify({ error: "Content cannot be empty" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        if (!userId || !userTokens[userId]) {
          return new Response(JSON.stringify({ error: "No valid Twitter access token found" }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const accessToken = userTokens[userId].access_token;
        
        // Post to Twitter
        const tweetResponse = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: content })
        });
        
        if (!tweetResponse.ok) {
          const errorText = await tweetResponse.text();
          return new Response(JSON.stringify({ 
            success: false, 
            message: `Failed to post tweet: ${errorText}` 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: "Tweet posted successfully"
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // 404 for unknown routes
      return new Response('Not Found', { status: 404 });
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
}; 