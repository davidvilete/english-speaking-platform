import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/modules/auth/actions";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import type { UserRole } from "@/shared/types/database";

const ROLE_LABELS: Record<UserRole, string> = {
  student: "Aluno",
  teacher: "Professor",
  admin: "Admin",
};

interface AppHeaderProps {
  fullName: string;
  role: UserRole;
  timezone: string;
}

export function AppHeader({ fullName, role, timezone }: AppHeaderProps) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href={
              role === "student"
                ? "/student"
                : role === "teacher"
                  ? "/teacher"
                  : "/admin"
            }
            className="text-base font-semibold tracking-tight"
          >
            Output 1v2
          </Link>
          <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-none">{fullName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{timezone}</p>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
