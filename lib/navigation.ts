import type { Capability, Role } from "./permissions";
import { can } from "./permissions";

export type NavItem = {
  href: string;
  label: string;
  /** dacă e setată, intrarea apare doar cu capabilitatea asta */
  needs?: Capability;
  /** intrări care încă n-au ecran — se văd, dar sunt marcate */
  stub?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAVIGATION: NavGroup[] = [
  {
    label: "Conducere",
    items: [
      { href: "/panou", label: "Panou" },
      { href: "/contracte", label: "Contracte", needs: "contracte.vezi" },
      { href: "/obiective", label: "Obiective" },
    ],
  },
  {
    label: "Operațional",
    items: [
      { href: "/cereri", label: "Cereri și tichete" },
      { href: "/backlog", label: "Backlog Delta", needs: "cost.vezi" },
      { href: "/lucrari", label: "Unități de lucru" },
      { href: "/cost", label: "Registrul de cost", needs: "cost.vezi" },
      { href: "/realocari", label: "Realocări", needs: "cost.vezi" },
      { href: "/perioade", label: "Închiderea lunii", needs: "perioada.inchide" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { href: "/devize", label: "Devize" },
      { href: "/pachete", label: "Pachete", needs: "pachete.gestioneaza" },
      { href: "/situatii", label: "Situații de lucrări" },
      { href: "/garantii", label: "Suplimentări și garanții", needs: "preturi.vezi" },
    ],
  },
  {
    label: "Aprovizionare",
    items: [
      { href: "/stoc", label: "Gestiuni și stoc", needs: "stoc.vezi" },
      { href: "/stoc/consum", label: "Bonuri de consum", needs: "stoc.opereaza" },
      { href: "/achizitii", label: "Achiziții", needs: "achizitii.gestioneaza" },
      { href: "/receptii", label: "Recepții și NIR", needs: "stoc.opereaza" },
    ],
  },
  {
    label: "Resurse",
    items: [
      { href: "/utilaje", label: "Utilaje" },
      { href: "/utilaje/solicitari", label: "Solicitări de utilaj" },
      { href: "/unelte", label: "Unelte" },
      { href: "/transporturi", label: "Transporturi" },
      { href: "/concedii", label: "Concedii" },
    ],
  },
  {
    label: "Evidență",
    items: [
      { href: "/documente", label: "Documente și PV" },
      { href: "/rapoarte", label: "Rapoarte lunare" },
      { href: "/rapoarte/inspectii", label: "Acoperirea inspecțiilor" },
      { href: "/facturi", label: "Facturi", needs: "facturi.gestioneaza" },
      { href: "/integrari", label: "Integrări și schelete" },
      { href: "/nomenclatoare", label: "Nomenclatoare", needs: "nomenclatoare.editeaza" },
    ],
  },
];

export function navigationFor(role: Role): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.needs || can(role, item.needs)),
  })).filter((group) => group.items.length > 0);
}

/**
 * Terenul NU mai are o listă de intrări aici.
 *
 * Bara lui de jos are trei tab-uri — Azi · Locuri · Eu — și trăiește în
 * `components/domain/FieldTabs.tsx`, împreună cu regula după care un ecran aparține
 * unui tab. O a doua listă, aici, ar fi însemnat două adevăruri despre aceeași bară.
 */
