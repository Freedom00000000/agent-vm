# Outreach-pipeline – regler for Claude Code

TypeScript-værktøj til en outreach-kampagne mod ca. 40 CVR-validerede håndværksvirksomheder (SMV).
Claude Code vedligeholder kode og skabeloner. **Mennesker godkender og udfører alt, der skriver til CRM.**

## Dataflow
```
CVR-eksport ─cvr→ leads.json ─generate→ out/review-*.json ─(menneske: "approved": true)→ apply → CRM-noter
                                                                                      └→ *.applied.json ─rollback→ slet noter
```

## Struktur
- `scripts/outreach_generator.ts` – CLI: `validate`, `list`, `cvr`, `generate`, `smoke`, `apply`, `rollback`
- `config/templates.json` – skabeloner, id-format `<navn>_v<nummer>` (kun `[a-z0-9_]`)
- `lib/templates.ts` – schema-validering og `render()` (fejler ved manglende placeholders)
- `lib/cvr.ts` – modulus 11, reklamebeskyttelse, ophør, dubletter, branchetjek (DB07 41-43)
- `lib/review.ts` – review-fil og apply-log (schemas)
- `lib/crm_connector.ts` → `lib/crm/{pipedrive,hubspot}.ts` – adaptere; `lib/crm/http.ts` – timeout, retry, fejl uden headers
- `tests/` – vitest; netværk mockes via `tests/fake_adapter.ts`

## Regler
1. **Læs aldrig `.env`** og udskriv aldrig miljøvariabler.
2. **Kør aldrig `apply` eller `rollback`**, og sæt aldrig `"approved": true` i en review-fil. Det gør et menneske.
3. **Ret aldrig en eksisterende skabelonversion.** Opret en ny (`haandvaerk_30min_v2`) – gamle versioner er revisionsspor.
4. Skabelontekster er salgstekster: hold dem korte og personlige, ingen påstande om tal vi ikke kan dokumentere. Nye tekster er *forslag* til review.
5. Nye CRM-kald går gennem `HttpClient`, bruger `PATCH` til opdateringer og får en test med `fakeAdapter`. Læs- og skrivemetoder holdes adskilt i `CrmConnector`.
6. Kør `npm run check` før du melder en opgave færdig eller committer.
7. Log aldrig hele axios-fejlobjekter – brug `CrmError`.
8. Rigtige lead-data (`data/*.json` ud over `*.example.json`, `out/`) er persondata og må ikke committes.

## Kommandoer
- `npm run check` – typecheck + tests
- `npm run outreach -- cvr -i data/cvr.json -o data/leads.json`
- `npm run outreach -- generate -t haandvaerk_30min_v1 -l data/leads.json -s "<afsender>"`
