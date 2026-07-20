import { createContext, useContext, useState, type ReactNode } from "react";
import { api, getToken } from "./api";
import { discardChatSessionIfStale } from "./chatApi";

interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "todo-platform-user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(() => {
    if (!getToken()) return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  });

  async function login(email: string, password: string) {
    const { token, user: loggedInUser } = await api.login(email, password);
    // Discard any chat session left over from a different user BEFORE the
    // dashboard user flips over — ChatWidget mounts fresh right after this
    // and must not find a stale session bridged to someone else's identity.
    await discardChatSessionIfStale(loggedInUser.id);
    localStorage.setItem("token", token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedInUser));
    setUser(loggedInUser);
  }

  function logout() {
    // Fire-and-forget: sign-out should feel instant, not wait on a network
    // call to the Agent. ChatWidget unmounts as part of this same update, so
    // nothing else needs the chat session gone before this function returns.
    void discardChatSessionIfStale(null);
    localStorage.removeItem("token");
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
