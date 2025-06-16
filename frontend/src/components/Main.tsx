"use client"

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Mode = 'select' | 'generate-view' | 'generate-approve' | 'direct-post' | 'profile' | 'history'

interface UserProfile {
    id: string
    name: string
    twitter_username: string
    profile_image_url: string
    created_at: string
}

interface UserPreferences {
    auto_post: boolean
    content_tone: 'professional' | 'casual' | 'enthusiastic'
    hashtags: string[]
}

interface Conversation {
    id: string
    query: string
    generated_content: string
    posted_to_twitter: boolean
    twitter_post_id?: string
    created_at: string
}

export default function Main() {
    const [mode, setMode] = useState<Mode>('select')
    const [utmLink, setUtmLink] = useState('')
    const [query, setQuery] = useState('')
    const [tweetText, setTweetText] = useState('')
    const [generatedContent, setGeneratedContent] = useState('')
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [status, setStatus] = useState('')
    
    // Enhanced OAuth 2.0 state
    const [isTwitterConnected, setIsTwitterConnected] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)
    const [isConnecting, setIsConnecting] = useState(false)
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
    const [userPreferences, setUserPreferences] = useState<UserPreferences>({
        auto_post: false,
        content_tone: 'professional',
        hashtags: []
    })
    const [conversations, setConversations] = useState<Conversation[]>([])

    // New backend API URL
    const API_URL = 'https://sales-agent-backend-js.hrishabh-ay.workers.dev'

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
            
            // Load user profile and preferences
            loadUserProfile(userIdParam)
            
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

    // Load user profile and preferences
    const loadUserProfile = async (userIdToLoad: string) => {
        try {
            const response = await fetch(`${API_URL}/user/profile?user_id=${userIdToLoad}`)
            if (response.ok) {
                const data = await response.json()
                setUserProfile(data.user)
                setUserPreferences(data.preferences)
                setIsTwitterConnected(data.twitter_connected)
            }
        } catch (err) {
            console.error('Error loading user profile:', err)
        }
    }

    // Check if stored user ID is still valid
    const checkTwitterStatus = async (userIdToCheck: string) => {
        try {
            const response = await fetch(`${API_URL}/user/profile?user_id=${userIdToCheck}`)
            if (response.ok) {
                const data = await response.json()
                if (data.twitter_connected) {
                    setIsTwitterConnected(true)
                    setUserId(userIdToCheck)
                    setUserProfile(data.user)
                    setUserPreferences(data.preferences)
                } else {
                    localStorage.removeItem('twitter_user_id')
                    setIsTwitterConnected(false)
                    setUserId(null)
                }
            } else {
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
            const response = await fetch(`${API_URL}/twitter/auth-url`)
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
            const response = await fetch(`${API_URL}/twitter/disconnect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ user_id: userId }),
            })
            
            if (response.ok) {
                setIsTwitterConnected(false)
                setUserId(null)
                setUserProfile(null)
                localStorage.removeItem('twitter_user_id')
                setStatus('Twitter disconnected successfully')
            }
        } catch (err) {
            console.error('Error disconnecting Twitter:', err)
            setStatus('Error disconnecting Twitter')
        }
    }

    // Update user preferences
    const updatePreferences = async (newPreferences: UserPreferences) => {
        if (!userId) return
        
        try {
            const response = await fetch(`${API_URL}/user/preferences`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: userId,
                    preferences: newPreferences
                }),
            })
            
            if (response.ok) {
                setUserPreferences(newPreferences)
                setStatus('Preferences updated successfully!')
            }
        } catch (err) {
            console.error('Error updating preferences:', err)
            setStatus('Error updating preferences')
        }
    }

    // Load conversation history
    const loadConversations = async () => {
        if (!userId) return
        
        try {
            const response = await fetch(`${API_URL}/user/conversations?user_id=${userId}&limit=20`)
            if (response.ok) {
                const data = await response.json()
                setConversations(data.conversations)
            }
        } catch (err) {
            console.error('Error loading conversations:', err)
        }
    }

    // Enhanced generate Twitter post with user_id
    const generateTwitterPost = async (userQuery: string) => {
        setIsLoading(true)
        try {
            const response = await fetch(`${API_URL}/generate-twitter-post`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    query: userQuery,
                    user_id: userId 
                }),
            })

            if (!response.ok) {
                throw new Error('Failed to generate content')
            }

            const data = await response.json()
            setConversationId(data.conversation_id)
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
            const payload: { content: string; user_id: string; conversation_id?: string } = { 
                content, 
                user_id: userId! 
            }
            
            if (conversationId) {
                payload.conversation_id = conversationId
            }
            
            const response = await fetch(`${API_URL}/post-twitter-post`, {
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
            
            // Reload conversations to show the updated list
            loadConversations()
            
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
        setConversationId(null)
        setStatus('')
        
        if (selectedMode === 'history') {
            loadConversations()
        }
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
                setConversationId(null)
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
                        SalesGPT Twitter Manager
                    </h1>
                    
                    {/* Twitter Connection Status */}
                    <div className="mb-6 p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium">Twitter Account</h3>
                            <div className={`h-3 w-3 rounded-full ${isTwitterConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        </div>
                        
                        {isTwitterConnected && userProfile ? (
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    {userProfile.profile_image_url && (
                                        <img 
                                            src={userProfile.profile_image_url} 
                                            alt="Profile" 
                                            className="w-8 h-8 rounded-full"
                                        />
                                    )}
                                    <div>
                                        <p className="text-sm font-medium">@{userProfile.twitter_username}</p>
                                        <p className="text-xs text-gray-500">{userProfile.name}</p>
                                    </div>
                                </div>
                                <div className="flex space-x-2">
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => setMode('profile')}
                                        className="flex-1"
                                    >
                                        Profile
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={disconnectTwitter}
                                        className="flex-1"
                                    >
                                        Disconnect
                                    </Button>
                                </div>
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

                        {isTwitterConnected && (
                            <Button 
                                onClick={() => handleModeSelect('history')}
                                className="w-full text-left justify-start h-auto p-4"
                                variant="outline"
                            >
                                <div>
                                    <div className="font-medium">4. View History</div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        View your conversation and posting history
                                    </div>
                                </div>
                            </Button>
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

    // User Profile & Preferences Screen
    if (mode === 'profile') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">User Profile & Preferences</h1>
                        <Button variant="outline" onClick={() => setMode('select')}>
                            Back
                        </Button>
                    </div>

                    <Tabs defaultValue="profile" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="profile">Profile</TabsTrigger>
                            <TabsTrigger value="preferences">Preferences</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="profile" className="space-y-4">
                            {userProfile && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Twitter Profile</CardTitle>
                                        <CardDescription>Your connected Twitter account information</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex items-center space-x-4">
                                            {userProfile.profile_image_url && (
                                                <img 
                                                    src={userProfile.profile_image_url} 
                                                    alt="Profile" 
                                                    className="w-16 h-16 rounded-full"
                                                />
                                            )}
                                            <div>
                                                <h3 className="text-lg font-semibold">{userProfile.name}</h3>
                                                <p className="text-gray-600">@{userProfile.twitter_username}</p>
                                                <p className="text-sm text-gray-500">
                                                    Connected: {new Date(userProfile.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>
                        
                        <TabsContent value="preferences" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Content Preferences</CardTitle>
                                    <CardDescription>Customize how your content is generated</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label htmlFor="content-tone">Content Tone</Label>
                                        <Select 
                                            value={userPreferences.content_tone} 
                                            onValueChange={(value: string) => 
                                                setUserPreferences({...userPreferences, content_tone: value as 'professional' | 'casual' | 'enthusiastic'})
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="professional">Professional</SelectItem>
                                                <SelectItem value="casual">Casual</SelectItem>
                                                <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    
                                    <div>
                                        <Label htmlFor="hashtags">Default Hashtags (comma-separated)</Label>
                                        <Input
                                            id="hashtags"
                                            value={userPreferences.hashtags.join(', ')}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                                                setUserPreferences({
                                                    ...userPreferences, 
                                                    hashtags: e.target.value.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag)
                                                })
                                            }
                                            placeholder="AI, SalesAutomation, Growth"
                                        />
                                    </div>
                                    
                                    <Button 
                                        onClick={() => updatePreferences(userPreferences)}
                                        className="w-full"
                                    >
                                        Save Preferences
                                    </Button>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>

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

    // Conversation History Screen
    if (mode === 'history') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-lg max-w-4xl w-full">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">Conversation History</h1>
                        <Button variant="outline" onClick={() => setMode('select')}>
                            Back
                        </Button>
                    </div>

                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {conversations.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No conversations yet. Start generating content!</p>
                        ) : (
                            conversations.map((conversation) => (
                                <Card key={conversation.id}>
                                    <CardContent className="p-4">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-start">
                                                <h3 className="font-medium text-sm text-gray-600">Query:</h3>
                                                <span className="text-xs text-gray-400">
                                                    {new Date(conversation.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-sm">{conversation.query}</p>
                                            
                                            <div className="mt-3">
                                                <h3 className="font-medium text-sm text-gray-600">Generated Content:</h3>
                                                <div className="bg-gray-50 p-3 rounded mt-1 text-sm whitespace-pre-wrap">
                                                    {conversation.generated_content}
                                                </div>
                                            </div>
                                            
                                            <div className="flex justify-between items-center mt-3">
                                                <span className={`text-xs px-2 py-1 rounded ${
                                                    conversation.posted_to_twitter 
                                                        ? 'bg-green-100 text-green-700' 
                                                        : 'bg-gray-100 text-gray-700'
                                                }`}>
                                                    {conversation.posted_to_twitter ? '✓ Posted to Twitter' : 'Draft'}
                                                </span>
                                                
                                                {!conversation.posted_to_twitter && (
                                                    <Button 
                                                        size="sm" 
                                                        onClick={() => {
                                                            setGeneratedContent(conversation.generated_content)
                                                            setConversationId(conversation.id)
                                                            handlePostContent(conversation.generated_content)
                                                        }}
                                                        disabled={isLoading}
                                                    >
                                                        Post Now
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
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

    // Generate and View Mode (existing functionality enhanced)
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

    // Generate and Approve Mode (existing functionality enhanced)
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
                                    {isLoading ? 'Posting...' : 'Approve & Post'}
                                </Button>
                                <Button 
                                    variant="outline"
                                    onClick={handleGenerateContent}
                                    disabled={isLoading}
                                    className="flex-1"
                                >
                                    Regenerate
                                </Button>
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

    // Direct Post Mode (existing functionality)
    if (mode === 'direct-post') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">Direct Post</h1>
                        <Button variant="outline" onClick={() => setMode('select')}>
                            Back
                        </Button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <Label htmlFor="tweet-text" className="text-sm font-medium">
                            Write your tweet
                        </Label>
                        <Textarea
                            id="tweet-text"
                            placeholder="What's happening?"
                            value={tweetText}
                            onChange={(e) => setTweetText(e.target.value)}
                            className="min-h-[150px]"
                        />
                        <div className="text-sm text-gray-500 text-right">
                            {tweetText.length}/280 characters
                        </div>
                        <Button 
                            onClick={handleDirectPost}
                            disabled={isLoading || !tweetText.trim() || !isTwitterConnected}
                            className="w-full"
                        >
                            {isLoading ? 'Posting...' : 'Post Tweet'}
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

    return null
}
