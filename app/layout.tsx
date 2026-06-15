import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AMARI // agent terminal",
  description:
    "Local-first cyberpunk terminal for LLM agents and workflows — Claude, Gemini, Kimi, OpenAI, OpenRouter and local Ollama models.",
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Loaded if online; falls back to the system monospace stack offline. */}
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="crt-scanlines" aria-hidden />
        <div className="crt-vignette" aria-hidden />
        {children}
      </body>
    </html>
  );
}
