// components/sidebar.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

const NAVY = "#1A1442";
const MUTED = "#9096AA";
const DISPLAY = "'Space Grotesk', sans-serif";
const BODY = "'Plus Jakarta Sans', sans-serif";

export default function Sidebar({
  userName,
  isAdmin,
}: {
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="8" height="10" rx="2" />
          <rect x="13" y="3" width="8" height="6" rx="2" />
          <rect x="13" y="11" width="8" height="10" rx="2" />
          <rect x="3" y="15" width="8" height="6" rx="2" />
        </svg>
      ),
      show: true,
    },
    {
      href: "/notificacoes",
      label: "Notificações",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
      show: isAdmin,
    },
    {
      href: "/admin",
      label: "Administração",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      show: isAdmin,
    },
  ];

  return (
    <aside
      className="app-sidebar"
      style={{
        width: 232,
        flexShrink: 0,
        background: "#fff",
        borderRight: "1px solid #ECEDF3",
        display: "flex",
        flexDirection: "column",
        padding: "20px 14px",
        position: "sticky",
        top: 0,
        height: "100vh",
        fontFamily: BODY,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 8px 20px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="LinoADS" style={{ width: 36, height: 36 }} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{ font: `700 17px ${DISPLAY}`, color: NAVY, letterSpacing: "-.01em" }}>LinoADS</span>
          <span style={{ font: `600 7px ${BODY}`, color: "#A0A4B4", letterSpacing: ".16em" }}>
            ASSESSORIA DE MARKETING
          </span>
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items
          .filter((i) => i.show)
          .map((i) => {
            const active = pathname.startsWith(i.href);
            return (
              <a
                key={i.href}
                href={i.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "11px 12px",
                  borderRadius: 11,
                  textDecoration: "none",
                  font: `600 13px ${BODY}`,
                  color: active ? "#fff" : "#4A4568",
                  background: active
                    ? "linear-gradient(135deg,#E8336E,#F5813C)"
                    : "transparent",
                }}
              >
                {i.icon}
                {i.label}
              </a>
            );
          })}
      </nav>

      <div className="sidebar-footer" style={{ marginTop: "auto", borderTop: "1px solid #F0F1F6", paddingTop: 14 }}>
        <div className="sidebar-user" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px 12px" }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: NAVY,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: `700 13px ${DISPLAY}`,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: `600 12px ${BODY}`, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {userName}
            </div>
            <div style={{ font: `500 10px ${BODY}`, color: MUTED }}>{isAdmin ? "Administrador" : "Cliente"}</div>
          </div>
        </div>
        <button
          onClick={logout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            border: "none",
            cursor: "pointer",
            background: "#F5F6FA",
            borderRadius: 11,
            padding: "10px 12px",
            font: `600 12px ${BODY}`,
            color: "#4A4568",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Sair
        </button>
      </div>
    </aside>
  );
}
