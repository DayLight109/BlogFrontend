"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { User } from "./types";

interface AuthState {
  accessToken: string | null;
  expiresAt: number | null;
  user: User | null;
  setAuth: (token: string, expiresAt: number, user: User) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      expiresAt: null,
      user: null,
      setAuth: (accessToken, expiresAt, user) =>
        set({ accessToken, expiresAt, user }),
      clear: () => set({ accessToken: null, expiresAt: null, user: null }),
    }),
    {
      name: "blog-auth",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
