import { DevGate } from "@/components/dev-gate";

export default function DevToolsLayout({ children }: { children: React.ReactNode }) {
  return <DevGate>{children}</DevGate>;
}
