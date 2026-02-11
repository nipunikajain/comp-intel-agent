"use client";

import { useState, useEffect } from "react";
import { PasswordGate, SESSION_KEY } from "./PasswordGate";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      setAuthenticated(stored === "true");
    } catch {
      setAuthenticated(false);
    }
  }, []);

  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (!authenticated) {
    return <PasswordGate onSuccess={() => setAuthenticated(true)} />;
  }

  return <>{children}</>;
}
