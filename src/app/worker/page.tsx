import WorkerDashboard from "@/components/WorkerDashboard";
import Link from "next/link";
import { FolderKanban } from "lucide-react";

export default function WorkerPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-end px-8 pt-6">
        <Link
          href="/worker/projects"
          className="flex items-center gap-2 bg-[#3D5AFE] hover:bg-[#304FFE] text-white px-4 py-2 rounded-lg font-black text-sm uppercase tracking-wider transition-all border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px]"
        >
          <FolderKanban size={15} /> My Assignments
        </Link>
      </div>
      <div className="p-8">
        <WorkerDashboard />
      </div>
    </div>
  );
}
