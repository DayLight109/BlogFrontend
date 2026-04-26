"use client";

import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function statusVariant(s: number): "default" | "secondary" | "destructive" {
  if (s >= 500) return "destructive";
  if (s >= 400) return "destructive";
  if (s >= 300) return "secondary";
  return "default";
}

export default function AdminAuditPage() {
  const token = useAuth((s) => s.accessToken);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "audit"],
    enabled: !!token,
    queryFn: () => api.adminListAudit(token!, { size: 100 }),
  });

  const items = data?.items ?? [];

  return (
    <section className="space-y-6">
      <header>
        <p className="caps text-muted-foreground">Audit · 审计日志</p>
        <h1 className="mt-1 font-display text-3xl font-medium tracking-tight md:text-4xl">
          Admin actions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          所有写操作(POST / PUT / PATCH / DELETE)都会留痕,方便追踪谁在何时做了什么。只读。
        </p>
      </header>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="py-10 text-center">
                    <History className="mx-auto mb-3 size-7 text-muted-foreground/40" strokeWidth={1.4} />
                    <p className="font-display italic text-muted-foreground">
                      No audit entries yet.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {items.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="tabular text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(e.createdAt)}
                </TableCell>
                <TableCell className="font-medium">{e.username}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono">
                    {e.method}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {e.path}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {e.ip || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
