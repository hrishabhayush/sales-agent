"use client"

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

type Mode = 'select' | 'generate-view' | 'generate-approve' | 'direct-post'

export default function Main() {
    const [mode, setMode] = useState<Mode>('select')
    const [utmLink, setUtmLink] = useState('')
    const [query, setQuery] = useState('')
    const [tweetText, setTweetText] = useState('')
    const [generatedContent, setGeneratedContent] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [status, setStatus] = useState('')
    
    // New OAuth 2.0 state
    const [isTwitterConnected, setIsTwitterConnected] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)
    const [isConnecting, setIsConnecting] = useState(false)

    // Check for OAuth callback on component mount
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search)
        const twitterConnected = urlParams.get('twitter_connected')
        const userIdParam = urlParams.get('user_id')
        
        if (twitterConnected === 'true' && userIdParam) {
            setIsTwitterConnected(true)
            setUserId(userIdParam)
            setStatus('Twitter connected successfully!')
            
            // Store user ID in localStorage for persistence
            localStorage.setItem('twitter_user_id', userIdParam)
            
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname)
        } else {
            // Check if user was previously connected
            const storedUserId = localStorage.getItem('twitter_user_id')
            if (storedUserId) {
                checkTwitterStatus(storedUserId)
            }
        }
    }, [])

    // Check if stored user ID is still valid
    const checkTwitterStatus = async (userIdToCheck: string) => {
        try {
            const response = await fetch(`/api/twitter-status/${userIdToCheck}`)
            const data = await response.json()
            
            if (data.connected) {
                setIsTwitterConnected(true)
                setUserId(userIdToCheck)
            } else {
                // Remove invalid user ID
                localStorage.removeItem('twitter_user_id')
                setIsTwitterConnected(false)
                setUserId(null)
            }
        } catch (err) {
            console.error('Error checking Twitter status:', err)
            localStorage.removeItem('twitter_user_id')
            setIsTwitterConnected(false)
            setUserId(null)
        }
    }

    // Connect to Twitter using OAuth 2.0
    const connectTwitter = async () => {
        setIsConnecting(true)
        try {
            const response = await fetch('/api/twitter-auth-url')
            if (!response.ok) {
                throw new Error('Failed to get authorization URL')
            }
            
            const data = await response.json()
            
            // Redirect to Twitter authorization
            window.location.href = data.auth_url
            
        } catch (err) {
            console.error('Error connecting to Twitter:', err)
            setStatus('Error connecting to Twitter. Please try again.')
            setIsConnecting(false)
        }
    }

    // Disconnect Twitter
    const disconnectTwitter = async () => {
        if (!userId) return
        
        try {
            const response = await fetch(`/api/twitter-disconnect/${userId}`, {
                method: 'DELETE'
            })
            
            if (response.ok) {
                setIsTwitterConnected(false)
                setUserId(null)
                localStorage.removeItem('twitter_user_id')
                setStatus('Twitter disconnected successfully')
            }
        } catch (err) {
            console.error('Error disconnecting Twitter:', err)
            setStatus('Error disconnecting Twitter')
        }
    }

    // API calls to backend (updated to include user_id)
    const generateTwitterPost = async (userQuery: string) => {
        setIsLoading(true)
        try {
            const response = await fetch('/api/generate-tweet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: userQuery }),
            })

            if (!response.ok) {
                throw new Error('Failed to generate content')
            }

            const data = await response.json()
            return data.content
        } catch (error) {
            throw new Error('Failed to generate content')
        } finally {
            setIsLoading(false)
        }
    }

    const postToTwitter = async (content: string) => {
        setIsLoading(true)
        try {
            const payload: { content: string; user_id?: string } = { content }
            
            // Include user_id if connected via OAuth 2.0
            if (userId) {
                payload.user_id = userId
            }
            
            const response = await fetch('/api/post-tweet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            })

            if (!response.ok) {
                throw new Error('Failed to post to Twitter')
            }

            const data = await response.json()
            return data.success
        } catch (err) {
            throw new Error('Failed to post to Twitter')
        } finally {
            setIsLoading(false)
        }
    }

    const handleModeSelect = (selectedMode: Mode) => {
        setMode(selectedMode)
        setQuery('')
        setTweetText('')
        setGeneratedContent('')
        setStatus('')
    }

    const handleGenerateContent = async () => {
        if (!query.trim()) {
            setStatus('Please enter a query')
            return
        }
        if (!utmLink.trim()) {
            setStatus('Please enter a UTM link')
            return
        }

        try {
            const generated = await generateTwitterPost(query)
            const contentWithLink = `${generated}\n${utmLink}`
            setGeneratedContent(contentWithLink)
            setStatus('Content generated successfully!')
        } catch (error) {
            setStatus('Error generating content')
        }
    }

    const handlePostContent = async (content: string) => {
        if (!isTwitterConnected) {
            setStatus('Please connect your Twitter account first')
            return
        }
        
        try {
            await postToTwitter(content)
            setStatus('Tweet posted successfully!')
            // Reset form after successful post
            setTimeout(() => {
                setMode('select')
                setQuery('')
                setTweetText('')
                setGeneratedContent('')
                setUtmLink('')
                setStatus('')
            }, 2000)
        } catch (error) {
            setStatus('Error posting tweet')
        }
    }

    const handleDirectPost = async () => {
        if (!tweetText.trim()) {
            setStatus('Please enter tweet content')
            return
        }
        if (!utmLink.trim()) {
            setStatus('Please enter a UTM link')
            return
        }

        const contentWithLink = `${tweetText}\n${utmLink}`
        await handlePostContent(contentWithLink)
    }

    // Mode Selection Screen
    if (mode === 'select') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
                    <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
                        Twitter Content Manager
                    </h1>
                    
                    {/* Twitter Connection Status */}
                    <div className="mb-6 p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium">Twitter Account</h3>
                            <div className={`h-3 w-3 rounded-full ${isTwitterConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        </div>
                        
                        {isTwitterConnected ? (
                            <div className="space-y-2">
                                <p className="text-sm text-green-600">✓ Connected</p>
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={disconnectTwitter}
                                    className="w-full"
                                >
                                    Disconnect Twitter
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-sm text-red-600">Not connected</p>
                                <Button 
                                    onClick={connectTwitter}
                                    disabled={isConnecting}
                                    className="w-full"
                                >
                                    {isConnecting ? 'Connecting...' : 'Connect Twitter Account'}
                                </Button>
                            </div>
                        )}
                    </div>
                    
                    <div className="space-y-4 mb-6">
                        <Label htmlFor="utm-link" className="text-sm font-medium">
                            UTM Builder Link
                        </Label>
                        <Textarea
                            id="utm-link"
                            placeholder="Enter your UTM builder link..."
                            value={utmLink}
                            onChange={(e) => setUtmLink(e.target.value)}
                            className="min-h-[60px]"
                        />
                    </div>

                    <div className="space-y-3">
                        <Button 
                            onClick={() => handleModeSelect('generate-view')}
                            className="w-full text-left justify-start h-auto p-4"
                            variant="outline"
                            disabled={!utmLink.trim()}
                        >
                            <div>
                                <div className="font-medium">1. Generate & View</div>
                                <div className="text-sm text-gray-500 mt-1">
                                    Generate content and preview before posting
                                </div>
                            </div>
                        </Button>

                        <Button 
                            onClick={() => handleModeSelect('generate-approve')}
                            className="w-full text-left justify-start h-auto p-4"
                            variant="outline"
                            disabled={!utmLink.trim()}
                        >
                            <div>
                                <div className="font-medium">2. Generate & Approve</div>
                                <div className="text-sm text-gray-500 mt-1">
                                    Generate content with approval step
                                </div>
                            </div>
                        </Button>

                        <Button 
                            onClick={() => handleModeSelect('direct-post')}
                            className="w-full text-left justify-start h-auto p-4"
                            variant="outline"
                            disabled={!utmLink.trim()}
                        >
                            <div>
                                <div className="font-medium">3. Direct Post</div>
                                <div className="text-sm text-gray-500 mt-1">
                                    Write and post tweet directly
                                </div>
                            </div>
                        </Button>
                    </div>

                    {status && (
                        <div className={`mt-4 p-3 rounded ${
                            status.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                            {status}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Generate and View Mode
    if (mode === 'generate-view') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">Generate & View Tweet</h1>
                        <Button variant="outline" onClick={() => setMode('select')}>
                            Back
                        </Button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <Label htmlFor="query" className="text-sm font-medium">
                            Enter your content query
                        </Label>
                        <Textarea
                            id="query"
                            placeholder="What would you like to tweet about?"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="min-h-[100px]"
                        />
                        <Button 
                            onClick={handleGenerateContent}
                            disabled={isLoading || !query.trim()}
                            className="w-full"
                        >
                            {isLoading ? 'Generating...' : 'Generate Content'}
                        </Button>
                    </div>

                    {generatedContent && (
                        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                            <Label className="text-sm font-medium mb-2 block">
                                Generated Tweet:
                            </Label>
                            <div className="bg-white p-4 rounded border whitespace-pre-wrap">
                                {generatedContent}
                            </div>
                        </div>
                    )}

                    {status && (
                        <div className={`mt-4 p-3 rounded ${
                            status.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                            {status}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Generate and Approve Mode
    if (mode === 'generate-approve') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">Generate & Approve Tweet</h1>
                        <Button variant="outline" onClick={() => setMode('select')}>
                            Back
                        </Button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <Label htmlFor="query" className="text-sm font-medium">
                            Enter your content query
                        </Label>
                        <Textarea
                            id="query"
                            placeholder="What would you like to tweet about?"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="min-h-[100px]"
                        />
                        <Button 
                            onClick={handleGenerateContent}
                            disabled={isLoading || !query.trim()}
                            className="w-full"
                        >
                            {isLoading ? 'Generating...' : 'Generate Content'}
                        </Button>
                    </div>

                    {generatedContent && (
                        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                            <Label className="text-sm font-medium mb-2 block">
                                Generated Tweet:
                            </Label>
                            <div className="bg-white p-4 rounded border whitespace-pre-wrap mb-4">
                                {generatedContent}
                            </div>
                            <div className="flex space-x-3">
                                <Button 
                                    onClick={() => handlePostContent(generatedContent)}
                                    disabled={isLoading || !isTwitterConnected}
                                    className="flex-1"
                                >
                                    {isLoading ? 'Posting...' : 'Post Tweet'}
                                </Button>
                                <Button 
                                    variant="outline" 
                                    onClick={() => setGeneratedContent('')}
                                    className="flex-1"
                                >
                                    Cancel
                                </Button>
                            </div>
                            {!isTwitterConnected && (
                                <p className="text-sm text-red-600 mt-2">
                                    Please connect your Twitter account to post tweets
                                </p>
                            )}
                        </div>
                    )}

                    {status && (
                        <div className={`mt-4 p-3 rounded ${
                            status.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                            {status}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Direct Post Mode
    if (mode === 'direct-post') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">Direct Post Tweet</h1>
                        <Button variant="outline" onClick={() => setMode('select')}>
                            Back
                        </Button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <Label htmlFor="tweet-text" className="text-sm font-medium">
                            Enter tweet content
                        </Label>
                        <Textarea
                            id="tweet-text"
                            placeholder="What's happening?"
                            value={tweetText}
                            onChange={(e) => setTweetText(e.target.value)}
                            className="min-h-[120px]"
                        />
                        <div className="text-right text-sm text-gray-500">
                            {tweetText.length}/280
                        </div>
                        <Button 
                            onClick={handleDirectPost}
                            disabled={isLoading || !tweetText.trim() || tweetText.length > 280 || !isTwitterConnected}
                            className="w-full"
                        >
                            {isLoading ? 'Posting...' : 'Post Tweet'}
                        </Button>
                        {!isTwitterConnected && (
                            <p className="text-sm text-red-600">
                                Please connect your Twitter account to post tweets
                            </p>
                        )}
                    </div>

                    {status && (
                        <div className={`mt-4 p-3 rounded ${
                            status.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                            {status}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return null
}
