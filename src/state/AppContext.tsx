import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { db } from "../lib/db";
import type { AppSettings, AppUser, RuleDef, RuleVersion } from "../lib/types";
import { DEMO_SETTINGS, DEMO_RULE_VERSION } from "../data/seedRules";

interface AppState {
  user: AppUser | null;
  authReady: boolean;
  isDemo: boolean;
  settings: AppSettings;
  rules: RuleDef[];
  ruleVersion: RuleVersion;
  refreshUser: () => Promise<void>;
  refreshRules: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AppUser>;
  signUp: (email: string, password: string, name: string) => Promise<{ user: AppUser | null; needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState>({
  user: null,
  authReady: false,
  isDemo: true,
  settings: DEMO_SETTINGS,
  rules: [],
  ruleVersion: DEMO_RULE_VERSION,
  refreshUser: async () => {},
  refreshRules: async () => {},
  signIn: async () => ({ id: "", email: "", name: "", role: "user", created_at: "" }),
  signUp: async () => ({ user: null, needsEmailConfirm: false }),
  signOut: async () => {},
});

export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEMO_SETTINGS);
  const [rules, setRules] = useState<RuleDef[]>([]);
  const [ruleVersion, setRuleVersion] = useState<RuleVersion>(DEMO_RULE_VERSION);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await db.currentUser());
    } catch {
      setUser(null);
    }
  }, []);

  const refreshRules = useCallback(async () => {
    try {
      const [r, s, v] = await Promise.all([db.listRules(), db.getSettings(), db.getRuleVersion()]);
      setRules(r);
      setSettings(s);
      setRuleVersion(v);
    } catch {
      /* правила остаются предыдущими */
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([refreshUser(), refreshRules()]);
      setAuthReady(true);
    })();
  }, [refreshUser, refreshRules]);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await db.signIn(email, password);
    setUser(u);
    return u;
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const res = await db.signUp(email, password, name);
    if (res.user) setUser(res.user);
    return res;
  }, []);

  const signOut = useCallback(async () => {
    await db.signOut();
    setUser(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        authReady,
        isDemo: db.mode === "local",
        settings,
        rules,
        ruleVersion,
        refreshUser,
        refreshRules,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
