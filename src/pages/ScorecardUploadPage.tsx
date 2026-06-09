import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type UploadState = 'idle' | 'previewing' | 'uploading' | 'error'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:image/...;base64, prefix
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ScorecardUploadPage() {
  const navigate  = useNavigate()
  const fileRef   = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [state, setState]       = useState<UploadState>('idle')
  const [file, setFile]         = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    if (!picked) return
    setFile(picked)
    setPreviewUrl(URL.createObjectURL(picked))
    setState('previewing')
    setErrorMsg(null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const picked = e.dataTransfer.files?.[0]
    if (!picked || !picked.type.startsWith('image/')) return
    setFile(picked)
    setPreviewUrl(URL.createObjectURL(picked))
    setState('previewing')
    setErrorMsg(null)
  }

  async function handleUpload() {
    if (!file) return
    setState('uploading')
    setErrorMsg(null)

    try {
      const imageBase64 = await fileToBase64(file)
      const mimeType    = file.type || 'image/jpeg'

      const { data, error } = await supabase.functions.invoke('ocr-scorecard', {
        body: { imageBase64, mimeType },
      })

      if (error) throw new Error(error.message)
      if (!data?.gameLog) throw new Error('No game log returned from OCR')

      // Navigate to review screen with the parsed result
      navigate('/games/upload/review', { state: { gameLog: data.gameLog, usage: data.usage } })

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setState('previewing')
    }
  }

  function handleReset() {
    setFile(null)
    setPreviewUrl(null)
    setState('idle')
    setErrorMsg(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="p-4 pb-10 max-w-lg mx-auto">
      <button onClick={() => navigate('/')} className="text-brand-500 dark:text-brand-100 text-sm font-medium mb-4 flex items-center gap-1">
        ‹ Games
      </button>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Upload Scorecard</h1>
      <p className="text-sm text-gray-400 mb-6">
        Take a photo of a handwritten KNBSB scorecard. The image is analysed by AI and converted into a game log you can review and correct before saving.
      </p>

      {/* Drop zone / preview */}
      {state === 'idle' ? (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center py-14 px-6 text-center cursor-pointer hover:border-brand-300 dark:hover:border-blue-600 hover:bg-brand-50 dark:hover:bg-blue-900/20 transition-colors mb-4">
          <div className="text-5xl mb-3">🖼️</div>
          <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Tap to choose a photo</p>
          <p className="text-sm text-gray-400">or drag and drop an image here</p>
          <p className="text-xs text-gray-300 mt-2">JPG, PNG, HEIC — max 20 MB</p>
        </div>
      ) : (
        <div className="mb-4">
          <div className="relative rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 shadow-sm mb-3">
            {previewUrl && (
              <img src={previewUrl} alt="Scorecard preview" className="w-full object-contain max-h-80 bg-gray-50 dark:bg-gray-900" />
            )}
            {state === 'uploading' && (
              <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-brand-500 dark:border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Reading scorecard…</p>
                <p className="text-xs text-gray-400">This usually takes 10–20 seconds</p>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 text-center truncate">{file?.name}</p>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Error */}
      {errorMsg && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">Something went wrong</p>
          <p className="text-xs text-red-500 mt-0.5">{errorMsg}</p>
        </div>
      )}

      {/* Actions */}
      {state === 'previewing' && (
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 py-3.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            Choose different
          </button>
          <button
            onClick={handleUpload}
            className="flex-1 py-3.5 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors">
            Read scorecard
          </button>
        </div>
      )}

      {state === 'idle' && (
        <div className="flex gap-3">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex-1 py-3.5 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors flex items-center justify-center gap-2">
            📷 Take photo
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 py-3.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2">
            🖼️ Choose file
          </button>
        </div>
      )}

      <div className="mt-6 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 mb-1">How it works</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          Your photo is sent securely to an AI model that reads KNBSB scorecard notation. You'll see the results on a review screen where you can correct anything the AI got wrong before the game is saved.
        </p>
      </div>
    </div>
  )
}
