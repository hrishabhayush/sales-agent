// Cloudflare Workers JavaScript version of the backend with D1 Database
// 
// This implementation follows the patterns and function signatures from 
// sales-agent/SalesGPT/salesgpt/tools.py, porting the key functions to JavaScript:
// - get_twitter_content_from_query() -> getTwitterContentFromQuery()
// - generate_twitter_post() -> generateTwitterPost() 
// - post_twitter_post() -> postToTwitter()
//
// The functions maintain the same separation of concerns and error handling
// patterns as the original Python tools.

// Import database operations
import { userOps, sessionOps, tokenOps, conversationOps, preferencesOps } from './database.js';

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

// Get user info from Twitter API
async function getTwitterUserInfo(accessToken) {
  const response = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,username', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to get user info from Twitter');
  }
  
  return await response.json();
}

// Get user info from Linkedin API
async function getLinkedinUserInfo(accessToken) {
  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to get user info from Linkedin');
  }
  
  return await response.json();
}

// === TOOLS.PY INSPIRED FUNCTIONS ===

// Get Twitter content and hashtags from query (inspired by get_twitter_content_from_query)
async function getTwitterContentFromQuery(query, openaiApiKey) {
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `Given the query: "${query}", analyze the content and extract the necessary information to generate a twitter post.
The information needed includes the content of the twitter post and the hashtags.
Return a dictionary in JSON format where the keys are 'content' and 'hashtags', and the values are the corresponding pieces of information extracted from the query.
For example, if the query was about a new product launch, the output should look like this:
{
    "content": "We are excited to announce the launch of our new product!",
    "hashtags": ["#NewProductLaunch", "#ProductLaunch", "#NewProduct"]
}
Now, based on the provided query, return the structured information as described. For all the hashtags, make sure to include the # symbol in the beginning for example: #word.
Return a valid directly parsable json, dont return in it within a code snippet or add any kind of explanation!!`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that generates Twitter content.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  
  if (!content) {
    throw new Error('No content generated from OpenAI');
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error('Failed to parse OpenAI response as JSON');
  }
}

// Generate formatted Twitter post (inspired by generate_twitter_post)
async function generateTwitterPost(query, openaiApiKey) {
  try {
    // Get the content and hashtags from the query
    const twitterContent = await getTwitterContentFromQuery(query, openaiApiKey);
    
    // Format the content with hashtags
    const content = twitterContent.content || '';
    const hashtags = twitterContent.hashtags || [];
    
    // Combine content and hashtags
    let formattedPost = content;
    if (hashtags.length > 0) {
      const hashtagsStr = hashtags.join(' ');
      formattedPost = `${content} ${hashtagsStr}`;
    }
    
    return formattedPost;
    
  } catch (error) {
    throw new Error(`Failed to generate twitter post: ${error.message}`);
  }
}

// Fallback content generation (when OpenAI is not available)
function generateFallbackTwitterContent(query, tone, hashtags) {
  const toneDescriptions = {
    professional: 'Explore how',
    casual: 'Hey! Let\'s talk about',
    enthusiastic: '🔥 EXCITED TO SHARE:'
  };

  const toneStart = toneDescriptions[tone] || 'Explore how';
  const hashtagsText = hashtags.length > 0 ? hashtags.map(tag => `#${tag}`).join(' ') : '#AI #SalesAutomation #Growth';

  let content = `${toneStart} ${query}`;
  
  if (tone === 'enthusiastic') {
    content += ' 🚀✨';
  } else if (tone === 'casual') {
    content += ' 💪';
  }
  
  return `${content}\n\n${hashtagsText}`;
}

// Post to Twitter (inspired by post_twitter_post but using OAuth2)
async function postToTwitter(content, accessToken) {
  const response = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: content })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to post tweet: ${errorText}`);
  }
  
  return await response.json();
}

// Post to Linkedin (inspired by post_linkedin_post but using OAuth2)
async function postToLinkedin(content, accessToken) {
  const response = await fetch('https://api.linkedin.com/v2/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: content })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to post linkedin post: ${errorText}`);
  }
  
  return await response.json();
}


// === END TOOLS.PY INSPIRED FUNCTIONS ===

// Main request handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.DB; // D1 database binding
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }
    
    try {
      // Health check
      if (path === '/' && request.method === 'GET') {
        return new Response(JSON.stringify({
          message: "SalesGPT Twitter API is running",
          status: "healthy",
          database: "connected"
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Test endpoint
      if (path === '/test' && request.method === 'GET') {
        // Clean up expired sessions
        await sessionOps.cleanupExpiredSessions(db);
        
        return new Response(JSON.stringify({
          message: "API is accessible",
          environment_set: !!env.CLIENT_ID,
          database_ready: !!db,
          timestamp: new Date().toISOString()
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Get Twitter auth URL
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
        
        // Store session data in database
        const sessionId = await sessionOps.createSession(db, {
          code_verifier: codeVerifier,
          code_challenge: codeChallenge
        });
        
        const redirectUri = env.TWITTER_REDIRECT_URI || `${url.origin}/twitter/callback`;
        
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: 'tweet.read tweet.write users.read offline.access',
          state: sessionId,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256'
        });
        
        const authUrl = `https://twitter.com/i/oauth2/authorize?${params}`;
        
        return new Response(JSON.stringify({
          auth_url: authUrl,
          state: sessionId
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
        
        if (!state) {
          return new Response('Missing state parameter', { status: 400 });
        }
        
        // Get session from database
        const session = await sessionOps.getSession(db, state);
        if (!session) {
          return new Response('Invalid or expired state parameter', { status: 400 });
        }
        
        const clientId = env.CLIENT_ID;
        const clientSecret = env.CLIENT_SECRET;
        const redirectUri = env.TWITTER_REDIRECT_URI || `${url.origin}/twitter/callback`;
        
        // Exchange code for tokens
        const tokenData = new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: session.code_verifier
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
        
        // Get user info from Twitter
        const twitterUserInfo = await getTwitterUserInfo(tokens.access_token);
        const twitterUser = twitterUserInfo.data;
        
        // Check if user already exists
        let user = await userOps.getUserByTwitterUsername(db, twitterUser.username);
        
        if (!user) {
          // Create new user
          const userId = await userOps.createUser(db, {
            name: twitterUser.name,
            twitter_username: twitterUser.username,
            profile_image_url: twitterUser.profile_image_url
          });
          user = { id: userId };
        }
        
        // Store tokens
        await tokenOps.storeTokens(db, user.id, tokens);
        
        // Clean up session
        await sessionOps.deleteSession(db, state);
        
        // Redirect to frontend
        const frontendUrl = env.FRONTEND_URL || 'https://6ea36232.sales-agent-frontend-avf.pages.dev/';
        return Response.redirect(`${frontendUrl}?twitter_connected=true&user_id=${user.id}`);
      }
      
      // Get user profile
      if (path === '/user/profile' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id');
        
        if (!userId) {
          return new Response(JSON.stringify({ error: "User ID required" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const user = await userOps.getUserById(db, userId);
        const tokens = await tokenOps.getTokens(db, userId);
        const preferences = await preferencesOps.getPreferences(db, userId);
        
        if (!user) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        return new Response(JSON.stringify({
          user: {
            id: user.id,
            name: user.name,
            twitter_username: user.twitter_username,
            profile_image_url: user.profile_image_url,
            created_at: user.created_at
          },
          twitter_connected: !!tokens,
          preferences: preferences || {
            auto_post: false,
            content_tone: 'professional',
            hashtags: []
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Update user preferences
      if (path === '/user/preferences' && request.method === 'PUT') {
        const body = await request.json();
        const userId = body.user_id;
        const preferences = body.preferences;
        
        if (!userId) {
          return new Response(JSON.stringify({ error: "User ID required" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const success = await preferencesOps.setPreferences(db, userId, preferences);
        
        return new Response(JSON.stringify({ 
          success,
          message: success ? "Preferences updated" : "Failed to update preferences"
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Get user's conversation history
      if (path === '/user/conversations' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id');
        const limit = parseInt(url.searchParams.get('limit')) || 10;
        
        if (!userId) {
          return new Response(JSON.stringify({ error: "User ID required" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const conversations = await conversationOps.getUserConversations(db, userId, limit);
        
        return new Response(JSON.stringify({ conversations }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Generate tweet
      if (path === '/generate-twitter-post' && request.method === 'POST') {
        const body = await request.json();
        const query = body.query;
        const userId = body.user_id;
        
        if (!query?.trim()) {
          return new Response(JSON.stringify({ error: "Query cannot be empty" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        if (!userId) {
          return new Response(JSON.stringify({ error: "User ID required" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Get user preferences for personalized content
        const preferences = await preferencesOps.getPreferences(db, userId);
        const tone = preferences?.content_tone || 'professional';
        const hashtags = preferences?.hashtags || [];
        
        try {
          // Generate content using OpenAI API
          const content = await generateTwitterPost(query, env.OPENAI_API_KEY);
          
          // Save conversation to database
          const conversationId = await conversationOps.saveConversation(db, userId, query, content);
          
          return new Response(JSON.stringify({ 
            content,
            conversation_id: conversationId
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (error) {
          // Fallback to basic generation if OpenAI fails
          let content = generateFallbackTwitterContent(query, tone, hashtags);
          
          // Save conversation to database
          const conversationId = await conversationOps.saveConversation(db, userId, query, content);
          
          return new Response(JSON.stringify({ 
            content,
            conversation_id: conversationId,
            warning: "Using fallback generation due to AI service unavailability"
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      // Post tweet
      if (path === '/post-twitter-post' && request.method === 'POST') {
        const body = await request.json();
        const content = body.content;
        const userId = body.user_id;
        const conversationId = body.conversation_id;
        
        if (!content?.trim()) {
          return new Response(JSON.stringify({ error: "Content cannot be empty" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        if (!userId) {
          return new Response(JSON.stringify({ error: "User ID required" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Get user's Twitter tokens
        const tokenData = await tokenOps.getTokens(db, userId);
        if (!tokenData) {
          return new Response(JSON.stringify({ error: "No valid Twitter access token found" }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const accessToken = tokenData.access_token;
        
        try {
          // Post to Twitter using tools.py inspired function
          const tweetData = await postToTwitter(content, accessToken);
          
          // Mark conversation as posted if conversation_id provided
          if (conversationId && tweetData.data?.id) {
            await conversationOps.markAsPosted(db, conversationId, tweetData.data.id);
          }
          
          return new Response(JSON.stringify({
            success: true,
            message: "Tweet posted successfully",
            tweet_id: tweetData.data?.id
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (error) {
          return new Response(JSON.stringify({ 
            success: false, 
            message: `Failed to post tweet: ${error.message}` 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      // Disconnect Twitter account
      if (path === '/twitter/disconnect' && request.method === 'POST') {
        const body = await request.json();
        const userId = body.user_id;
        
        if (!userId) {
          return new Response(JSON.stringify({ error: "User ID required" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const success = await tokenOps.deleteTokens(db, userId);
        
        return new Response(JSON.stringify({
          success,
          message: success ? "Twitter account disconnected" : "Failed to disconnect"
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