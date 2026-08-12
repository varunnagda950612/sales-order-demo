"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ManishLogoLoader } from "@/components/ManishLogoLoader";

const minimumDisplayMs = 500;
const navigationTimeoutMs = 10_000;

export function RouteLoadingOverlay({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const finishLoading = useCallback(() => {
    const startedAt = startedAtRef.current;

    if (startedAt === null) {
      return;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const remainingMs = Math.max(0, minimumDisplayMs - (Date.now() - startedAt));

    finishTimerRef.current = window.setTimeout(() => {
      startedAtRef.current = null;
      finishTimerRef.current = null;
      setIsLoading(false);
    }, remainingMs);
  }, []);

  const startLoading = useCallback(() => {
    if (startedAtRef.current !== null) {
      return;
    }

    startedAtRef.current = Date.now();
    setIsLoading(true);
    timeoutRef.current = window.setTimeout(() => {
      startedAtRef.current = null;
      timeoutRef.current = null;
      setIsLoading(false);
    }, navigationTimeoutMs);
  }, []);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }

      const link = event.target.closest("a[href]");

      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      ) {
        return;
      }

      const destination = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);

      if (
        destination.origin === current.origin &&
        destination.pathname !== current.pathname
      ) {
        startLoading();
      }
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [startLoading]);

  useEffect(() => {
    if (startedAtRef.current === null) {
      return;
    }

    const routeReadyTimer = window.setTimeout(finishLoading, 0);

    return () => window.clearTimeout(routeReadyTimer);
  }, [finishLoading, pathname]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  return (
    <>
      {children}
      {isLoading ? <ManishLogoLoader overlay /> : null}
    </>
  );
}
