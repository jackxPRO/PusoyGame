"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

export const DEFAULT_SITE_NAME = "Pyat-Pyat";

interface AppConfig {
  background?: string | null;
  logo?: string | null;
  site_name?: string | null;
}

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

/** Point the browser tab favicon at the uploaded logo (or leave the default). */
export function applyFavicon(url: string | null | undefined) {
  if (typeof document === "undefined" || !url) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

export function applyTitle(name: string | null | undefined) {
  if (typeof document === "undefined" || !name) return;
  document.title = name;
}

interface BrandingValue {
  logo: string | null;
  siteName: string;
}

const BrandingContext = createContext<BrandingValue>({ logo: null, siteName: DEFAULT_SITE_NAME });

export function useBranding(): BrandingValue {
  return useContext(BrandingContext);
}

/**
 * Loads the admin-managed branding/background config, applies it globally
 * (background, favicon, tab title) and exposes the logo + site name to the UI.
 * Live-updates on config change.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [logo, setLogo] = useState<string | null>(null);
  const [siteName, setSiteName] = useState(DEFAULT_SITE_NAME);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    let active = true;

    const apply = (cfg: AppConfig | null | undefined) => {
      if (!cfg) return;
      applyBackground(cfg.background);
      applyFavicon(cfg.logo);
      const name = cfg.site_name || DEFAULT_SITE_NAME;
      applyTitle(name);
      setLogo(cfg.logo ?? null);
      setSiteName(name);
    };

    void (async () => {
      const { data } = await supabase
        .from("app_config")
        .select("background,logo,site_name")
        .eq("id", 1)
        .maybeSingle();
      if (active) apply(data as AppConfig | null);
    })();

    const channel = supabase
      .channel("app_config")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_config" },
        (payload) => apply(payload.new as AppConfig | null),
      )
      .subscribe();

    return () => {
      active = false;
      channel.unsubscribe();
    };
  }, []);

  return <BrandingContext.Provider value={{ logo, siteName }}>{children}</BrandingContext.Provider>;
}

/** Renders the site logo (if uploaded) next to a text label. */
export function Brand({
  className = "",
  imgClassName = "h-8 w-8",
  children,
}: {
  className?: string;
  imgClassName?: string;
  children?: ReactNode;
}) {
  const { logo, siteName } = useBranding();
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className={`rounded-md object-contain ${imgClassName}`} />
      ) : null}
      {children ?? <span className="gold-text font-black">{siteName}</span>}
    </span>
  );
}
