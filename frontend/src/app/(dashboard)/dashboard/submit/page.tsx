"use client"

import { useState, useRef } from "react"
import { Upload, FileArchive, X, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import Button from "@/components/ui/Button"
import { submitPlugin } from "@/services/submissionService"

export default function SubmitPluginPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [pluginName, setPluginName] = useState("")
  const [pluginVersion, setPluginVersion] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (f.name.endsWith(".zip")) { setFile(f); setError(null) }
    else setError("Only .zip files are accepted")
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  const canSubmit = !!file && pluginName.trim().length > 0 && pluginVersion.trim().length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !canSubmit) return
    setIsLoading(true)
    setError(null)
    try {
      const submission = await submitPlugin(file, pluginName.trim(), pluginVersion.trim())
      router.push(`/dashboard/submissions/${submission.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setIsLoading(false)
    }
  }

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Upload size={18} className="text-primary" strokeWidth={1.8} />
          <h1 className="text-xl font-semibold text-foreground">Submit Plugin</h1>
        </div>
        <p className="text-sm text-foreground/50">Upload a .zip file containing your plugin to submit it for review</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Champ Nom */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/60 uppercase tracking-wider">Plugin Name</label>
          <input
            type="text"
            value={pluginName}
            onChange={(e) => setPluginName(e.target.value)}
            placeholder="my-awesome-plugin"
            className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        {/* Champ Version */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/60 uppercase tracking-wider">Version</label>
          <input
            type="text"
            value={pluginVersion}
            onChange={(e) => setPluginVersion(e.target.value)}
            placeholder="1.0.0"
            className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        {/* Zone drop */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200 ${isDragging ? "border-primary bg-primary/5" : file ? "border-primary/30 bg-primary/[0.02]" : "border-border hover:border-primary/30"}`}
        >
          <input ref={inputRef} type="file" accept=".zip" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />

          {file ? (
            <>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileArchive size={22} className="text-primary" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-foreground/40 mt-0.5">{formatSize(file.size)}</p>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null) }}
                className="absolute top-4 right-4 text-foreground/30 hover:text-foreground/60 transition-colors">
                <X size={16} strokeWidth={2} />
              </button>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-foreground/5 flex items-center justify-center">
                <Upload size={22} className="text-foreground/30" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Drop your .zip file here</p>
                <p className="text-xs text-foreground/40 mt-0.5">or click to browse</p>
              </div>
            </>
          )}
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
          <p className="text-xs text-foreground/60 leading-relaxed">
            Your plugin will be scanned through <span className="text-foreground/80 font-medium">9 security gates</span>.
            Score ≤ 30 → auto-approved · 31–79 → manual review · ≥ 80 → rejected.
          </p>
        </div>

        <Button type="submit" fullWidth icon={ArrowRight} disabled={!canSubmit} isLoading={isLoading}>
          Submit for Review
        </Button>
      </form>
    </div>
  )
}