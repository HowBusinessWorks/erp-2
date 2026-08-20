"use client";

import { useActionState } from "react";

import { login } from "@/app/actions/session";
import { Button, Field, Input } from "@/components/ui/primitives";

const DEMO_ACCOUNTS = [
  ["admin@damina.ro", "Administrator — vede tot"],
  ["pm@damina.ro", "Manager de proiect"],
  ["santier@damina.ro", "Șef de șantier — teren, fără lei"],
  ["flota@damina.ro", "Manager de flotă"],
];

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_460px]">
      {/* Panoul de identitate — hașura de planșă tehnică, nu o poză de stoc. */}
      <div
        className="relative hidden bg-rail lg:block"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 14px)",
        }}
      >
        <div className="absolute bottom-12 left-12 right-12">
          <div className="font-narrow text-[2.75rem] font-bold uppercase leading-[0.95] tracking-tight text-white">
            Damina
          </div>
          <p className="mt-3 max-w-sm text-[0.8125rem] leading-relaxed text-ink-rail-2">
            Contracte de mentenanță, lucrări, inspecții, utilaje și costuri — într-un
            singur registru.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-xs">
          <div className="eyebrow">Autentificare</div>
          <h1 className="mt-2 font-narrow text-2xl font-semibold tracking-tight text-ink">
            Intră în cont
          </h1>

          <form action={formAction} className="mt-7 space-y-4">
            <Field label="Email">
              <Input
                name="email"
                type="email"
                autoComplete="username"
                defaultValue="admin@damina.ro"
                required
              />
            </Field>
            <Field label="Parolă">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>

            {state?.error ? (
              <p className="border-l-2 border-over bg-over-soft px-3 py-2 text-tiny text-over">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {pending ? "Se verifică…" : "Intră"}
            </Button>
          </form>

          <div className="mt-8 border-t border-rule pt-4">
            <div className="eyebrow mb-2">Conturi de probă</div>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map(([email, role]) => (
                <li key={email} className="flex justify-between gap-3 text-micro">
                  <span className="tabular text-ink-2">{email}</span>
                  <span className="text-right text-ink-3">{role}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-micro text-ink-3">
              Parola tuturor e cea din <code className="text-ink-2">SEED_PASSWORD</code>.
              Contul de administrator poate comuta perspectiva din bara de sus.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
