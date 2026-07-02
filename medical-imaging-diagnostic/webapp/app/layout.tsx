import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MID · AI Diagnostic Assistant",
  description:
    "Multi-tenant AI diagnostic assistant for doctors — unified patient profiles with cross-modal correlation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved theme before paint to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("mid_theme")==="dark"||(!localStorage.getItem("mid_theme")&&window.matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
