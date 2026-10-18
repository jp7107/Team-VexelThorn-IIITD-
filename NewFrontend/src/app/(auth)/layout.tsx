import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/icons";
import "../shell.css";

/** Auth pages sit outside the dashboard shell: centered card over a soft farm wash. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="km-auth">
      <main className="km-auth-card km-panel">
        <Link href="/" className="km-auth-brand" aria-label="Kisan Mitra home">
          <BrandMark size={40} />
          <span>
            <span className="km-brand-name">Kisan Mitra</span>
            <span className="km-brand-tag">Smart Farming · Brighter Tomorrow</span>
          </span>
        </Link>
        {children}
      </main>
    </div>
  );
}
