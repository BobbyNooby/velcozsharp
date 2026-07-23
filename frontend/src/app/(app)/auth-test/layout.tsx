import { DevGate } from "@/components/dev-gate";

export default function AuthTestLayout({ children }: { children: React.ReactNode }) {
  return <DevGate>{children}</DevGate>;
}
