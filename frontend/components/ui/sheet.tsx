"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Sheet({ open, onOpenChange, title, children, className }: SheetProps) {
  const handleClose = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [open, handleClose]);

  if (!open) return null;

  const content = (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity"
        aria-hidden
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={title ? "sheet-title" : undefined}
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full max-w-lg bg-white shadow-xl",
          "animate-in slide-in-from-right duration-300",
          "flex flex-col"
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          {title && (
            <h2 id="sheet-title" className="text-lg font-semibold text-gray-900">
              {title}
            </h2>
          )}
          <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className={cn("flex-1 overflow-y-auto px-4 py-4", className)}>{children}</div>
      </div>
    </>
  );

  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
}
