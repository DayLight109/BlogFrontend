"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  LayoutDashboard,
  FileText,
  MessagesSquare,
  Tag as TagIcon,
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
} from "lucide-react";

import { useAuth } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, user, clear } = useAuth();

  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (!isLogin && !accessToken) {
      router.replace("/admin/login");
    }
  }, [isLogin, accessToken, router]);

  if (isLogin) return <>{children}</>;
  if (!accessToken) return null;

  async function onLogout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    clear();
    router.replace("/admin/login");
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="px-6 py-6">
          <Link href="/admin" className="block">
            <p className="font-display text-xl font-medium leading-none tracking-tight">
              Kiri{" "}
              <span className="text-sm italic font-normal text-site-accent">
                · admin
              </span>
            </p>
            <p className="caps mt-1 text-[0.65rem] text-muted-foreground">
              control room · 控制台
            </p>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-2">
          <ul className="space-y-0.5">
            <SideNavItem
              href="/admin"
              icon={LayoutDashboard}
              label="Dashboard"
              active={pathname === "/admin"}
            />
            <SideNavItem
              href="/admin/posts"
              icon={FileText}
              label="Posts"
              active={pathname.startsWith("/admin/posts")}
            />
            <SideNavItem
              href="/admin/comments"
              icon={MessagesSquare}
              label="Comments"
              active={pathname.startsWith("/admin/comments")}
            />
            <SideNavItem
              href="/admin/tags"
              icon={TagIcon}
              label="Tags"
              active={pathname.startsWith("/admin/tags")}
            />
            <SideNavItem
              href="/admin/settings"
              icon={SettingsIcon}
              label="Settings"
              active={pathname.startsWith("/admin/settings")}
            />
          </ul>

          <div className="my-5 h-px bg-border" />

          <Link
            href="/"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-4" strokeWidth={1.6} />
            View site
          </Link>
        </nav>

        <div className="border-t border-border px-4 py-4">
          <div className="mb-3 text-xs">
            <p className="font-medium text-foreground">
              {user?.displayName ?? user?.username ?? "—"}
            </p>
            <p className="text-muted-foreground">{user?.role ?? ""}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2"
            onClick={onLogout}
          >
            <LogOut className="size-3.5" strokeWidth={1.6} />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <Link href="/admin" className="font-display text-lg font-medium">
          Kiri admin
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="caps text-xs text-muted-foreground"
          >
            View site
          </Link>
          <Button variant="outline" size="sm" onClick={onLogout}>
            <LogOut className="size-3.5" strokeWidth={1.6} />
          </Button>
        </div>
      </header>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}

function SideNavItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          active
            ? "bg-site-accent-ghost text-site-accent"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon className="size-4" strokeWidth={1.6} />
        <span>{label}</span>
        {active && (
          <span
            aria-hidden
            className="ml-auto size-1.5 rounded-full bg-site-accent"
          />
        )}
      </Link>
    </li>
  );
}
