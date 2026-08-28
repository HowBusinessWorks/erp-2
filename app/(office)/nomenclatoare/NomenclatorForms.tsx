"use client";

import {
  saveChecklistTemplate,
  saveInspectionCheck,
  saveFirm,
  saveFuelPrice,
  saveLaborRate,
  saveOperation,
  savePartner,
  saveProduct,
  savePvTemplate,
  saveUser,
} from "@/app/actions/nomenclatoare";
import { Field, FieldError, FormModal } from "@/components/ui/form";
import {
  PARTNER_TYPES,
  PV_KINDS,
  UNITS,
  dayToMonth,
  validateChecklistTemplate,
  validateInspectionCheck,
  validateFirm,
  validateFuelPrice,
  validateLaborRate,
  validateOperation,
  validatePartner,
  validateProduct,
  validatePvTemplate,
  validateUser,
} from "@/lib/nomenclatoare-types";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

/**
 * Formularele nomenclatoarelor. Toate folosesc `FormModal` din §9.0 — niciunul nu-și
 * scrie propriul modal, propriul buton de trimitere sau propria validare.
 *
 * Fișierul e de client, deci NU are voie să importe nimic care ajunge la `lib/db`.
 * `lib/nomenclatoare-types.ts` și `lib/permissions.ts` sunt pure; acțiunile vin din
 * modulul cu `"use server"`, adică prin referință.
 */

export type Opt = { value: string; label: string };

function empty(v: string | null | undefined): string {
  return v ?? "";
}

function UnitOptions() {
  return (
    <>
      {UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </>
  );
}

function OptionList({ options, blank }: { options: Opt[]; blank: string }) {
  return (
    <>
      <option value="">{blank}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </>
  );
}

/** Butonul de deschidere: „＋ …" la creare, „Editează" pe rând. */
function trigger(editing: boolean, addLabel: string) {
  return editing
    ? ({ label: "Editează", variant: "quiet" as const, size: "sm" as const })
    : ({ label: `＋ ${addLabel}`, variant: "primary" as const, size: "sm" as const });
}

/* ───────────────────────────── Firme ───────────────────────────── */

export type FirmValues = {
  id: string;
  name: string;
  cui: string;
  regCom: string | null;
  address: string | null;
  documentPrefix: string;
  color: string | null;
};

export function FirmForm({ firm }: { firm?: FirmValues }) {
  return (
    <FormModal
      {...trigger(Boolean(firm), "Firmă")}
      title={firm ? `Firma ${firm.name}` : "Firmă nouă"}
      subtitle="Prefixul intră în seria fiecărei facturi emise de firmă."
      action={saveFirm}
      validate={validateFirm}
    >
      {firm ? <input type="hidden" name="id" value={firm.id} /> : null}
      <Field name="name" label="Denumire" required full defaultValue={firm?.name} />
      <Field name="cui" label="CUI" required defaultValue={firm?.cui} placeholder="RO12345678" />
      <Field name="regCom" label="Reg. comerțului" defaultValue={empty(firm?.regCom)} />
      <Field
        name="documentPrefix"
        label="Prefix de serie"
        required
        defaultValue={firm?.documentPrefix}
        placeholder="DAM"
        hint="Majuscule și cifre. Îl citește lib/invoicing.ts."
      />
      <Field
        name="color"
        label="Culoare"
        defaultValue={empty(firm?.color)}
        placeholder="#3b5b8c"
        hint="Doar pentru a distinge firmele în liste."
      />
      <Field name="address" label="Adresă" kind="textarea" full defaultValue={empty(firm?.address)} />
    </FormModal>
  );
}

/* ─────────────────────────── Parteneri ─────────────────────────── */

export type PartnerValues = {
  id: string;
  name: string;
  types: string[];
  cui: string | null;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  specialty: string | null;
  retentionPercent: string | null;
};

export function PartnerForm({ partner }: { partner?: PartnerValues }) {
  return (
    <FormModal
      {...trigger(Boolean(partner), "Partener")}
      title={partner ? partner.name : "Partener nou"}
      subtitle="Aceeași fișă poate fi și client, și furnizor, și subcontractant."
      action={savePartner}
      validate={validatePartner}
      width="lg"
    >
      {partner ? <input type="hidden" name="id" value={partner.id} /> : null}
      <Field name="name" label="Denumire" required full defaultValue={partner?.name} />

      <div className="sm:col-span-2">
        <span className="eyebrow mb-1 block">
          Roluri<span className="text-over"> •</span>
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {PARTNER_TYPES.map((t) => (
            <label key={t.value} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="types"
                value={t.value}
                defaultChecked={partner?.types.includes(t.value)}
                className="size-4 accent-blueprint"
              />
              <span className="text-[0.8125rem] text-ink">{t.label}</span>
            </label>
          ))}
        </div>
        <FieldError name="types" />
      </div>

      <Field name="cui" label="CUI" defaultValue={empty(partner?.cui)} />
      <Field
        name="specialty"
        label="Specialitate"
        defaultValue={empty(partner?.specialty)}
        placeholder="electric, sanitar, construcții…"
      />
      <Field name="contactName" label="Persoană de contact" defaultValue={empty(partner?.contactName)} />
      <Field
        name="contactPhone"
        label="Telefon"
        kind="tel"
        defaultValue={empty(partner?.contactPhone)}
      />
      <Field
        name="contactEmail"
        label="E-mail"
        kind="email"
        defaultValue={empty(partner?.contactEmail)}
      />
      <Field
        name="retentionPercent"
        label="Garanție reținută (%)"
        kind="number"
        step="0.01"
        defaultValue={empty(partner?.retentionPercent)}
        hint="Se reține din fiecare situație de lucrări a subcontractantului."
      />
      <Field name="address" label="Adresă" kind="textarea" full defaultValue={empty(partner?.address)} />
    </FormModal>
  );
}

/* ──────────────────────────── Produse ──────────────────────────── */

export type ProductValues = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  defaultSupplierId: string | null;
  lastPrice: string;
  leadTimeDays: number;
  minStock: string;
  maxStock: string;
  tracksLots: boolean;
};

export function ProductForm({
  product,
  suppliers,
}: {
  product?: ProductValues;
  suppliers: Opt[];
}) {
  return (
    <FormModal
      {...trigger(Boolean(product), "Produs")}
      title={product ? `${product.code} — ${product.name}` : "Produs nou"}
      subtitle="Minimul și lead time-ul hrănesc semnalul de reaprovizionare."
      action={saveProduct}
      validate={validateProduct}
      width="lg"
    >
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <Field name="code" label="Cod" required defaultValue={product?.code} />
      <Field name="name" label="Denumire" required defaultValue={product?.name} />
      <Field name="category" label="Categorie" defaultValue={empty(product?.category)} />
      <Field name="unit" label="Unitate de măsură" kind="select" required defaultValue={product?.unit ?? "buc"}>
        <UnitOptions />
      </Field>
      <Field
        name="defaultSupplierId"
        label="Furnizor implicit"
        kind="select"
        defaultValue={empty(product?.defaultSupplierId)}
      >
        <OptionList options={suppliers} blank="— fără —" />
      </Field>
      <Field
        name="lastPrice"
        label="Ultimul preț (lei)"
        kind="money"
        defaultValue={empty(product?.lastPrice)}
      />
      <Field
        name="leadTimeDays"
        label="Lead time (zile)"
        kind="number"
        step="1"
        defaultValue={product ? String(product.leadTimeDays) : "0"}
      />
      <Field name="minStock" label="Stoc minim" kind="number" defaultValue={empty(product?.minStock)} />
      <Field name="maxStock" label="Stoc maxim" kind="number" defaultValue={empty(product?.maxStock)} />
      <Field
        name="tracksLots"
        label="Urmărește loturi și expirare"
        kind="checkbox"
        full
        defaultChecked={product?.tracksLots}
        hint="Obligatoriu pe adezivi, mortare și chimicale."
      />
    </FormModal>
  );
}

/* ───────────────────── Calificări și rate orare ───────────────────── */

export type LaborRateValues = {
  id: string;
  qualification: string;
  hourlyCost: string;
  validFrom: string;
  validTo: string | null;
};

export function LaborRateForm({ rate }: { rate?: LaborRateValues }) {
  return (
    <FormModal
      {...trigger(Boolean(rate), "Calificare")}
      title={rate ? `Rata pentru ${rate.qualification}` : "Calificare nouă"}
      subtitle="Costul orar = salariu + taxe + coeficient de neproductivitate. Îl consumă pontajul."
      action={saveLaborRate}
      validate={validateLaborRate}
    >
      {rate ? <input type="hidden" name="id" value={rate.id} /> : null}
      <Field name="qualification" label="Calificare" required full defaultValue={rate?.qualification} />
      <Field
        name="hourlyCost"
        label="Cost orar (lei)"
        kind="money"
        required
        defaultValue={empty(rate?.hourlyCost)}
      />
      <Field name="validFrom" label="Valabil de la" kind="date" required defaultValue={rate?.validFrom} />
      <Field
        name="validTo"
        label="Valabil până la"
        kind="date"
        defaultValue={empty(rate?.validTo)}
        hint="Gol = rata în vigoare."
      />
    </FormModal>
  );
}

/* ─────────────────── Catalogul de operațiuni ─────────────────── */

export type OperationValues = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  standardHours: string;
  qualification: string | null;
  estimatedCost: string;
  materials: string;
};

export function OperationForm({ operation }: { operation?: OperationValues }) {
  return (
    <FormModal
      {...trigger(Boolean(operation), "Operațiune")}
      title={operation ? `${operation.code} — ${operation.name}` : "Operațiune nouă"}
      subtitle="Sursa rutării. O operațiune fără normă de timp trimite cererea în locul greșit."
      action={saveOperation}
      validate={validateOperation}
      width="lg"
    >
      {operation ? <input type="hidden" name="id" value={operation.id} /> : null}
      <Field name="code" label="Cod" required defaultValue={operation?.code} />
      <Field name="name" label="Denumire" required defaultValue={operation?.name} />
      <Field name="category" label="Categorie" defaultValue={empty(operation?.category)} />
      <Field
        name="unit"
        label="Unitate de măsură"
        kind="select"
        required
        defaultValue={operation?.unit ?? "buc"}
      >
        <UnitOptions />
      </Field>
      <Field
        name="standardHours"
        label="Normă de timp (ore)"
        kind="number"
        step="0.01"
        defaultValue={empty(operation?.standardHours)}
      />
      <Field
        name="qualification"
        label="Calificare cerută"
        defaultValue={empty(operation?.qualification)}
      />
      <Field
        name="estimatedCost"
        label="Cost estimat (lei)"
        kind="money"
        full
        defaultValue={empty(operation?.estimatedCost)}
      />
      <Field
        name="materials"
        label="Norme de material"
        kind="textarea"
        full
        rows={5}
        defaultValue={empty(operation?.materials)}
        placeholder={"CIM-42 x 2,5\nADZ-01 x 0,8"}
        hint="Câte una pe linie: cod produs x cantitate. Codurile necunoscute se ignoră."
      />
    </FormModal>
  );
}

/* ───────────────────── Puncte de verificare ───────────────────── */

export type InspectionCheckValues = {
  id: string;
  code: string;
  name: string;
  ticketTypeId: string | null;
  objectiveKind: string | null;
  guidance: string | null;
  requiresPhoto: boolean;
  requiresValue: boolean;
  valueUnit: string | null;
};

/**
 * Punctul din catalog. Codul e cheia cu care intră în liste — de-aia e primul câmp
 * și de-aia se scrie cu majuscule: în listă îl tastezi, nu îl alegi dintr-un dropdown.
 */
export function InspectionCheckForm({
  point,
  ticketTypes,
  objectiveKinds,
}: {
  point?: InspectionCheckValues;
  ticketTypes: Opt[];
  objectiveKinds: Opt[];
}) {
  return (
    <FormModal
      {...trigger(Boolean(point), "Punct")}
      title={point ? point.name : "Punct de verificare nou"}
      subtitle="Se definește o dată și intră în oricâte liste. Codul e cheia cu care îl pui în listă."
      action={saveInspectionCheck}
      validate={validateInspectionCheck}
      width="lg"
    >
      {point ? <input type="hidden" name="id" value={point.id} /> : null}
      <Field
        name="code"
        label="Cod"
        required
        defaultValue={point?.code}
        placeholder="EL-ACUM"
        hint="Îl scrii în listă ca să legi punctul."
      />
      <Field
        name="name"
        label="Denumire"
        required
        defaultValue={point?.name}
        placeholder="Verificare acumulatori"
      />
      <Field
        name="ticketTypeId"
        label="Tip de inspecție"
        kind="select"
        defaultValue={empty(point?.ticketTypeId)}
      >
        <OptionList options={ticketTypes} blank="— orice tip —" />
      </Field>
      <Field
        name="objectiveKind"
        label="Tip de obiectiv"
        kind="select"
        defaultValue={empty(point?.objectiveKind)}
      >
        <OptionList options={objectiveKinds} blank="— orice tip —" />
      </Field>
      <Field
        name="guidance"
        label="Indicații"
        full
        defaultValue={empty(point?.guidance)}
        placeholder="Ce anume se măsoară sau se privește"
      />
      <Field
        name="requiresPhoto"
        label="Cere poză"
        kind="select"
        defaultValue={point?.requiresPhoto ? "1" : "0"}
      >
        <option value="0">Nu</option>
        <option value="1">Da</option>
      </Field>
      <Field
        name="requiresValue"
        label="Cere valoare măsurată"
        kind="select"
        defaultValue={point?.requiresValue ? "1" : "0"}
      >
        <option value="0">Nu</option>
        <option value="1">Da</option>
      </Field>
      <Field
        name="valueUnit"
        label="Unitatea valorii"
        defaultValue={empty(point?.valueUnit)}
        placeholder="V, bar, °C"
      />
    </FormModal>
  );
}

/* ───────────────────── Liste de inspecție ───────────────────── */

export type ChecklistValues = {
  id: string;
  name: string;
  objectiveKind: string | null;
  ticketTypeId: string | null;
  discipline: string | null;
  items: string;
};

export function ChecklistForm({
  template,
  ticketTypes,
  objectiveKinds,
}: {
  template?: ChecklistValues;
  ticketTypes: Opt[];
  objectiveKinds: Opt[];
}) {
  return (
    <FormModal
      {...trigger(Boolean(template), "Șablon")}
      title={template ? template.name : "Listă de inspecție nouă"}
      subtitle="Punctele de aici sunt exact ce vede omul pe teren la inspecție."
      action={saveChecklistTemplate}
      validate={validateChecklistTemplate}
      width="lg"
    >
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <Field name="name" label="Denumire" required full defaultValue={template?.name} />
      <Field
        name="objectiveKind"
        label="Tip de obiectiv"
        kind="select"
        defaultValue={empty(template?.objectiveKind)}
      >
        <OptionList options={objectiveKinds} blank="— orice tip —" />
      </Field>
      <Field
        name="ticketTypeId"
        label="Tip de inspecție"
        kind="select"
        defaultValue={empty(template?.ticketTypeId)}
        hint="Același nomenclator ca la tichete."
      >
        <OptionList options={ticketTypes} blank="— fără tip —" />
      </Field>
      <Field
        name="discipline"
        label="Etichetă liberă"
        defaultValue={empty(template?.discipline)}
        placeholder="folosită doar când nu ai ales un tip"
      />
      <Field
        name="items"
        label="Puncte de verificat"
        kind="textarea"
        full
        rows={8}
        required
        defaultValue={empty(template?.items)}
        placeholder={"Electrică | Verifică tabloul general\nElectrică | Măsoară priza de pământ\nStare generală a acoperișului"}
        hint="Câte unul pe linie. Opțional „Secțiune | text” ca să se grupeze în fișă."
      />
    </FormModal>
  );
}

/* ───────────────────────── Utilizatori ───────────────────────── */

export type UserValues = {
  id: string;
  name: string;
  email: string;
  role: Role;
  firmId: string | null;
  qualification: string | null;
};

export function UserForm({ user, firms }: { user?: UserValues; firms: Opt[] }) {
  return (
    <FormModal
      {...trigger(Boolean(user), "Utilizator")}
      title={user ? user.name : "Utilizator nou"}
      subtitle="Fără invitații și fără 2FA: parola o setează administratorul și o comunică."
      action={saveUser}
      validate={validateUser}
    >
      {user ? <input type="hidden" name="id" value={user.id} /> : null}
      <Field name="name" label="Nume" required defaultValue={user?.name} />
      <Field name="email" label="E-mail" kind="email" required defaultValue={user?.email} />
      <Field name="role" label="Rol" kind="select" required defaultValue={user?.role ?? "pm"}>
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Field>
      <Field name="firmId" label="Firmă" kind="select" defaultValue={empty(user?.firmId)}>
        <OptionList options={firms} blank="— fără —" />
      </Field>
      <Field
        name="qualification"
        label="Calificare"
        defaultValue={empty(user?.qualification)}
        hint="Se leagă de rata orară din fila Calificări."
      />
      <Field
        name="password"
        label={user ? "Parolă nouă" : "Parolă"}
        kind="password"
        required={!user}
        hint={user ? "Gol = parola rămâne cea veche." : "Minimum 6 caractere."}
      />
    </FormModal>
  );
}

/* ───────────────────────── Preț motorină ───────────────────────── */

export type FuelPriceValues = {
  day: string;
  pricePerLiter: string;
  manualOverride: boolean;
};

export function FuelPriceForm({ price }: { price?: FuelPriceValues }) {
  return (
    <FormModal
      {...trigger(Boolean(price), "Preț de lună")}
      title={price ? "Preț de motorină" : "Preț de motorină nou"}
      subtitle="Prețul lunii intră în costul fiecărei alimentări din luna respectivă."
      action={saveFuelPrice}
      validate={validateFuelPrice}
    >
      <Field
        name="month"
        label="Luna"
        kind="month"
        required
        defaultValue={price ? dayToMonth(price.day) : ""}
        hint={price ? "Luna e cheia — schimbarea ei creează un rând nou." : undefined}
      />
      <Field
        name="pricePerLiter"
        label="Preț pe litru (lei)"
        kind="money"
        required
        defaultValue={empty(price?.pricePerLiter)}
      />
      <Field
        name="manualOverride"
        label="Preț introdus manual"
        kind="checkbox"
        full
        defaultChecked={price?.manualOverride ?? true}
        hint="Bifat = nu se suprascrie de un import automat."
      />
    </FormModal>
  );
}

/* ───────────────────────── Șabloane de PV ───────────────────────── */

export type PvTemplateValues = {
  id: string;
  name: string;
  kind: string;
  storageKey: string | null;
};

export function PvTemplateForm({ template }: { template?: PvTemplateValues }) {
  return (
    <FormModal
      {...trigger(Boolean(template), "Șablon PV")}
      title={template ? template.name : "Șablon de PV nou"}
      subtitle="Poziționarea câmpurilor pe PDF se face separat, în editorul de șabloane."
      action={savePvTemplate}
      validate={validatePvTemplate}
    >
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <Field name="name" label="Denumire" required full defaultValue={template?.name} />
      <Field name="kind" label="Tip" kind="select" required defaultValue={template?.kind ?? PV_KINDS[0].value}>
        {PV_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </Field>
      <Field
        name="storageKey"
        label="Cheie de stocare a PDF-ului"
        defaultValue={empty(template?.storageKey)}
        hint="Calea fișierului încărcat în Supabase Storage."
      />
    </FormModal>
  );
}
