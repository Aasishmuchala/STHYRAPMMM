"use client";

import { toast } from "react-hot-toast";

type ErrorResult = { error: string };

export function isErrorResult(result: unknown): result is ErrorResult {
  return result !== null && typeof result === "object" && "error" in result;
}

export function beginToast(message: string) {
  return toast.loading(message);
}

export function finishToast<T extends object>(
  result: T,
  options: {
    id: string;
    success: string | ((result: Exclude<T, ErrorResult>) => string);
  }
): result is Exclude<T, ErrorResult> {
  if (isErrorResult(result)) {
    toast.error(result.error, { id: options.id });
    return false;
  }

  const message = typeof options.success === "function"
    ? options.success(result as Exclude<T, ErrorResult>)
    : options.success;
  toast.success(message, { id: options.id });
  return true;
}
