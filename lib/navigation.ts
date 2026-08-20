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
    ],
  },
  {
    label: "Evidență",
    items: [
      { href: "/documente", label: "Documente și PV" },
      { href: "/rapoarte", label: "Rapoarte lunare" },
      { href: "/rapoarte/inspectii", label: "Acoperirea inspecțiilor" },
      { href: "/facturi", label: "Facturi", needs: "facturi.gestioneaza", stub: true },
      { href: "/nomenclatoare", label: "Nomenclatoare", stub: true },
    ],
  },
];

export function navigationFor(role: Role): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.needs || can(role, item.needs)),
  })).filter((group) => group.items.length > 0);
}

/** Ecranele de teren — interfață separată, nu aceleași pagini cu mai puține butoane (§18.1.1). */
/**
 * Patru intrări, nu șase: bara de jos stă sub degetul mare, iar tot ce se poate
 * ajunge din „Azi" nu merită un buton propriu. Restul se deschide din ＋.
 */
export const FIELD_NAVIGATION: NavItem[] = [
  { href: "/teren", label: "Azi" },
  { href: "/teren/pontaj", label: "Pontaj" },
  { href: "/teren/jurnal", label: "Jurnal" },
  { href: "/teren/necesar", label: "Necesar" },
  { href: "/teren/utilaje", label: "Utilaje" },
  { href: "/teren/situatii", label: "Verific" },
];
