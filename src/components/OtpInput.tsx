"use client";

import { useEffect, useRef, useState } from "react";

interface OtpInputProps {
  onComplete: (code: string) => void;
  onType?: () => void;
  loading?: boolean;
  error?: string | null;
}

export function OtpInput({ onComplete, onType, loading = false, error = null }: OtpInputProps) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const prevErrorRef = useRef<string | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      setCode("");
      inputRef.current?.focus();
    }
    prevErrorRef.current = error;
  }, [error]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(val);
    onType?.();
    if (val.length === 6) onComplete(val);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={handleChange}
        disabled={loading}
        maxLength={6}
        placeholder="000000"
        className="input text-center font-mono py-4"
        style={{
          fontSize: "1.875rem",
          letterSpacing: "0.4em",
          borderColor: error ? "var(--signal-danger-border)" : undefined,
          color: "var(--text-1)",
          maxWidth: 220,
        }}
      />
      {error && (
        <p className="text-xs text-center" style={{ color: "var(--signal-danger)" }}>
          {error}
        </p>
      )}
      {loading && (
        <p className="text-xs" style={{ color: "var(--text-3)" }}>Vérification…</p>
      )}
    </div>
  );
}
