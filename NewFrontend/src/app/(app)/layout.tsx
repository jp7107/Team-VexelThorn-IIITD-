import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import "../shell.css";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
