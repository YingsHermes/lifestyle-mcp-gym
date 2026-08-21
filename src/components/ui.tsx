import type { ReactNode } from "react";

type IconName = "activity" | "agent" | "arrow" | "body" | "calendar" | "check" | "code" | "dumbbell" | "flame" | "plus" | "shield" | "spark" | "trend" | "trophy" | "user";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const shared = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "activity") return <svg {...shared}><path d="M3 12h4l2-7 4 14 2-7h6" /></svg>;
  if (name === "agent") return <svg {...shared}><rect x="4" y="6" width="16" height="13" rx="3" /><path d="M9 11h.01M15 11h.01M9 15h6M12 6V3" /></svg>;
  if (name === "arrow") return <svg {...shared}><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
  if (name === "body") return <svg {...shared}><circle cx="12" cy="5" r="2" /><path d="M8 22l1-7-3-3 2-4 4 2 4-2 2 4-3 3 1 7M9 15h6" /></svg>;
  if (name === "calendar") return <svg {...shared}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
  if (name === "check") return <svg {...shared}><path d="m5 12 4 4L19 6" /></svg>;
  if (name === "code") return <svg {...shared}><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></svg>;
  if (name === "dumbbell") return <svg {...shared}><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" /></svg>;
  if (name === "flame") return <svg {...shared}><path d="M12 22c4 0 7-2.8 7-6.8 0-3.1-1.9-5.2-3.5-7C14 6.6 13 5 13 3c-2.6 1.6-4 4-4.2 6.2-.1 1.3.2 2.4.7 3.4-1-.4-1.8-1.2-2.2-2.4C5.9 11.6 5 13.3 5 15.2 5 19.2 8 22 12 22Z" /></svg>;
  if (name === "plus") return <svg {...shared}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "shield") return <svg {...shared}><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (name === "spark") return <svg {...shared}><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /></svg>;
  if (name === "trend") return <svg {...shared}><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>;
  if (name === "trophy") return <svg {...shared}><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" /></svg>;
  if (name === "user") return <svg {...shared}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-5 4-7 8-7s7 2 8 7" /></svg>;
  return null;
}

export function Brand() {
  return (
    <div className="brand" aria-label="Lifestyle MCP Gym">
      <span className="brand-mark"><Icon name="activity" size={18} /></span>
      <span>Lifestyle <strong>MCP</strong> Gym</span>
    </div>
  );
}

export function InlineNotice({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  return <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span className="spinner-wrap"><span className="spinner" aria-hidden="true" /><span>{label}</span></span>;
}
