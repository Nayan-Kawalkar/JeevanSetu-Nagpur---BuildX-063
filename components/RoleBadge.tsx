"use client";

import { usePathname } from "next/navigation";
import { roleFromPath } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { roleLabelKey } from "@/components/TopNav";
import { useT } from "@/lib/i18n";

/**
 * Which dashboard the reader is standing in, derived from the path.
 *
 * The role names in lib/roles.ts are English constants shared with the API layer, so the badge
 * translates through the same key map the nav uses rather than rendering `label` directly. A
 * role with no key falls back to the English label instead of showing a raw key.
 */
export function RoleBadge() {
  const pathname = usePathname();
  const t = useT();
  const role = roleFromPath(pathname ?? "/");
  if (!role) return <Badge tone="neutral">{t("shell.noRoleSelected")}</Badge>;

  const key = roleLabelKey(role.role);
  const name = key === null ? role.label : t(key);
  return (
    <Badge tone="dark" aria-label={t("shell.currentRole", { role: name })}>
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
      {name}
    </Badge>
  );
}
