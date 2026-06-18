export type TranscriberStatus = 'idle' | 'uploading' | 'transcribing' | 'completed' | 'error'

export interface TranscribeOptions {
  model: string
  language: string
  multilingual: boolean
  task: string
  keyTerms: string
}

export function useTranscriber() {
  const config    = useRuntimeConfig()
  const apiBase   = config.public.apiBase

  const status        = ref<TranscriberStatus>('idle')
  const jobId         = ref<string | null>(null)
  const progress      = ref(0)
  const progressDone  = ref(0)
  const progressTotal = ref(0)
  const detectedLang  = ref('')
  const transcript    = ref('')
  const error         = ref('')

  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function startTranscription(file: File, opts: TranscribeOptions) {
    status.value       = 'uploading'
    error.value        = ''
    transcript.value   = ''
    progress.value     = 0
    detectedLang.value = ''

    const body = new FormData()
    body.append('file',         file)
    body.append('model',        opts.model)
    body.append('language',     opts.language)
    body.append('multilingual', String(opts.multilingual))
    body.append('task',         opts.task)
    body.append('key_terms',    opts.keyTerms)

    try {
      // Use native fetch — more reliable with FormData than $fetch
      const raw = await fetch(`${apiBase}/api/transcribe`, { method: 'POST', body })
      if (!raw.ok) {
        const detail = await raw.json().catch(() => ({}))
        throw new Error(detail?.detail || `Server error ${raw.status}`)
      }
      const res: { job_id: string } = await raw.json()
      jobId.value    = res.job_id
      status.value   = 'transcribing'
      _startPolling()
    } catch (e: any) {
      status.value = 'error'
      error.value  = e?.message?.includes('fetch')
        ? 'Cannot reach server. It may be waking up — wait 30s and try again.'
        : (e?.message || 'Upload failed.')
    }
  }

  function _startPolling() {
    _stopPolling()
    pollTimer = setInterval(async () => {
      if (!jobId.value) return
      try {
        const r = await fetch(`${apiBase}/api/job/${jobId.value}`)
        if (r.status === 404) {
          status.value = 'error'
          error.value  = 'Server restarted mid-job. Please upload your file again.'
          _stopPolling()
          return
        }
        const job = await r.json()
        progress.value      = job.progress ?? 0
        progressDone.value  = job.done     ?? 0
        progressTotal.value = job.total    ?? 0
        if (job.lang)       detectedLang.value = job.lang
        if (job.transcript) transcript.value   = job.transcript

        if (job.status === 'completed') {
          status.value = 'completed'
          _stopPolling()
        } else if (job.status === 'error') {
          status.value = 'error'
          error.value  = job.error || 'Transcription failed.'
          _stopPolling()
        }
      } catch {
        // silently retry on network blip
      }
    }, 2000)
  }

  function _stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  function reset() {
    _stopPolling()
    status.value        = 'idle'
    jobId.value         = null
    progress.value      = 0
    progressDone.value  = 0
    progressTotal.value = 0
    transcript.value    = ''
    error.value         = ''
    detectedLang.value  = ''
  }

  return {
    status, jobId, progress, progressDone, progressTotal,
    detectedLang, transcript, error,
    startTranscription, reset,
  }
}
