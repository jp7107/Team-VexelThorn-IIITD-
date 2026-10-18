"use client";

import type { ReactNode } from "react";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { FarmScene } from "@/components/shell/Scenery";

/**
 * Desktop shell: fixed 263 px sidebar + scrolling workspace. The header and the lower sidebar carry
 * the decorative farm scenery from the reference (aria-hidden).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="km-shell">
      <a href="#main" className="km-skip">
        Skip to content
      </a>
      <aside className="km-sidebar">
        <Sidebar />
        <FarmScene />
      </aside>
      <div className="km-workspace">
        <Header />
        <main id="main" className="km-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
