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
      { href: "/lucrari", label: "Unități de lucru" },
      { href: "/cost", label: "Registrul de cost", needs: "cost.vezi" },
      { href: "/perioade", label: "Închiderea lunii", needs: "perioada.inchide" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { href: "/devize", label: "Devize" },
      { href: "/situatii", label: "Situații de lucrări" },
    ],
  },
  {
    label: "Aprovizionare",
    items: [
      { href: "/stoc", label: "Gestiuni și stoc", needs: "stoc.vezi" },
      { href: "/achizitii", label: "Achiziții", needs: "achizitii.gestioneaza" },
    ],
  },
  {
    label: "Resurse",
    items: [
      { href: "/utilaje", label: "Utilaje" },
      { href: "/unelte", label: "Unelte" },
      { href: "/transporturi", label: "Transporturi" },
    ],
  },
  {
    label: "Evidență",
    items: [
      { href: "/documente", label: "Documente și PV" },
      { href: "/rapoarte", label: "Rapoarte" },
      { href: "/facturi", label: "Facturi", needs: "facturi.gestioneaza" },
      { href: "/nomenclatoare", label: "Nomenclatoare" },
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
export const FIELD_NAVIGATION: NavItem[] = [
  { href: "/teren", label: "Azi" },
  { href: "/teren/inspectii", label: "Inspecții" },
  { href: "/teren/pontaj", label: "Pontaj" },
  { href: "/teren/jurnal", label: "Jurnal" },
  { href: "/teren/utilaje", label: "Utilajele mele" },
  { href: "/teren/poze", label: "Poze" },
];
