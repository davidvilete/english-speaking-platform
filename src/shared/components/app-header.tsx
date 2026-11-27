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

const NAV_BY_ROLE: Record<UserRole, { href: string; label: string }[]> = {
  student: [
    { href: "/student", label: "Início" },
    { href: "/student/screening", label: "Triagem" },
    { href: "/student/schedule", label: "Aulas 1v2" },
    { href: "/student/activities", label: "Atividades" },
  ],
  teacher: [
    { href: "/teacher", label: "Início" },
    { href: "/teacher/screening", label: "Triagens" },
    { href: "/teacher/schedule", label: "Agenda" },
    { href: "/teacher/post-class", label: "Pós-Aula" },
  ],
  admin: [
    { href: "/admin", label: "Início" },
    { href: "/admin/subscriptions", label: "Assinaturas" },
    { href: "/admin/logs", label: "Logs" },
    { href: "/teacher/schedule", label: "Agenda" },
    { href: "/teacher/post-class", label: "Pós-Aula" },
    { href: "/teacher/screening", label: "Triagens" },
  ],
};

interface AppHeaderProps {
  fullName: string;
  role: UserRole;
  timezone: string;
}

export function AppHeader({ fullName, role, timezone }: AppHeaderProps) {
  const navItems = NAV_BY_ROLE[role];

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2.5">
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

          <nav className="flex flex-wrap items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
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
