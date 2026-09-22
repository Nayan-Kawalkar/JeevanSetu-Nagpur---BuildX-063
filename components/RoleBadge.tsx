"use client";

import { usePathname } from "next/navigation";
import { roleFromPath } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";

export function RoleBadge() {
  const pathname = usePathname();
  const role = roleFromPath(pathname ?? "/");
  if (!role) return <Badge tone="neutral">No role selected</Badge>;
  return (
    <Badge tone="dark" aria-label={`Current role: ${role.label}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
      {role.label}
    </Badge>
  );
}
