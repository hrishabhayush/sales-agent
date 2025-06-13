"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import React, { useState } from 'react'

type Mode = 'select' | 'generate-view' | 'generate-approve' | 'direct-post'

export default function Main() {
    const [mode, setMode] = useState<Mode>('select')
    const [utmLink, setUtmLink] = useState('')
    const [query, setQuery] = useState('')
    const [tweetText, setTweetText] = useState('')
    const [generatedContent, setGeneratedContent] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [status, setStatus] = useState('')

    // API calls to backend
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
            const response = await fetch('/api/post-tweet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content }),
            })

            if (!response.ok) {
                throw new Error('Failed to post to Twitter')
            }

            const data = await response.json()
            return data.success
        } catch (error) {
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
                        <h2 className="text-lg font-semibold text-gray-700 mb-4">Choose a mode:</h2>
                        
                        <Button 
                            onClick={() => handleModeSelect('generate-view')}
                            className="w-full text-left justify-start h-auto p-4"
                            variant="outline"
                            disabled={!utmLink.trim()}
                        >
                            <div>
                                <div className="font-medium">1. Generate and View</div>
                                <div className="text-sm text-gray-500 mt-1">
                                    Generate tweet content and preview it
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
                                <div className="font-medium">2. Generate and Approve</div>
                                <div className="text-sm text-gray-500 mt-1">
                                    Generate content and approve before posting
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
                        <h1 className="text-2xl font-bold text-gray-800">Generate and View Tweet</h1>
                        <Button variant="outline" onClick={() => setMode('select')}>
                            Back
                        </Button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <Label htmlFor="query" className="text-sm font-medium">
                            Enter query for tweet generation
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
                            {isLoading ? 'Generating...' : 'Generate Tweet'}
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
                        <h1 className="text-2xl font-bold text-gray-800">Generate and Approve Tweet</h1>
                        <Button variant="outline" onClick={() => setMode('select')}>
                            Back
                        </Button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <Label htmlFor="query" className="text-sm font-medium">
                            Enter query for tweet generation
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
                            {isLoading ? 'Generating...' : 'Generate Tweet'}
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
                                    disabled={isLoading}
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
                            disabled={isLoading || !tweetText.trim() || tweetText.length > 280}
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
