import { DashboardSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <DashboardSkeleton />
    </div>
  );
}
