import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Call the FastAPI backend server
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    const response = await fetch(`${backendUrl}/twitter/auth-url`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to get authorization URL')
    }

    const data = await response.json()
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error getting auth URL:', error)
    return NextResponse.json(
      { error: 'Failed to get authorization URL' },
      { status: 500 }
    )
  }
} 