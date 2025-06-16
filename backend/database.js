// Database helper functions for Cloudflare D1

// Generate random string for IDs
function generateId(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// User operations
export const userOps = {
  // Create a new user
  async createUser(db, userData) {
    const userId = generateId();
    const now = new Date().toISOString();
    
    const result = await db.prepare(`
      INSERT INTO users (id, email, name, twitter_username, profile_image_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      userData.email || null,
      userData.name || null,
      userData.twitter_username || null,
      userData.profile_image_url || null,
      now,
      now
    ).run();
    
    if (result.success) {
      return userId;
    }
    throw new Error('Failed to create user');
  },

  // Get user by ID
  async getUserById(db, userId) {
    const result = await db.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(userId).first();
    
    return result;
  },

  // Get user by Twitter username
  async getUserByTwitterUsername(db, username) {
    const result = await db.prepare(`
      SELECT * FROM users WHERE twitter_username = ?
    `).bind(username).first();
    
    return result;
  },

  // Update user profile
  async updateUser(db, userId, userData) {
    const now = new Date().toISOString();
    
    const result = await db.prepare(`
      UPDATE users 
      SET email = ?, name = ?, twitter_username = ?, profile_image_url = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      userData.email,
      userData.name,
      userData.twitter_username,
      userData.profile_image_url,
      now,
      userId
    ).run();
    
    return result.success;
  }
};

// Session operations
export const sessionOps = {
  // Create session for OAuth flow
  async createSession(db, sessionData) {
    const sessionId = generateId(32);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
    const now = new Date().toISOString();
    
    const result = await db.prepare(`
      INSERT INTO user_sessions (session_id, user_id, code_verifier, code_challenge, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId,
      sessionData.user_id || null,
      sessionData.code_verifier,
      sessionData.code_challenge,
      expiresAt,
      now
    ).run();
    
    if (result.success) {
      return sessionId;
    }
    throw new Error('Failed to create session');
  },

  // Get session by ID
  async getSession(db, sessionId) {
    const result = await db.prepare(`
      SELECT * FROM user_sessions 
      WHERE session_id = ? AND expires_at > datetime('now')
    `).bind(sessionId).first();
    
    return result;
  },

  // Delete session
  async deleteSession(db, sessionId) {
    const result = await db.prepare(`
      DELETE FROM user_sessions WHERE session_id = ?
    `).bind(sessionId).run();
    
    return result.success;
  },

  // Clean up expired sessions
  async cleanupExpiredSessions(db) {
    const result = await db.prepare(`
      DELETE FROM user_sessions WHERE expires_at <= datetime('now')
    `).run();
    
    return result.success;
  }
};

// Twitter token operations
export const tokenOps = {
  // Store Twitter tokens
  async storeTokens(db, userId, tokens) {
    const now = new Date().toISOString();
    const expiresAt = tokens.expires_in 
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;
    
    const result = await db.prepare(`
      INSERT OR REPLACE INTO twitter_tokens 
      (user_id, access_token, refresh_token, expires_at, scope, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      tokens.access_token,
      tokens.refresh_token || null,
      expiresAt,
      tokens.scope || null,
      now,
      now
    ).run();
    
    return result.success;
  },

  // Get tokens for user
  async getTokens(db, userId) {
    const result = await db.prepare(`
      SELECT * FROM twitter_tokens WHERE user_id = ?
    `).bind(userId).first();
    
    return result;
  },

  // Delete tokens for user
  async deleteTokens(db, userId) {
    const result = await db.prepare(`
      DELETE FROM twitter_tokens WHERE user_id = ?
    `).bind(userId).run();
    
    return result.success;
  }
};

// Conversation operations
export const conversationOps = {
  // Save conversation
  async saveConversation(db, userId, query, generatedContent) {
    const conversationId = generateId();
    const now = new Date().toISOString();
    
    const result = await db.prepare(`
      INSERT INTO conversations (id, user_id, query, generated_content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(conversationId, userId, query, generatedContent, now).run();
    
    if (result.success) {
      return conversationId;
    }
    throw new Error('Failed to save conversation');
  },

  // Mark conversation as posted to Twitter
  async markAsPosted(db, conversationId, twitterPostId) {
    const result = await db.prepare(`
      UPDATE conversations 
      SET posted_to_twitter = TRUE, twitter_post_id = ?
      WHERE id = ?
    `).bind(twitterPostId, conversationId).run();
    
    return result.success;
  },

  // Get user's conversations
  async getUserConversations(db, userId, limit = 10) {
    const result = await db.prepare(`
      SELECT * FROM conversations 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).bind(userId, limit).all();
    
    return result.results || [];
  }
};

// User preferences operations
export const preferencesOps = {
  // Set user preferences
  async setPreferences(db, userId, preferences) {
    const now = new Date().toISOString();
    
    const result = await db.prepare(`
      INSERT OR REPLACE INTO user_preferences 
      (user_id, auto_post, content_tone, hashtags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      preferences.auto_post || false,
      preferences.content_tone || 'professional',
      JSON.stringify(preferences.hashtags || []),
      now,
      now
    ).run();
    
    return result.success;
  },

  // Get user preferences
  async getPreferences(db, userId) {
    const result = await db.prepare(`
      SELECT * FROM user_preferences WHERE user_id = ?
    `).bind(userId).first();
    
    if (result && result.hashtags) {
      result.hashtags = JSON.parse(result.hashtags);
    }
    
    return result;
  }
}; 