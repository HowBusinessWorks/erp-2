import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";

import { createContract } from "@/app/actions/contracts";
import { Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { firms, partners, users } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { ContractWizard } from "./ContractWizard";

export const dynamic = "force-dynamic";

/** PLAN.md §9.2 — asistentul de contract nou. Datele de referință vin din §9.1. */
export default async function ContractNouPage() {
  const session = await requireSession();

  if (!can(session.role, "contracte.editeaza")) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Conducere" title="Contract nou" />
        <EmptyState
          title="Contractele se creează de PM sau de administrator."
          hint="Rolul curent poate vedea contractele, dar nu le poate deschide."
          action={
            <Link href="/contracte">
              <Button size="sm">Înapoi la contracte</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const [firmRows, clientRows, ownerRows] = await Promise.all([
    db
      .select({ value: firms.id, label: firms.name })
      .from(firms)
      .where(eq(firms.active, true))
      .orderBy(asc(firms.name)),
    db
      .select({ value: partners.id, label: partners.name })
      .from(partners)
      .where(sql`${partners.active} = true and 'client' = any(${partners.types})`)
      .orderBy(asc(partners.name)),
    db
      .select({ value: users.id, label: users.name })
      .from(users)
      .where(sql`${users.active} = true and ${users.role} in ('pm', 'admin')`)
      .orderBy(asc(users.name)),
  ]);

  if (firmRows.length === 0 || clientRows.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Conducere" title="Contract nou" />
        <EmptyState
          title="Lipsesc datele de referință."
          hint={
            firmRows.length === 0
              ? "Nicio firmă activă. Un contract are nevoie de o firmă care semnează."
              : "Niciun partener marcat drept client. Adaugă-l întâi în nomenclator."
          }
          action={
            <Link href={firmRows.length === 0 ? "/nomenclatoare?fila=firme" : "/nomenclatoare?fila=parteneri"}>
              <Button size="sm" variant="primary">
                Deschide nomenclatorul
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Conducere"
        title="Contract nou"
        meta="Trei pași. Obiectivele arondate și anii de contract se adaugă după, din fișa contractului."
        actions={
          <Link href="/contracte">
            <Button size="sm">Renunț</Button>
          </Link>
        }
      />
      <ContractWizard
        firms={firmRows}
        clients={clientRows}
        owners={ownerRows}
        action={createContract}
      />
    </div>
  );
}
