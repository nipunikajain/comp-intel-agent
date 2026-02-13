"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setStoredAccessCode } from "@/lib/api";

const SESSION_KEY = "ci_authenticated";

const API_BASE =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface PasswordGateProps {
  onSuccess: () => void;
}

export function PasswordGate({ onSuccess }: PasswordGateProps) {
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!accessCode.trim()) {
      setError("Please enter an access code.");
      return;
    }
    setSubmitting(true);

    console.log("Sending access code header", accessCode);
    console.log("Request URL", process.env.NEXT_PUBLIC_API_URL ?? API_BASE);

    try {
      const res = await fetch(`${API_BASE}/monitors`, {
        method: "GET",
        headers: {
          "x-access-code": accessCode,
        },
      });

      if (res.status === 401) {
        setError("Invalid access code.");
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      try {
        sessionStorage.setItem(SESSION_KEY, "true");
        setStoredAccessCode(accessCode);
      } catch {
        // ignore
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
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
            value={accessCode}
            onChange={(e) => {
              setAccessCode(e.target.value);
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
