import { ReactNode, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Inbox, Plus, Search } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export const PAGE_SIZE = 10;

export function CrudShell({
  search,
  onSearch,
  onNew,
  newLabel = "New",
  filters,
  loading,
  error,
  empty,
  count,
  page,
  setPage,
  children,
}: {
  search: string;
  onSearch: (v: string) => void;
  onNew?: () => void;
  newLabel?: string;
  filters?: ReactNode;
  loading: boolean;
  error: unknown;
  empty: boolean;
  count: number;
  page: number;
  setPage: (n: number) => void;
  children: ReactNode;
}) {
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return (
    <Card className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-1 gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8"
            />
          </div>
          {filters}
        </div>
        {onNew && (
          <Button onClick={onNew} className="gap-2">
            <Plus className="h-4 w-4" /> {newLabel}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">{(error as Error)?.message ?? "Failed to load."}</p>
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p className="text-sm">Nothing here yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}

      {!loading && !error && count > PAGE_SIZE && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage(Math.max(1, page - 1));
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                {page} / {totalPages}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage(Math.min(totalPages, page + 1));
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </Card>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
