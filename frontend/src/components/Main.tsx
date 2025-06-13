"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import React, { useState } from 'react'

export default function Main() {

    const [hasSent, setSent] = useState(false)

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="grid w-full max-w-md gap-1">
                <Label htmlFor="message">Enter your prompt here to be posted on Twitter</Label>
                <Textarea placeholder="Type your message here." />
                <Button 
                    onClick={() => setSent(true)}
                    disabled = {hasSent}
                >
                    {hasSent ? "Message Sent" : "Send message"}
                </Button>
            </div>
        </div>
    )
}
