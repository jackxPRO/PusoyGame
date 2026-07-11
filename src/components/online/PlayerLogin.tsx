"use client";

import { useState } from "react";
import { useOnline } from "@/lib/store/online-context";
import { useBranding } from "../BackgroundManager";
import { GoldButton, Panel } from "../ui";

export function PlayerLogin() {
  const { login, connecting, error } = useOnline();
  const { logo, siteName } = useBranding();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = () => {
    if (!username.trim() || !password) return;
    void login(username.trim(), password);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center fade-up">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="mx-auto mb-3 h-20 w-20 rounded-2xl object-contain" />
        ) : null}
        <p className="text-xs uppercase tracking-[0.35em] text-gold/70">DOROXXX</p>
        <h1 className="mt-1 text-4xl font-black gold-text">{siteName}</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in with your player account.</p>
      </div>

      <Panel className="fade-up">
        <label className="mb-3 flex flex-col gap-1">
          <span className="text-xs text-slate-400">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 outline-none focus:border-gold/60"
          />
        </label>
        <label className="mb-3 flex flex-col gap-1">
          <span className="text-xs text-slate-400">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 outline-none focus:border-gold/60"
          />
        </label>
        {error ? <p className="mb-3 text-sm text-rose-400">{error}</p> : null}
        <GoldButton
          onClick={submit}
          disabled={connecting || !username.trim() || !password}
          className="w-full"
        >
          {connecting ? "Signing in\u2026" : "Sign In"}
        </GoldButton>
        <p className="mt-3 text-center text-xs text-slate-500">
          Accounts are created by the admin. Ask them for your username and password.
        </p>
      </Panel>
    </div>
  );
}
