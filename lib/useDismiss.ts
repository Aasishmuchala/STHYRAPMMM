import { useEffect, useRef } from "react";

// Esc-to-close + focus trap + restore focus for modals/drawers (a11y).
// `onClose` is captured in a ref so changes don't tear down + re-establish the
// keydown listener on every parent render — this was the source of flaky Esc
// handling in `DocReader` and the stage-delete modal.
export function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (!el) return;

    const focusables = (): HTMLElement[] => {
      return Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((n) => {
        // visible? offsetParent is null for `position: fixed` so we accept those too
        if (n === document.activeElement) return true;
        const style = window.getComputedStyle(n);
        if (style.visibility === "hidden" || style.display === "none") return false;
        return true;
      });
    };

    // Focus the dialog's heading (a11y best practice), then fall back to first
    // focusable. If no heading, focus the first focusable so Tab can cycle.
    const heading = el.querySelector<HTMLElement>("h1, h2, h3, [data-autofocus]");
    (heading ?? focusables()[0] ?? el)?.focus?.();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") {
        const f = focusables();
        if (f.length === 0) { e.preventDefault(); return; }
        const first = f[0];
        const last = f[f.length - 1];
        if (!first || !last) { e.preventDefault(); return; }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Only restore focus if the element is still attached to the DOM
      if (previouslyFocused && document.contains(previouslyFocused)) {
        try { previouslyFocused.focus?.(); } catch { /* noop */ }
      }
    };
  }, [ref]);
}
