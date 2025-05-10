'use server'

import { getRedisClient, RedisWrapper } from '@/lib/redis/config'
import { type Chat } from '@/lib/types'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function getRedis(): Promise<RedisWrapper> {
  return await getRedisClient()
}

const CHAT_VERSION = 'v2'
function getUserChatKey(userId: string) {
  return `user:${CHAT_VERSION}:chat:${userId}`
}

export async function getChats(userId?: string | null) {
  if (!userId) {
    return []
  }

  try {
    const redis = await getRedis()
    const chats = await redis.zrange(getUserChatKey(userId), 0, -1, {
      rev: true
    })

    if (chats.length === 0) {
      return []
    }

    const results = await Promise.all(
      chats.map(async chatKey => {
        const chat = await redis.hgetall(chatKey)
        return chat
      })
    )

    return results
      .filter((result): result is Record<string, any> => {
        if (result === null || Object.keys(result).length === 0) {
          return false
        }
        return true
      })
      .map(chat => {
        const plainChat = { ...chat }
        if (typeof plainChat.messages === 'string') {
          try {
            plainChat.messages = JSON.parse(plainChat.messages)
          } catch (error) {
            plainChat.messages = []
          }
        }
        if (plainChat.createdAt && !(plainChat.createdAt instanceof Date)) {
          plainChat.createdAt = new Date(plainChat.createdAt)
        }
        return plainChat as Chat
      })
  } catch (error) {
    return []
  }
}

export async function getChatsPage(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ chats: Chat[]; nextOffset: number | null }> {
  try {
    const redis = await getRedis()
    const userChatKey = getUserChatKey(userId)
    const start = offset
    const end = offset + limit - 1

    const chatKeys = await redis.zrange(userChatKey, start, end, {
      rev: true
    })

    if (chatKeys.length === 0) {
      return { chats: [], nextOffset: null }
    }

    const results = await Promise.all(
      chatKeys.map(async chatKey => {
        const chat = await redis.hgetall(chatKey)
        return chat
      })
    )

    const chats = results
      .filter((result): result is Record<string, any> => {
        if (result === null || Object.keys(result).length === 0) {
          return false
        }
        return true
      })
      .map(chat => {
        const plainChat = { ...chat }
        if (typeof plainChat.messages === 'string') {
          try {
            plainChat.messages = JSON.parse(plainChat.messages)
          } catch (error) {
            plainChat.messages = []
          }
        }
        if (plainChat.createdAt && !(plainChat.createdAt instanceof Date)) {
          plainChat.createdAt = new Date(plainChat.createdAt)
        }
        return plainChat as Chat
      })

    const nextOffset = chatKeys.length === limit ? offset + limit : null
    return { chats, nextOffset }
  } catch (error) {
    console.error('Error fetching chat page:', error)
    return { chats: [], nextOffset: null }
  }
}

export async function getChat(
  id: string,
  userId: string = 'anonymous'
): Promise<Chat | null> {
  let redis = null;
  try {
    // 1. Improved Redis client acquisition with retry logic
    try {
      redis = await getRedis()
    } catch (redisError) {
      console.error('Error connecting to Redis:', redisError)
      // Return a minimal valid chat object instead of failing completely
      return {
        id,
        title: 'Chat data unavailable',
        userId,
        path: '',
        createdAt: new Date(),
        messages: []
      }
    }
    
    // 2. Add timeout to prevent hanging connections
    let rawChat: Record<string, any> | null = null;
    
    try {
      // Use a shorter timeout (3 seconds) to prevent UI hanging
      const rawChatPromise = redis.hgetall<Record<string, any>>(`chat:${id}`)
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Redis query timed out')), 3000);
      });
      
      rawChat = await Promise.race([rawChatPromise, timeoutPromise]) as Record<string, any> | null;
    } catch (timeoutError) {
      console.warn(`Redis query timed out for chat ${id}:`, timeoutError)
      // Return basic valid chat rather than null to prevent crashes
      return {
        id,
        title: 'Loading...',
        userId,
        path: '',
        createdAt: new Date(),
        messages: []
      }
    }

    if (!rawChat || Object.keys(rawChat).length === 0) {
      console.log(`No chat data found for ID: ${id}`)
      return null
    }

    // Create a sanitized copy of the data with defaults for all required properties
    // Avoid potential errors by checking all properties before using them
    const chat: Chat = {
      id: rawChat.id || id, // Use the provided ID if not in the data
      title: typeof rawChat.title === 'string' ? rawChat.title : 'Untitled Chat',
      userId: typeof rawChat.userId === 'string' ? rawChat.userId : userId,
      path: typeof rawChat.path === 'string' ? rawChat.path : '',
      createdAt: new Date(rawChat.createdAt || Date.now()),
      messages: [],
      // Only include other properties that are safe
      ...(rawChat.sharePath && { sharePath: rawChat.sharePath })
    }
    
    // Safely parse messages with thorough error handling
    try {
      let parsedMessages: any[] = [];
      
      if (typeof rawChat.messages === 'string' && rawChat.messages.trim() !== '') {
        try {
          parsedMessages = JSON.parse(rawChat.messages);
          // Verify it's actually an array after parsing
          if (!Array.isArray(parsedMessages)) {
            console.warn('Parsed messages is not an array, resetting to empty array');
            parsedMessages = [];
          }
        } catch (parseError) {
          console.error('Error parsing messages JSON:', parseError);
          parsedMessages = [];
        }
      } else if (Array.isArray(rawChat.messages)) {
        parsedMessages = rawChat.messages;
      }
      
      // Sanitize each message to ensure valid structure
      chat.messages = parsedMessages.filter(msg => msg && typeof msg === 'object');
    } catch (error) {
      console.error('Error processing messages:', error);
      chat.messages = [];
    }

    // Ensure messages is always an array
    if (!Array.isArray(chat.messages)) {
      chat.messages = []
    }

    return chat
  } catch (error) {
    console.error(`Error fetching chat ${id}:`, error)
    
    // Instead of returning null which might cause crashes,
    // return a minimal valid Chat object
    return {
      id,
      title: 'Error loading chat',
      userId,
      path: '',
      createdAt: new Date(),
      messages: []
    }
  } finally {
    // No cleanup needed for Redis client as it's managed by the getRedis function
    // But we could add metrics or logging here if needed
  }
}

export async function clearChats(
  userId: string = 'anonymous'
): Promise<{ error?: string }> {
  const redis = await getRedis()
  const userChatKey = getUserChatKey(userId)
  const chats = await redis.zrange(userChatKey, 0, -1)
  if (!chats.length) {
    return { error: 'No chats to clear' }
  }
  const pipeline = redis.pipeline()

  for (const chat of chats) {
    pipeline.del(chat)
    pipeline.zrem(userChatKey, chat)
  }

  await pipeline.exec()

  revalidatePath('/')
  redirect('/')
}

export async function deleteChat(
  chatId: string,
  userId = 'anonymous'
): Promise<{ error?: string }> {
  try {
    const redis = await getRedis()
    const userKey = getUserChatKey(userId)
    const chatKey = `chat:${chatId}`

    const chatDetails = await redis.hgetall<Chat>(chatKey)
    if (!chatDetails || Object.keys(chatDetails).length === 0) {
      console.warn(`Attempted to delete non-existent chat: ${chatId}`)
      return { error: 'Chat not found' }
    }

    // Optional: Check if the chat actually belongs to the user if userId is provided and matters
    // if (chatDetails.userId !== userId) {
    //  console.warn(`Unauthorized attempt to delete chat ${chatId} by user ${userId}`)
    //  return { error: 'Unauthorized' }
    // }

    const pipeline = redis.pipeline()
    pipeline.del(chatKey)
    pipeline.zrem(userKey, chatKey) // Use chatKey consistently
    await pipeline.exec()

    // Revalidate the root path where the chat history is displayed
    revalidatePath('/')

    return {}
  } catch (error) {
    console.error(`Error deleting chat ${chatId}:`, error)
    return { error: 'Failed to delete chat' }
  }
}

export async function saveChat(chat: Chat, userId: string = 'anonymous') {
  try {
    const redis = await getRedis()
    const pipeline = redis.pipeline()

    const chatToSave = {
      ...chat,
      messages: JSON.stringify(chat.messages)
    }

    pipeline.hmset(`chat:${chat.id}`, chatToSave)
    pipeline.zadd(getUserChatKey(userId), Date.now(), `chat:${chat.id}`)

    const results = await pipeline.exec()

    return results
  } catch (error) {
    throw error
  }
}

export async function getSharedChat(id: string) {
  const redis = await getRedis()
  const chat = await redis.hgetall<Chat>(`chat:${id}`)

  if (!chat || !chat.sharePath) {
    return null
  }

  return chat
}

export async function shareChat(id: string, userId: string = 'anonymous') {
  const redis = await getRedis()
  const chat = await redis.hgetall<Chat>(`chat:${id}`)

  if (!chat || chat.userId !== userId) {
    return null
  }

  const payload = {
    ...chat,
    sharePath: `/share/${id}`
  }

  await redis.hmset(`chat:${id}`, payload)

  return payload
}
