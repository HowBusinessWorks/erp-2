"use client";

import { Button } from "@/components/ui/primitives";

/** PV-ul ajunge pe hârtie. Foaia e A4, definită în `globals.css` la `@media print`. */
export function PrintButton() {
  return (
    <Button type="button" size="sm" onClick={() => window.print()}>
      Tipărește
    </Button>
  );
}
