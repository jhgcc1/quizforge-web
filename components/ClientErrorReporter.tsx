"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/client-log";

/** Sends uncaught browser errors and unhandled promise rejections to /bff/client-log. Renders nothing. */
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.error ?? e.message, "window");
    const onRejection = (e: PromiseRejectionEvent) => reportClientError(e.reason, "promise");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
