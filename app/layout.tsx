import type { Metadata } from "next";
import { Archivo, Archivo_Narrow } from "next/font/google";

import "./globals.css";

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  variable: "--font-archivo",
  display: "swap",
});

const archivoNarrow = Archivo_Narrow({
  subsets: ["latin", "latin-ext"],
  variable: "--font-archivo-narrow",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Damina ERP",
  description: "Sistem intern de gestiune — contracte, lucrări, mentenanță, resurse.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={`${archivo.variable} ${archivoNarrow.variable}`}>
      <body>{children}</body>
    </html>
  );
}
