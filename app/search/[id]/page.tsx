import { Chat } from '@/components/chat'
import { getChat } from '@/lib/actions/chat'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getModels } from '@/lib/config/models'
import { convertToUIMessages } from '@/lib/utils'
import { notFound, redirect } from 'next/navigation'
import { Message } from 'ai'

export const maxDuration = 60

export async function generateMetadata(props: {
  params: Promise<{ id: string }>
}) {
  try {
    const { id } = await props.params
    const userId = await getCurrentUserId()
    const chat = await getChat(id, userId)
    return {
      title: chat?.title?.toString().slice(0, 50) || 'Search'
    }
  } catch (error) {
    console.error('Error generating metadata:', error)
    return {
      title: 'Search'
    }
  }
}

export default async function SearchPage(props: {
  params: Promise<{ id: string }>
}) {
  const userId = await getCurrentUserId()
  const { id } = await props.params

  try {
    const chat = await getChat(id, userId)
    
    // If chat doesn't exist, redirect to homepage
    if (!chat) {
      console.log(`Chat ${id} not found, redirecting to homepage`)
      redirect('/')
    }

    // Check if user has access to this chat
    if (chat.userId !== userId && chat.userId !== 'anonymous') {
      console.log(`User ${userId} not authorized to view chat ${id}`)
      notFound()
    }

    // Convert messages for useChat hook
    const messages = convertToUIMessages(chat.messages || [])
    const models = await getModels()
    
    return <Chat id={id} savedMessages={messages} models={models} />
  } catch (error) {
    // Log error and show a more user-friendly experience
    console.error(`Error rendering search page for chat ${id}:`, error)
    
    // Initialize with empty messages and continue
    const messages: Message[] = []
    const models = await getModels()
    
    return <Chat id={id} savedMessages={messages} models={models} />
  }
}
