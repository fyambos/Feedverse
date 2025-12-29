// mobile/hooks/useCurrentUser.ts
import { useMemo } from "react";
import { useAuth } from "@/context/auth";
import type { User } from "@/data/db/schema";

export function useCurrentUser(): User | null {
  const { isReady, currentUser } = useAuth();

  return useMemo(() => {
    if (!isReady) return null;
    return currentUser ?? null;
  }, [isReady, currentUser]);
}