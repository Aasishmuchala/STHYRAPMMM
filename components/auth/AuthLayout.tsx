import type { ReactNode } from "react";
import { FiCheckCircle, FiMapPin, FiZap } from "react-icons/fi";

// Production-grade split-screen auth shell: a branded gradient panel on the left
// (desktop) and a clean, theme-aware form column on the right. Styling lives in
// app/globals.css under `.auth-*` (a real stylesheet, in <head>) so there is no
// flash of unstyled content when navigating between /login and /signup.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-root">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-brand-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sthyra-mark.png" alt="Sthyra" className="auth-mark" />
            <div>
              <div className="auth-word">STHYRA</div>
              <div className="auth-word-sub">Redefining Reality</div>
            </div>
          </div>

          <div className="auth-brand-mid">
            <div className="auth-eyebrow">Command Center</div>
            <h2 className="auth-headline">
              One workspace for your <span>whole business.</span>
            </h2>
            <p className="auth-lede">
              Projects, finances, tasks, people and geo-verified attendance — for every company you run,
              cleanly separated and always in sync.
            </p>
            <ul className="auth-features">
              <li><FiZap aria-hidden /> <span>Tasks, roadmaps &amp; finances in one place</span></li>
              <li><FiCheckCircle aria-hidden /> <span>Role-based access — everyone sees just their part</span></li>
              <li><FiMapPin aria-hidden /> <span>Geofenced attendance, right from a phone</span></li>
            </ul>
          </div>

          <div className="auth-brand-foot">© Sthyra · Internal access only</div>
        </div>

        <div className="auth-orb auth-orb-a" aria-hidden />
        <div className="auth-orb auth-orb-b" aria-hidden />
        <div className="auth-grid" aria-hidden />
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          {/* Compact brand mark for mobile, where the left panel is hidden. */}
          <div className="auth-card-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sthyra-mark.png" alt="Sthyra" className="auth-card-mark" />
            <span>STHYRA</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
