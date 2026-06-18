<script setup lang="ts">
import { marked } from 'marked'

// ── Composables ────────────────────────────────────────────────────────────
const {
  status, progress, progressDone, progressTotal,
  detectedLang, transcript, error,
  startTranscription, reset,
} = useTranscriber()

const { chatHistory, isLoading, sendMessage, downloadDocx, clearChat } = useAI()

// ── Local state ────────────────────────────────────────────────────────────
const selectedFile    = ref<File | null>(null)
const isDragging      = ref(false)
const activeTab       = ref<'transcript' | 'ai'>('transcript')
const userInput       = ref('')
const pastedTranscript = ref('')
const showSettings    = ref(false)

const settings = reactive({
  model:        'small',
  language:     'auto-detect',
  multilingual: false,
  task:         'transcribe',
  keyTerms:     '',
})

const MODELS = [
  { value: 'tiny',     label: 'Tiny — Fastest, basic accuracy' },
  { value: 'base',     label: 'Base — Very fast, decent accuracy' },
  { value: 'small',    label: 'Small — Balanced (recommended)' },
  { value: 'medium',   label: 'Medium — Good accuracy, slower' },
  { value: 'large-v3', label: 'Large-v3 — Best accuracy, slowest' },
]

const LANGUAGES = [
  { value: 'auto-detect', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'ur', label: 'Urdu' },
  { value: 'hi', label: 'Hindi' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ha', label: 'Hausa' },
]

const QUICK_PROMPTS = [
  { label: '📋 Meeting Minutes',   prompt: 'Format this transcript as professional meeting minutes with sections for Attendees, Agenda, Key Decisions, Action Items, and Next Steps.' },
  { label: '📝 Executive Summary', prompt: 'Write a concise executive summary in 3–5 paragraphs covering the main topic, key points, conclusions, and recommendations.' },
  { label: '✅ Action Items',       prompt: 'Extract all action items and decisions from this transcript. Present as a numbered list with task, owner (if mentioned), and deadline (if mentioned).' },
  { label: '📚 Lecture Notes',     prompt: 'Convert this lecture into well-structured study notes with: main topic, key concepts, definitions, examples, and a summary.' },
  { label: '📄 Professional Report', prompt: 'Rewrite this as a formal professional report with sections: Executive Summary, Background, Discussion Points, Conclusions, and Recommendations.' },
]

// ── Computed ───────────────────────────────────────────────────────────────
const activeTranscript = computed(() => transcript.value || pastedTranscript.value)
const progressPct      = computed(() => Math.round(progress.value * 100))
const canTranscribe    = computed(() => !!selectedFile.value && status.value === 'idle')
const isbusy           = computed(() => status.value === 'uploading' || status.value === 'transcribing')
const lastAIReply      = computed(() => {
  const msgs = [...chatHistory.value].reverse()
  return msgs.find(m => m.role === 'assistant')?.content || ''
})

// ── Methods ────────────────────────────────────────────────────────────────
function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) selectedFile.value = file
}

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) selectedFile.value = file
}

function removeFile() {
  selectedFile.value = null
  reset()
}

async function transcribe() {
  if (!selectedFile.value) return
  await startTranscription(selectedFile.value, {
    model:        settings.model,
    language:     settings.language,
    multilingual: settings.multilingual,
    task:         settings.task,
    keyTerms:     settings.keyTerms,
  })
}

async function send() {
  if (!userInput.value.trim() || isLoading.value) return
  const msg = userInput.value.trim()
  userInput.value = ''
  await sendMessage(msg, activeTranscript.value)
}

function useQuickPrompt(prompt: string) {
  userInput.value = prompt
  activeTab.value = 'ai'
}

function usePasted() {
  if (pastedTranscript.value.trim()) activeTab.value = 'ai'
}

function renderMd(text: string): string {
  return marked.parse(text) as string
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

// Auto-switch to transcript tab when done
watch(status, (s) => {
  if (s === 'completed') activeTab.value = 'transcript'
})

// Auto-scroll chat to bottom
const chatEl = ref<HTMLElement | null>(null)
watch(chatHistory, async () => {
  await nextTick()
  if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
}, { deep: true })
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans">

    <!-- ── Header ──────────────────────────────────────────────────── -->
    <header class="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
        <div class="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center text-lg shadow-sm">
          🎙️
        </div>
        <div>
          <h1 class="text-base font-bold text-slate-900 leading-none">AI Transcriber</h1>
          <p class="text-xs text-slate-400 mt-0.5">Powered by Whisper + Groq</p>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <span v-if="status === 'transcribing'"
            class="hidden sm:flex items-center gap-1.5 text-xs text-brand-600 bg-brand-50 px-3 py-1.5 rounded-full font-medium">
            <span class="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse-slow"></span>
            Transcribing {{ progressPct }}%
          </span>
          <span v-if="status === 'completed'"
            class="hidden sm:flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full font-medium">
            ✓ Done
          </span>
        </div>
      </div>
    </header>

    <!-- ── Main grid ────────────────────────────────────────────────── -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">

      <!-- ── LEFT: Settings panel ─────────────────────────────────── -->
      <aside class="space-y-4">

        <!-- Upload card -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h2 class="text-sm font-semibold text-slate-700 mb-3">Upload File</h2>

          <!-- Drop zone -->
          <label
            v-if="!selectedFile"
            class="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all"
            :class="isDragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'"
            @dragover.prevent="isDragging = true"
            @dragleave="isDragging = false"
            @drop.prevent="onDrop"
          >
            <span class="text-3xl">{{ isDragging ? '📂' : '🎵' }}</span>
            <span class="text-sm font-medium text-slate-600">
              {{ isDragging ? 'Release to upload' : 'Drop audio or video here' }}
            </span>
            <span class="text-xs text-slate-400">mp3, mp4, wav, m4a, webm, …</span>
            <span class="mt-1 text-xs text-brand-600 font-medium bg-brand-50 px-3 py-1 rounded-full">
              Browse files
            </span>
            <input type="file" class="hidden" accept="audio/*,video/*" @change="onFileInput" />
          </label>

          <!-- Selected file -->
          <div v-else class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span class="text-2xl flex-shrink-0">🎵</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-800 truncate">{{ selectedFile.name }}</p>
              <p class="text-xs text-slate-400">{{ formatBytes(selectedFile.size) }}</p>
            </div>
            <button
              v-if="!isbusy"
              @click="removeFile"
              class="w-7 h-7 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
            >×</button>
          </div>
        </div>

        <!-- Settings card -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <button
            class="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            @click="showSettings = !showSettings"
          >
            <span>⚙️ Settings</span>
            <span class="text-slate-400 transition-transform" :class="showSettings ? 'rotate-180' : ''">▾</span>
          </button>

          <div v-show="showSettings" class="px-5 pb-5 space-y-4 border-t border-slate-100">
            <!-- Model -->
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Model</label>
              <select v-model="settings.model"
                class="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                <option v-for="m in MODELS" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </div>

            <!-- Language -->
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Language</label>
              <select v-model="settings.language"
                class="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                :disabled="settings.multilingual">
                <option v-for="l in LANGUAGES" :key="l.value" :value="l.value">{{ l.label }}</option>
              </select>
            </div>

            <!-- Multilingual -->
            <label class="flex items-start gap-3 cursor-pointer group">
              <div class="relative mt-0.5 flex-shrink-0">
                <input type="checkbox" v-model="settings.multilingual" class="sr-only peer" />
                <div class="w-9 h-5 bg-slate-200 peer-checked:bg-brand-600 rounded-full transition-colors"></div>
                <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
              </div>
              <div>
                <p class="text-sm font-medium text-slate-700">🌐 Multilingual</p>
                <p class="text-xs text-slate-400">Best for mixed-language audio (e.g. Arabic + English)</p>
              </div>
            </label>

            <!-- Task -->
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Task</label>
              <div class="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                <button
                  @click="settings.task = 'transcribe'"
                  class="flex-1 py-2 text-center transition-colors"
                  :class="settings.task === 'transcribe' ? 'bg-brand-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50'"
                >Transcribe</button>
                <button
                  @click="settings.task = 'translate'"
                  class="flex-1 py-2 text-center transition-colors border-l border-slate-200"
                  :class="settings.task === 'translate' ? 'bg-brand-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50'"
                >→ English</button>
              </div>
            </div>

            <!-- Key terms -->
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Key names & terms <span class="font-normal">(optional)</span></label>
              <textarea
                v-model="settings.keyTerms"
                rows="2"
                placeholder="e.g. Hamza Yusuf, taqwa, Qur'an"
                class="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slate-300"
              />
            </div>
          </div>
        </div>

        <!-- Transcribe button -->
        <button
          @click="transcribe"
          :disabled="!canTranscribe || isbusy"
          class="w-full py-3.5 rounded-xl text-sm font-semibold transition-all shadow-sm"
          :class="canTranscribe && !isbusy
            ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-200 shadow-md'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
        >
          <span v-if="status === 'uploading'">⬆️ Uploading…</span>
          <span v-else-if="status === 'transcribing'">🔴 Transcribing {{ progressPct }}%</span>
          <span v-else>▶ Transcribe</span>
        </button>

        <!-- Error -->
        <div v-if="status === 'error'"
          class="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <span class="flex-shrink-0 mt-0.5">❌</span>
          <span>{{ error }}</span>
        </div>

      </aside>

      <!-- ── RIGHT: Results panel ──────────────────────────────────── -->
      <section class="flex flex-col gap-4 min-h-[600px]">

        <!-- Progress bar (visible while transcribing) -->
        <div v-if="isbusy" class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 bg-brand-500 rounded-full animate-pulse-slow"></span>
              <span class="text-sm font-medium text-slate-700">
                {{ status === 'uploading' ? 'Uploading file…' : 'Transcribing audio…' }}
              </span>
            </div>
            <span class="text-sm font-semibold text-brand-600">{{ progressPct }}%</span>
          </div>
          <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-brand-500 to-brand-600 rounded-full transition-all duration-700"
              :style="{ width: `${Math.max(progressPct, 3)}%` }"
            />
          </div>
          <div v-if="progressTotal > 0" class="flex items-center justify-between mt-2 text-xs text-slate-400">
            <span>{{ formatTime(progressDone) }} / {{ formatTime(progressTotal) }}</span>
            <span v-if="detectedLang">🌐 {{ detectedLang }}</span>
          </div>
          <!-- Live partial transcript -->
          <div v-if="transcript" class="mt-4 max-h-40 overflow-y-auto text-xs text-slate-500 bg-slate-50 rounded-lg p-3 leading-relaxed">
            {{ transcript.split('\n').slice(-8).join('\n') }}
          </div>
        </div>

        <!-- Idle state: call to action -->
        <div v-if="status === 'idle' && !activeTranscript"
          class="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center p-12 text-center">
          <div class="text-5xl mb-4">🎙️</div>
          <h2 class="text-lg font-semibold text-slate-700 mb-2">Ready to transcribe</h2>
          <p class="text-sm text-slate-400 max-w-xs">Upload an audio or video file on the left, then click <strong>Transcribe</strong>. Or paste text below to use the AI assistant directly.</p>
          <div class="mt-6 w-full max-w-md">
            <label class="block text-xs font-medium text-slate-500 mb-2 text-left">Paste a transcript to use AI directly</label>
            <textarea
              v-model="pastedTranscript"
              rows="4"
              placeholder="Paste any transcript text here…"
              class="w-full text-sm rounded-xl border border-slate-200 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slate-300"
            />
            <button
              v-if="pastedTranscript.trim()"
              @click="usePasted"
              class="mt-2 w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Use This Transcript with AI →
            </button>
          </div>
        </div>

        <!-- Tabs (visible when there's content) -->
        <div v-if="status === 'completed' || activeTranscript" class="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

          <!-- Tab bar -->
          <div class="flex border-b border-slate-200">
            <button
              @click="activeTab = 'transcript'"
              class="flex-1 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px"
              :class="activeTab === 'transcript'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'"
            >📄 Transcript</button>
            <button
              @click="activeTab = 'ai'"
              class="flex-1 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px"
              :class="activeTab === 'ai'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'"
            >🤖 AI Assistant</button>
          </div>

          <!-- ── Transcript tab ───────────────────────────────────── -->
          <div v-show="activeTab === 'transcript'" class="flex-1 flex flex-col p-5 gap-4 overflow-hidden">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span v-if="status === 'completed'" class="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">✓ Completed</span>
                <span v-if="detectedLang" class="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">🌐 {{ detectedLang }}</span>
              </div>
              <button
                @click="activeTab = 'ai'"
                class="text-xs text-brand-600 font-medium hover:underline"
              >Use with AI →</button>
            </div>
            <textarea
              :value="transcript || pastedTranscript"
              readonly
              class="flex-1 min-h-[400px] text-sm text-slate-700 bg-slate-50 rounded-xl border border-slate-200 p-4 resize-none leading-relaxed focus:outline-none"
            />
            <div class="flex gap-2">
              <button
                @click="navigator.clipboard.writeText(transcript || pastedTranscript)"
                class="flex-1 py-2.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
              >📋 Copy</button>
              <a
                v-if="transcript"
                :href="`data:text/plain;charset=utf-8,${encodeURIComponent(transcript)}`"
                download="transcript.txt"
                class="flex-1 py-2.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors text-center"
              >⬇️ Download .txt</a>
            </div>
          </div>

          <!-- ── AI tab ───────────────────────────────────────────── -->
          <div v-show="activeTab === 'ai'" class="flex-1 flex flex-col overflow-hidden">

            <!-- Quick prompts -->
            <div class="px-4 pt-4 pb-3 border-b border-slate-100">
              <p class="text-xs font-medium text-slate-400 mb-2">Quick actions</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="q in QUICK_PROMPTS"
                  :key="q.label"
                  @click="useQuickPrompt(q.prompt)"
                  class="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-all text-slate-600 font-medium"
                >{{ q.label }}</button>
              </div>

              <!-- Paste fallback if no transcript loaded -->
              <div v-if="!activeTranscript" class="mt-3">
                <textarea
                  v-model="pastedTranscript"
                  rows="2"
                  placeholder="Paste transcript here first…"
                  class="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slate-300"
                />
              </div>
            </div>

            <!-- Chat messages -->
            <div ref="chatEl" class="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              <div v-if="chatHistory.length === 0" class="flex flex-col items-center justify-center h-full text-center py-8">
                <div class="text-4xl mb-3">🤖</div>
                <p class="text-sm text-slate-400 max-w-xs">
                  {{ activeTranscript ? 'Ask me to summarise, format, or restructure your transcript.' : 'Paste a transcript above, then ask me anything.' }}
                </p>
              </div>

              <div v-for="(msg, i) in chatHistory" :key="i"
                class="flex gap-2.5"
                :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
              >
                <div v-if="msg.role === 'assistant'" class="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">🤖</div>
                <div
                  class="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                  :class="msg.role === 'user'
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm prose prose-sm max-w-none'"
                  v-html="msg.role === 'assistant' ? renderMd(msg.content) : msg.content"
                />
                <div v-if="msg.role === 'user'" class="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">👤</div>
              </div>

              <!-- Loading indicator -->
              <div v-if="isLoading" class="flex gap-2.5 justify-start">
                <div class="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                <div class="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                  <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                  <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay:300ms"></span>
                </div>
              </div>
            </div>

            <!-- Input area -->
            <div class="p-4 border-t border-slate-100 space-y-2">
              <div class="flex gap-2">
                <textarea
                  v-model="userInput"
                  rows="2"
                  placeholder="Ask the AI anything about your transcript…"
                  class="flex-1 text-sm rounded-xl border border-slate-200 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slate-300"
                  @keydown.enter.exact.prevent="send"
                  :disabled="isLoading"
                />
                <div class="flex flex-col gap-2">
                  <button
                    @click="send"
                    :disabled="!userInput.trim() || isLoading"
                    class="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex-shrink-0"
                    :class="userInput.trim() && !isLoading
                      ? 'bg-brand-600 hover:bg-brand-700 text-white'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
                  >Send</button>
                  <button
                    @click="clearChat"
                    class="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >Clear</button>
                </div>
              </div>

              <!-- Download -->
              <div v-if="lastAIReply" class="flex gap-2">
                <button
                  @click="downloadDocx(lastAIReply, 'AI Document')"
                  class="flex-1 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-colors"
                >📄 Download as Word (.docx)</button>
              </div>
            </div>
          </div>
        </div>

      </section>
    </main>

    <!-- ── Footer ───────────────────────────────────────────────────── -->
    <footer class="text-center py-6 text-xs text-slate-400">
      AI Transcriber · Powered by <span class="font-medium">Whisper</span> + <span class="font-medium">Groq Llama 3</span>
    </footer>

  </div>
</template>

<style>
/* Markdown output styles */
.prose h1, .prose h2, .prose h3 { font-weight: 600; margin: 0.75em 0 0.4em; color: #1e293b; }
.prose h1 { font-size: 1.1em; }
.prose h2 { font-size: 1em; }
.prose h3 { font-size: 0.9em; }
.prose p  { margin: 0.4em 0; }
.prose ul, .prose ol { padding-left: 1.2em; margin: 0.4em 0; }
.prose li { margin: 0.15em 0; }
.prose strong { font-weight: 600; }
</style>
