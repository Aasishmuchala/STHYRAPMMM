"use client";

import type { ReactNode } from "react";
import { FiCheckCircle, FiMapPin, FiZap } from "react-icons/fi";

// Production-grade split-screen auth shell: a branded gradient panel on the left
// (desktop) and a clean, theme-aware form column on the right. All form styling
// is exposed via global `.auth-*` classes so the login/signup pages stay lean.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-root">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-brand-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sthyra-mark.png" alt="" className="auth-mark" />
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

          <div className="auth-brand-foot">© {"Sthyra"} · Internal access only</div>
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

      <style jsx global>{`
        .auth-root {
          min-height: 100dvh;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          background: var(--bg, #0b1220);
          color: var(--text, #e7ecf3);
        }
        /* ── Brand panel ─────────────────────────────────────────────── */
        .auth-brand {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(120% 120% at 100% 0%, #1b2a4a 0%, #0c1730 45%, #070d1c 100%);
          color: #eef3fb;
          display: flex;
        }
        .auth-brand-inner {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 40px;
          padding: clamp(36px, 5vw, 68px);
          width: 100%;
        }
        .auth-brand-top { display: flex; align-items: center; gap: 13px; }
        .auth-mark { width: 40px; height: 40px; object-fit: contain; }
        .auth-word { font-weight: 700; letter-spacing: 0.26em; font-size: 15px; }
        .auth-word-sub { font-size: 11px; letter-spacing: 0.14em; color: #93a4c4; margin-top: 2px; }
        .auth-eyebrow {
          display: inline-block;
          font-size: 11.5px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
          color: #7fa9ff;
          padding: 6px 12px; border-radius: 999px;
          background: rgba(93, 140, 255, 0.12);
          border: 1px solid rgba(120, 160, 255, 0.22);
          margin-bottom: 20px;
        }
        .auth-headline {
          font-size: clamp(30px, 3.4vw, 46px);
          line-height: 1.08; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 16px;
        }
        .auth-headline span {
          background: linear-gradient(90deg, #7fb0ff, #b79bff);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .auth-lede { color: #aebbd4; font-size: 15px; line-height: 1.6; max-width: 42ch; margin: 0 0 28px; }
        .auth-features { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
        .auth-features li { display: flex; align-items: center; gap: 12px; font-size: 14.5px; color: #d5deee; }
        .auth-features svg { color: #7fb0ff; flex-shrink: 0; width: 19px; height: 19px; }
        .auth-brand-foot { font-size: 12px; color: #7f8eab; }
        .auth-orb { position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.55; z-index: 1; }
        .auth-orb-a { width: 380px; height: 380px; background: #3b6dff; top: -90px; right: -80px; }
        .auth-orb-b { width: 320px; height: 320px; background: #7c4dff; bottom: -110px; left: -60px; opacity: 0.4; }
        .auth-grid {
          position: absolute; inset: 0; z-index: 1; opacity: 0.5;
          background-image:
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: radial-gradient(120% 90% at 50% 0%, #000 30%, transparent 78%);
        }
        /* ── Form panel ──────────────────────────────────────────────── */
        .auth-panel {
          display: grid; place-items: center; padding: 32px 24px;
          background: var(--bg, #0b1220);
        }
        .auth-card { width: 100%; max-width: 400px; }
        .auth-card-brand { display: none; align-items: center; gap: 9px; margin-bottom: 26px; font-weight: 700; letter-spacing: 0.2em; font-size: 14px; }
        .auth-card-mark { width: 30px; height: 30px; object-fit: contain; }
        .auth-title { font-size: 27px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 6px; }
        .auth-subtitle { color: var(--text-dim, #93a1b8); font-size: 14px; line-height: 1.55; margin: 0 0 28px; }
        .auth-form { display: flex; flex-direction: column; gap: 17px; }
        .auth-field { display: flex; flex-direction: column; gap: 7px; }
        .auth-label { font-size: 12.5px; font-weight: 600; color: var(--text-dim, #93a1b8); }
        .auth-input {
          width: 100%; padding: 12px 14px; border-radius: 11px;
          background: var(--glass, rgba(255,255,255,0.04));
          border: 1px solid var(--line, rgba(255,255,255,0.1));
          color: var(--text, #e7ecf3); font-size: 14.5px; font-family: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          outline: none;
        }
        .auth-input::placeholder { color: color-mix(in srgb, var(--text-dim, #93a1b8) 75%, transparent); }
        .auth-input:focus {
          border-color: var(--accent, #5d8cff);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #5d8cff) 22%, transparent);
        }
        .auth-hint { font-size: 12px; color: var(--text-dim, #93a1b8); margin: 2px 0 0; }
        .auth-btn {
          width: 100%; justify-content: center; padding: 12.5px 16px; margin-top: 6px;
          border: none; border-radius: 11px; cursor: pointer;
          font-size: 14.5px; font-weight: 650; color: #fff;
          background: linear-gradient(180deg, color-mix(in srgb, var(--accent, #5d8cff) 92%, #fff 8%), var(--accent, #5d8cff));
          box-shadow: 0 8px 22px -8px color-mix(in srgb, var(--accent, #5d8cff) 70%, transparent);
          transition: transform 0.12s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        }
        .auth-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 26px -8px color-mix(in srgb, var(--accent, #5d8cff) 78%, transparent); }
        .auth-btn:active:not(:disabled) { transform: translateY(0); }
        .auth-btn:disabled { opacity: 0.65; cursor: default; }
        .auth-note {
          font-size: 12.5px; border-radius: 10px; padding: 10px 12px; line-height: 1.45;
        }
        .auth-note.err { color: var(--danger, #f2789a); background: color-mix(in srgb, var(--danger, #f2789a) 10%, transparent); border: 1px solid color-mix(in srgb, var(--danger, #f2789a) 28%, transparent); }
        .auth-note.ok { color: var(--positive, #4ec98b); background: color-mix(in srgb, var(--positive, #4ec98b) 10%, transparent); border: 1px solid color-mix(in srgb, var(--positive, #4ec98b) 28%, transparent); }
        .auth-switch { margin-top: 22px; font-size: 13px; color: var(--text-dim, #93a1b8); text-align: center; }
        .auth-link { color: var(--accent, #5d8cff); font-weight: 600; text-decoration: none; }
        .auth-link:hover { text-decoration: underline; }
        /* ── Responsive ──────────────────────────────────────────────── */
        @media (max-width: 900px) {
          .auth-root { grid-template-columns: 1fr; }
          .auth-brand { display: none; }
          .auth-card-brand { display: flex; }
        }
      `}</style>
    </div>
  );
}
