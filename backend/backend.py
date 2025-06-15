#!/usr/bin/env python3

import os
import sys
import json
import base64
import hashlib
import secrets
import urllib.parse
from typing import Dict, Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import uvicorn
import requests
from dotenv import load_dotenv

# Load environment variables from SalesGPT directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'SalesGPT', '.env'))

# Add the SalesGPT directory to the path so we can import the functions
sys.path.append(os.path.join(os.path.dirname(__file__), 'SalesGPT'))

try:
    from salesgpt.tools import post_twitter_post, generate_twitter_post
except ImportError as e:
    print(f"Warning: Could not import Twitter functions: {e}")
    print("Please ensure SalesGPT is properly installed and configured")
    
    # Fallback functions for testing
    def generate_twitter_post(query: str) -> str:
        return f"🚀 Generated tweet for: {query}\n\n#AI #SalesAutomation #Growth"
    
    def post_twitter_post(content: str) -> bool:
        print(f"Mock posting to Twitter: {content}")
        return True

app = FastAPI(title="Sales Agent Twitter API", version="1.0.0")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js default port
        "https://21965a8b.sales-agent-frontend-avf.pages.dev",  # Production frontend (old)
        "https://ab37d8bb.sales-agent-frontend-avf.pages.dev",  # Production frontend (new)
        "https://*.pages.dev",  # Any Cloudflare Pages domain
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory storage for demo (use database in production)
user_sessions = {}
user_tokens = {}

class GenerateTweetRequest(BaseModel):
    query: str

class PostTweetRequest(BaseModel):
    content: str
    user_id: Optional[str] = None

class GenerateTweetResponse(BaseModel):
    content: str

class PostTweetResponse(BaseModel):
    success: bool
    message: str

class OAuthUrlResponse(BaseModel):
    auth_url: str
    state: str

class TokenExchangeResponse(BaseModel):
    success: bool
    message: str
    user_id: Optional[str] = None

# OAuth 2.0 PKCE Helper Functions
def generate_code_verifier():
    """Generate a cryptographically random code verifier"""
    return base64.urlsafe_b64encode(secrets.token_bytes(96)).decode('utf-8').rstrip('=')

def generate_code_challenge(verifier):
    """Generate code challenge from verifier"""
    digest = hashlib.sha256(verifier.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')

def post_twitter_post_oauth2(content: str, access_token: str):
    """Post a tweet using OAuth 2.0 access token"""
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
    }
    
    payload = {
        "text": content
    }
    
    response = requests.post(
        "https://api.twitter.com/2/tweets",
        json=payload,
        headers=headers
    )
    
    if response.status_code != 201:
        error_message = f"Twitter API error: {response.status_code} {response.text}"
        print(error_message)
        raise Exception(error_message)
    
    print(f"Tweet posted successfully: {response.status_code}")
    return response.json()

@app.get("/")
async def root():
    return {"message": "Sales Agent Twitter API is running", "status": "healthy"}

@app.get("/test")
async def test_endpoint():
    """Test endpoint to check if API is accessible"""
    client_id = os.getenv("CLIENT_ID")
    return {
        "message": "API is accessible",
        "environment_set": bool(client_id),
        "timestamp": "2024-06-15"
    }

@app.post("/generate-twitter-post", response_model=GenerateTweetResponse)
async def generate_tweet_endpoint(request: GenerateTweetRequest):
    """
    Generate Twitter content based on a query
    """
    try:
        if not request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        # Call the actual function from SalesGPT
        generated_content = generate_twitter_post(request.query)
        
        return GenerateTweetResponse(content=generated_content)
    
    except Exception as e:
        print(f"Error generating tweet: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate tweet: {str(e)}")

@app.post("/post-twitter-post", response_model=PostTweetResponse)
async def post_tweet_endpoint(request: PostTweetRequest):
    """
    Post content to Twitter - supports both OAuth 1.0a (CLI) and OAuth 2.0 (web)
    """
    try:
        if not request.content.strip():
            raise HTTPException(status_code=400, detail="Content cannot be empty")
        
        # If user_id is provided, use OAuth 2.0 with stored tokens
        if request.user_id and request.user_id in user_tokens:
            token_data = user_tokens[request.user_id]
            access_token = token_data.get('access_token')
            
            if not access_token:
                raise HTTPException(status_code=401, detail="No valid Twitter access token found. Please reconnect your Twitter account.")
            
            # Use OAuth 2.0 posting
            result = post_twitter_post_oauth2(request.content, access_token)
            
            return PostTweetResponse(
                success=True, 
                message="Tweet posted successfully"
            )
        else:
            # Fallback to OAuth 1.0a (CLI method) - but this will fail in web context
            result = post_twitter_post(request.content)
            
            return PostTweetResponse(
                success=True, 
                message="Tweet posted successfully"
            )
    
    except Exception as e:
        print(f"Error posting tweet: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to post tweet: {str(e)}")

# New OAuth 2.0 endpoints
@app.get("/twitter/auth-url", response_model=OAuthUrlResponse)
async def get_twitter_auth_url():
    """
    Generate Twitter OAuth 2.0 authorization URL with PKCE
    """
    try:
        client_id = os.getenv("CLIENT_ID")
        if not client_id:
            raise HTTPException(status_code=500, detail="Twitter Client ID not configured")
        
        # Generate PKCE parameters
        code_verifier = generate_code_verifier()
        code_challenge = generate_code_challenge(code_verifier)
        state = secrets.token_urlsafe(32)
        
        # Store session data
        user_sessions[state] = {
            'code_verifier': code_verifier,
            'code_challenge': code_challenge
        }
        
        # Build authorization URL
        redirect_uri = os.getenv("TWITTER_REDIRECT_URI", "http://localhost:8000/twitter/callback")
        
        params = {
            'response_type': 'code',
            'client_id': client_id,
            'redirect_uri': redirect_uri,
            'scope': 'tweet.read tweet.write users.read offline.access',
            'state': state,
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256'
        }
        
        auth_url = f"https://twitter.com/i/oauth2/authorize?{urllib.parse.urlencode(params)}"
        
        return OAuthUrlResponse(auth_url=auth_url, state=state)
        
    except Exception as e:
        print(f"Error generating auth URL: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate authorization URL: {str(e)}")

@app.get("/twitter/callback")
async def twitter_callback(
    code: str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(None)
):
    """
    Handle Twitter OAuth 2.0 callback
    """
    try:
        if error:
            raise HTTPException(status_code=400, detail=f"Twitter authorization error: {error}")
        
        # Validate state and retrieve session
        if state not in user_sessions:
            raise HTTPException(status_code=400, detail="Invalid or expired state parameter")
        
        session_data = user_sessions[state]
        code_verifier = session_data['code_verifier']
        
        # Exchange code for tokens
        client_id = os.getenv("CLIENT_ID")
        client_secret = os.getenv("CLIENT_SECRET")
        redirect_uri = os.getenv("TWITTER_REDIRECT_URI", "http://localhost:8000/twitter/callback")
        
        token_data = {
            'code': code,
            'grant_type': 'authorization_code',
            'client_id': client_id,
            'redirect_uri': redirect_uri,
            'code_verifier': code_verifier
        }
        
        # Add client secret if available (for confidential clients)
        if client_secret:
            auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
            headers = {
                'Authorization': f'Basic {auth_header}',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        else:
            headers = {'Content-Type': 'application/x-www-form-urlencoded'}
            token_data['client_secret'] = client_secret
        
        response = requests.post(
            "https://api.twitter.com/2/oauth2/token",
            data=token_data,
            headers=headers
        )
        
        if response.status_code != 200:
            error_detail = response.text
            print(f"Token exchange failed: {response.status_code} {error_detail}")
            raise HTTPException(status_code=400, detail=f"Failed to exchange code for tokens: {error_detail}")
        
        tokens = response.json()
        
        # Generate user ID and store tokens
        user_id = secrets.token_urlsafe(16)
        user_tokens[user_id] = {
            'access_token': tokens.get('access_token'),
            'refresh_token': tokens.get('refresh_token'),
            'expires_in': tokens.get('expires_in'),
            'scope': tokens.get('scope')
        }
        
        # Clean up session
        del user_sessions[state]
        
        # Redirect to frontend with success
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        return RedirectResponse(url=f"{frontend_url}?twitter_connected=true&user_id={user_id}")
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in Twitter callback: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Authorization failed: {str(e)}")

@app.get("/twitter/status/{user_id}")
async def get_twitter_status(user_id: str):
    """
    Check if user has valid Twitter connection
    """
    if user_id in user_tokens:
        return {"connected": True, "user_id": user_id}
    else:
        return {"connected": False}

@app.delete("/twitter/disconnect/{user_id}")
async def disconnect_twitter(user_id: str):
    """
    Disconnect Twitter account (remove stored tokens)
    """
    if user_id in user_tokens:
        del user_tokens[user_id]
        return {"success": True, "message": "Twitter account disconnected"}
    else:
        raise HTTPException(status_code=404, detail="User not found")

@app.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {"status": "healthy", "service": "Sales Agent Twitter API"}

if __name__ == "__main__":
    print("Starting Sales Agent Twitter API server...")
    print("API Documentation available at: http://localhost:8000/docs")
    print("Frontend should connect to: http://localhost:8000")
    
    uvicorn.run(
        "backend:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    ) 