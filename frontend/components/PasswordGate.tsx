"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SESSION_KEY = "ci_authenticated";

export interface PasswordGateProps {
  onSuccess: () => void;
}

export function PasswordGate({ onSuccess }: PasswordGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const accessCode =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_ACCESS_CODE ?? "").trim()
      : "";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!password.trim()) {
      setError("Please enter an access code.");
      return;
    }
    setSubmitting(true);
    const matches =
      accessCode !== "" && password.trim() === accessCode;
    setSubmitting(false);
    if (matches) {
      try {
        sessionStorage.setItem(SESSION_KEY, "true");
      } catch {
        // ignore
      }
      onSuccess();
    } else {
      setError("Invalid access code.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-gray-900">
          Competitive Intelligence Platform
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Enter access code to continue
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            type="password"
            placeholder="Access code"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            autoFocus
            autoComplete="current-password"
            className="w-full"
            disabled={submitting}
          />
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={submitting}
          >
            Enter
          </Button>
        </form>
      </div>
    </div>
  );
}

export { SESSION_KEY };
