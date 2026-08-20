import type { ReactNode } from "react";

type IconName = "activity" | "agent" | "arrow" | "body" | "check" | "code" | "dumbbell" | "plus" | "shield" | "spark" | "user";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const shared = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "activity") return <svg {...shared}><path d="M3 12h4l2-7 4 14 2-7h6" /></svg>;
  if (name === "agent") return <svg {...shared}><rect x="4" y="6" width="16" height="13" rx="3" /><path d="M9 11h.01M15 11h.01M9 15h6M12 6V3" /></svg>;
  if (name === "arrow") return <svg {...shared}><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
  if (name === "body") return <svg {...shared}><circle cx="12" cy="5" r="2" /><path d="M8 22l1-7-3-3 2-4 4 2 4-2 2 4-3 3 1 7M9 15h6" /></svg>;
  if (name === "check") return <svg {...shared}><path d="m5 12 4 4L19 6" /></svg>;
  if (name === "code") return <svg {...shared}><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></svg>;
  if (name === "dumbbell") return <svg {...shared}><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" /></svg>;
  if (name === "plus") return <svg {...shared}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "shield") return <svg {...shared}><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (name === "spark") return <svg {...shared}><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /></svg>;
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
