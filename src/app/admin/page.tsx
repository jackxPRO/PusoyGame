"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { applyBackground } from "@/components/BackgroundManager";
import { GhostButton, GoldButton, Panel, SectionTitle } from "@/components/ui";

interface Account {
  id: string;
  username: string;
  balance: number;
  is_admin: boolean;
}

const ADMIN_KEY = "pusoy_admin_id";
const BG_PRESETS = ["default", "emerald", "crimson", "royal", "midnight", "gold"];
const inputCls =
  "rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none focus:border-gold/60";

export default function AdminPage() {
  const [admin, setAdmin] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Login form
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // Add-player form
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newBalance, setNewBalance] = useState("0");

  // Top-up amounts per account id
  const [topUps, setTopUps] = useState<Record<string, string>>({});

  // Background config
  const [bg, setBg] = useState("default");
  const [customBg, setCustomBg] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadAccounts = useCallback(async () => {
    const { data } = await getSupabase()
      .from("accounts")
      .select("id,username,balance,is_admin")
      .order("username");
    setAccounts((data as Account[]) ?? []);
  }, []);

  const loadConfig = useCallback(async () => {
    const { data } = await getSupabase()
      .from("app_config")
      .select("background")
      .eq("id", 1)
      .maybeSingle();
    if (data) setBg((data as { background: string }).background);
  }, []);

  const saveBackground = async (value: string) => {
    setBg(value);
    applyBackground(value);
    await getSupabase()
      .from("app_config")
      .update({ background: value, updated_at: new Date().toISOString() })
      .eq("id", 1);
  };

  const uploadBackground = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const supabase = getSupabase();
      const ext = file.name.split(".").pop() || "png";
      const path = `bg-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("backgrounds")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("backgrounds").getPublicUrl(path);
      await saveBackground(data.publicUrl);
      setCustomBg(data.publicUrl);
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} — create a public 'backgrounds' storage bucket.`
          : "Upload failed.",
      );
    } finally {
      setUploading(false);
    }
  };

  // Restore admin session on mount.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const id = typeof window !== "undefined" ? localStorage.getItem(ADMIN_KEY) : null;
    void (async () => {
      if (id) {
        const { data } = await getSupabase()
          .from("accounts")
          .select("id,username,balance,is_admin")
          .eq("id", id)
          .eq("is_admin", true)
          .maybeSingle();
        if (data) {
          setAdmin(data as Account);
          await loadAccounts();
          await loadConfig();
        } else {
          localStorage.removeItem(ADMIN_KEY);
        }
      }
      setReady(true);
    })();
  }, [loadAccounts, loadConfig]);

  const login = async () => {
    setError("");
    const { data } = await getSupabase()
      .from("accounts")
      .select("id,username,balance,is_admin")
      .eq("username", loginUser.trim())
      .eq("password", loginPass)
      .eq("is_admin", true)
      .maybeSingle();
    if (!data) {
      setError("Invalid admin credentials.");
      return;
    }
    setAdmin(data as Account);
    localStorage.setItem(ADMIN_KEY, (data as Account).id);
    await loadAccounts();
    await loadConfig();
  };

  const logout = () => {
    localStorage.removeItem(ADMIN_KEY);
    setAdmin(null);
    setAccounts([]);
  };

  const addPlayer = async () => {
    setError("");
    if (!newUser.trim() || !newPass) {
      setError("Username and password are required.");
      return;
    }
    const { error: err } = await getSupabase().from("accounts").insert({
      username: newUser.trim(),
      password: newPass,
      balance: Number(newBalance) || 0,
      is_admin: false,
    });
    if (err) {
      setError(err.message.includes("duplicate") ? "Username already exists." : err.message);
      return;
    }
    setNewUser("");
    setNewPass("");
    setNewBalance("0");
    await loadAccounts();
  };

  const topUp = async (acc: Account) => {
    setError("");
    const amount = Number(topUps[acc.id]);
    if (!amount) return;
    const { error: err } = await getSupabase()
      .from("accounts")
      .update({ balance: acc.balance + amount })
      .eq("id", acc.id);
    if (err) {
      setError(err.message);
      return;
    }
    setTopUps((cur) => ({ ...cur, [acc.id]: "" }));
    await loadAccounts();
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
        <Panel>Supabase is not configured.</Panel>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading&hellip;
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-black gold-text">Admin Login</h1>
        </div>
        <Panel className="flex flex-col gap-3">
          <input
            className={inputCls}
            placeholder="Username"
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
          />
          <input
            className={inputCls}
            type="password"
            placeholder="Password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
          />
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <GoldButton onClick={login} className="w-full">
            Log In
          </GoldButton>
        </Panel>
      </div>
    );
  }

  const players = accounts.filter((a) => !a.is_admin);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black gold-text">Admin</h1>
          <p className="text-sm text-slate-400">Signed in as {admin.username}</p>
        </div>
        <GhostButton onClick={logout}>Log out</GhostButton>
      </header>

      {error ? <p className="mb-4 text-sm text-rose-400">{error}</p> : null}

      <Panel className="mb-5">
        <SectionTitle>Background</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {BG_PRESETS.map((p) => (
            <GhostButton key={p} active={bg === p} onClick={() => void saveBackground(p)}>
              {p}
            </GhostButton>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className={`${inputCls} min-w-0 flex-1`}
            placeholder="Custom image URL (https://\u2026)"
            value={customBg}
            onChange={(e) => setCustomBg(e.target.value)}
          />
          <GoldButton
            onClick={() => {
              if (customBg.trim()) void saveBackground(customBg.trim());
            }}
            disabled={!customBg.trim()}
          >
            Apply URL
          </GoldButton>
        </div>
        <div className="mt-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:border-white/25">
            {uploading ? "Uploading\u2026" : "Upload image\u2026"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadBackground(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Applies to everyone instantly. Current: <span className="text-gold">{bg}</span>
        </p>
      </Panel>

      <Panel className="mb-5">
        <SectionTitle>Add Player</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-4">
          <input
            className={inputCls}
            placeholder="Username"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
          />
          <input
            className={inputCls}
            type="password"
            placeholder="Password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
          />
          <input
            className={inputCls}
            type="number"
            placeholder="Starting balance"
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value)}
          />
          <GoldButton onClick={addPlayer}>Add Player</GoldButton>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Players ({players.length})</SectionTitle>
        {players.length === 0 ? (
          <p className="text-sm text-slate-500">No players yet.</p>
        ) : (
          <div className="grid gap-2">
            {players.map((acc) => (
              <div
                key={acc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-100">{acc.username}</span>
                  <span className="text-xs text-slate-400">
                    balance <span className="font-bold text-gold">{acc.balance}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className={`${inputCls} w-28`}
                    type="number"
                    placeholder="Amount"
                    value={topUps[acc.id] ?? ""}
                    onChange={(e) =>
                      setTopUps((cur) => ({ ...cur, [acc.id]: e.target.value }))
                    }
                  />
                  <GhostButton onClick={() => topUp(acc)}>Top up</GhostButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
