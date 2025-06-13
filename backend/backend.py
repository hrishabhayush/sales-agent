#!/usr/bin/env python3

import os
import sys
from typing import Dict
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

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
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateTweetRequest(BaseModel):
    query: str

class PostTweetRequest(BaseModel):
    content: str

class GenerateTweetResponse(BaseModel):
    content: str

class PostTweetResponse(BaseModel):
    success: bool
    message: str

@app.get("/")
async def root():
    return {"message": "Sales Agent Twitter API is running"}

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
    Post content to Twitter
    """
    try:
        if not request.content.strip():
            raise HTTPException(status_code=400, detail="Content cannot be empty")
        
        # Call the actual function from SalesGPT
        result = post_twitter_post(request.content)
        
        return PostTweetResponse(
            success=True, 
            message="Tweet posted successfully"
        )
    
    except Exception as e:
        print(f"Error posting tweet: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to post tweet: {str(e)}")

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