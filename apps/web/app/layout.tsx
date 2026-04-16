import type { Metadata } from "next";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { GlobalChunkErrorHandler } from "@/components/GlobalChunkErrorHandler";
import "@/styles/globals.css";
import "@/styles/components.css";
import "@/styles/layout.css";
import "@/styles/leaves.css";
import "@/styles/admin.css";
import "@/styles/security.css";

export const metadata: Metadata = {
  title: "Vibe Tech Labs — Enterprise Workforce Platform",
  description: "AI-powered workforce intelligence by Vibe Tech Labs. A Digital Idea To Grow You Up! Attendance, leave management, and security compliance.",
  icons: { icon: "/logo-black.webp" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1A56DB" />
      </head>
      <body>
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <GlobalChunkErrorHandler />
        <ThemeProvider>
          <AuthProvider>
            <main id="main-content">
              {children}
            </main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
