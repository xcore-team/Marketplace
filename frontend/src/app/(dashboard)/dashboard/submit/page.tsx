"use client"



import { useState, useRef } from "react"
import { Upload, FileArchive, X, ArrowRight } from "lucide-react"
import Button from "@/components/ui/Button"

export default function SubmitPluginPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (f.name.endsWith(".zip")) setFile(f)
    else alert("Only .zip files are accepted")
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    console.log("Submitting:", file.name)
  }

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

  return (
    <div className="p-8 max-w-2xl mx-auto">

      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Upload size={18} className="text-primary" strokeWidth={1.8} />
          <h1 className="text-xl font-semibold text-foreground">Submit Plugin</h1>
        </div>
        <p className="text-sm text-foreground/50">
          Upload a .zip file containing your plugin to submit it for review
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-2xl p-12
            flex flex-col items-center justify-center gap-3
            cursor-pointer transition-all duration-200
            ${isDragging
              ? "border-primary bg-primary/5"
              : file
                ? "border-primary/30 bg-primary/[0.02]"
                : "border-border hover:border-primary/30 hover:bg-foreground/[0.01]"
            }
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
          />

          {file ? (
      
            <>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileArchive size={22} className="text-primary" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-foreground/40 mt-0.5">{formatSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                className="absolute top-4 right-4 text-foreground/30 hover:text-foreground/60 transition-colors"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </>
          ) : (
       
            <>
              <div className="w-12 h-12 rounded-xl bg-foreground/5 flex items-center justify-center">
                <Upload size={22} className="text-foreground/30" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Drop your .zip file here
                </p>
                <p className="text-xs text-foreground/40 mt-0.5">
                  or click to browse
                </p>
              </div>
            </>
          )}
        </div>


        <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
          <p className="text-xs text-foreground/60 leading-relaxed">
            Your plugin will be automatically scanned through{" "}
            <span className="text-foreground/80 font-medium">9 security gates</span>.
            A score ≤ 30 is auto-approved, 31–79 goes to manual review, ≥ 80 is rejected.
          </p>
        </div>

        <Button
          type="submit"
          fullWidth
          icon={ArrowRight}
          disabled={!file}
        >
          Submit for Review
        </Button>

      </form>
    </div>
  )
}