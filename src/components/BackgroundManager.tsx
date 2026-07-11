"use client";

import { useEffect } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

export function applyBackground(value: string | null | undefined) {
  if (typeof document === "undefined") return;
  const body = document.body;
  if (!value || value === "default") {
    body.removeAttribute("data-bg");
    body.style.backgroundImage = "";
    return;
  }
  if (/^https?:\/\//i.test(value)) {
    body.removeAttribute("data-bg");
    body.style.backgroundImage = `linear-gradient(rgba(3,5,10,0.65), rgba(3,5,10,0.85)), url("${value}")`;
  } else {
    body.style.backgroundImage = "";
    body.dataset.bg = value;
  }
}

/** Applies the admin-selected background globally and live-updates on change. */
export function BackgroundManager() {
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    let active = true;

    void (async () => {
      const { data } = await supabase
        .from("app_config")
        .select("background")
        .eq("id", 1)
        .maybeSingle();
      if (active && data) applyBackground((data as { background: string }).background);
    })();

    const channel = supabase
      .channel("app_config")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_config" },
        (payload) => {
          const bg = (payload.new as { background?: string } | null)?.background;
          applyBackground(bg);
        },
      )
      .subscribe();

    return () => {
      active = false;
      channel.unsubscribe();
    };
  }, []);

  return null;
}
