import type { Capability, Role } from "./permissions";
import { can } from "./permissions";

export type NavItem = {
  href: string;
  label: string;
  /** dacă e setată, intrarea apare doar cu capabilitatea asta */
  needs?: Capability;
  /** intrări care încă n-au ecran — se văd, dar sunt marcate */
  stub?: boolean;
  /**
   * Numele iconiței, nu componenta: `NavGroup` trece din server în `Rail`, care e
   * componentă de client, iar o funcție-componentă nu se poate serializa peste
   * graniță. `Rail` traduce numele într-o iconiță `lucide-react`.
   */
  icon: NavIcon;
};

export type NavIcon =
  | "panou"
  | "contracte"
  | "obiective"
  | "cereri"
  | "backlog"
  | "lucrari"
  | "cost"
  | "realocari"
  | "perioade"
  | "devize"
  | "pachete"
  | "situatii"
  | "garantii"
  | "stoc"
  | "consum"
  | "achizitii"
  | "receptii"
  | "utilaje"
  | "solicitari"
  | "unelte"
  | "transporturi"
  | "concedii"
  | "documente"
  | "rapoarte"
  | "inspectii"
  | "facturi"
  | "integrari"
  | "nomenclatoare";

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAVIGATION: NavGroup[] = [
  {
    label: "Conducere",
    items: [
      { href: "/panou", label: "Panou", icon: "panou" },
      { href: "/contracte", label: "Contracte", needs: "contracte.vezi", icon: "contracte" },
      { href: "/obiective", label: "Obiective", icon: "obiective" },
    ],
  },
  {
    label: "Operațional",
    items: [
      { href: "/cereri", label: "Cereri și tichete", icon: "cereri" },
      { href: "/backlog", label: "Backlog Delta", needs: "cost.vezi", icon: "backlog" },
      { href: "/lucrari", label: "Unități de lucru", icon: "lucrari" },
      { href: "/cost", label: "Registrul de cost", needs: "cost.vezi", icon: "cost" },
      { href: "/realocari", label: "Realocări", needs: "cost.vezi", icon: "realocari" },
      { href: "/perioade", label: "Închiderea lunii", needs: "perioada.inchide", icon: "perioade" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { href: "/devize", label: "Devize", icon: "devize" },
      { href: "/pachete", label: "Pachete", needs: "pachete.gestioneaza", icon: "pachete" },
      { href: "/situatii", label: "Situații de lucrări", icon: "situatii" },
      { href: "/garantii", label: "Suplimentări și garanții", needs: "preturi.vezi", icon: "garantii" },
    ],
  },
  {
    label: "Aprovizionare",
    items: [
      { href: "/stoc", label: "Gestiuni și stoc", needs: "stoc.vezi", icon: "stoc" },
      { href: "/stoc/consum", label: "Bonuri de consum", needs: "stoc.opereaza", icon: "consum" },
      { href: "/achizitii", label: "Achiziții", needs: "achizitii.gestioneaza", icon: "achizitii" },
      { href: "/receptii", label: "Recepții și NIR", needs: "stoc.opereaza", icon: "receptii" },
    ],
  },
  {
    label: "Resurse",
    items: [
      { href: "/utilaje", label: "Utilaje", icon: "utilaje" },
      { href: "/utilaje/solicitari", label: "Solicitări de utilaj", icon: "solicitari" },
      { href: "/unelte", label: "Unelte", icon: "unelte" },
      { href: "/transporturi", label: "Transporturi", icon: "transporturi" },
      { href: "/concedii", label: "Concedii", icon: "concedii" },
    ],
  },
  {
    label: "Evidență",
    items: [
      { href: "/documente", label: "Documente și PV", icon: "documente" },
      { href: "/rapoarte", label: "Rapoarte lunare", icon: "rapoarte" },
      { href: "/rapoarte/inspectii", label: "Acoperirea inspecțiilor", icon: "inspectii" },
      { href: "/facturi", label: "Facturi", needs: "facturi.gestioneaza", icon: "facturi" },
      { href: "/integrari", label: "Integrări și schelete", icon: "integrari" },
      { href: "/nomenclatoare", label: "Nomenclatoare", needs: "nomenclatoare.editeaza", icon: "nomenclatoare" },
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
