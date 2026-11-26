import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Output 1v2 — Plataforma de Conversação em Inglês",
  description:
    "Plataforma web de aulas ao vivo de conversação em inglês (formato 1v2) focada em destravamento de fala e escrita.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
