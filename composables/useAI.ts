export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export function useAI() {
  const config  = useRuntimeConfig()
  const apiBase = config.public.apiBase

  const chatHistory = ref<ChatMsg[]>([])
  const isLoading   = ref(false)
  const aiError     = ref('')

  async function sendMessage(message: string, transcript: string) {
    if (!message.trim()) return
    aiError.value = ''

    const userMsg: ChatMsg = { role: 'user', content: message }
    chatHistory.value = [...chatHistory.value, userMsg]
    isLoading.value   = true

    try {
      const res = await $fetch<{ reply: string }>(`${apiBase}/api/ai/chat`, {
        method: 'POST',
        body: {
          transcript,
          history: chatHistory.value.slice(0, -1),
          message,
        },
      })
      chatHistory.value = [...chatHistory.value, { role: 'assistant', content: res.reply }]
    } catch (e: any) {
      const msg = e?.data?.detail || e?.message || 'AI request failed.'
      chatHistory.value = [...chatHistory.value, { role: 'assistant', content: `❌ ${msg}` }]
      aiError.value = msg
    } finally {
      isLoading.value = false
    }
  }

  async function downloadDocx(content: string, title = 'Document') {
    try {
      const response = await fetch(`${apiBase}/api/ai/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title }),
      })
      if (!response.ok) throw new Error('Failed to generate document.')
      const blob = await response.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      aiError.value = e.message
    }
  }

  function clearChat() {
    chatHistory.value = []
  }

  return { chatHistory, isLoading, aiError, sendMessage, downloadDocx, clearChat }
}
