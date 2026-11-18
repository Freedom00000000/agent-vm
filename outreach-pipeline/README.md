# Outreach-pipeline

Vedligeholdelse og iteration af outreach-skabeloner og CRM-data for en kampagne mod ca. 40 CVR-validerede håndværksvirksomheder.
Kode og skabeloner styres med **Claude Code**. Alt, der skriver til CRM, kræver **menneskelig godkendelse**.

```
CVR-eksport ─cvr→ leads.json ─generate→ out/review-*.json ─(du sætter "approved": true)→ apply → noter i CRM
                                                                                     └→ *.applied.json ─rollback→ slet noterne
```

## Opsætning
```bash
npm install
cp .env.example .env   # CRM_PROVIDER, CRM_URL, CRM_API_KEY
npm run check          # typecheck + tests
```

| CRM | `CRM_URL` | `CRM_API_KEY` | Sendes som |
|---|---|---|---|
| Pipedrive | `https://<firma>.pipedrive.com` | Personligt API-token | `x-api-token` |
| HubSpot | `https://api.hubapi.com` | Private App token (leads read/write, notes) | `Authorization: Bearer` |

## Kampagne trin for trin
**1. CVR → leads** (læs). Input er en CVR-eksport i cvrapi.dk-format med et ekstra felt `crm_id` (se `data/cvr.example.json`).
```bash
npm run outreach -- cvr -i data/cvr.json -o data/leads.json
```
Udelader: ugyldigt CVR-nummer (modulus 11), **reklamebeskyttede**, ophørte, dubletter og leads uden kontaktperson. Advarer ved branche uden for DB07 41–43.

**2. Generér review-fil** (læs)
```bash
npm run outreach -- generate -t haandvaerk_30min_v1 -l data/leads.json -s "Dit navn"
```

**3. Review.** Åbn `out/review-*.json`, læs hver tekst, ret den om nødvendigt og sæt `"approved": true`.

**4. Test forbindelsen** (read-only)
```bash
npm run outreach -- smoke --lead <crm-lead-id>
```

**5. Skriv til CRM**
```bash
npm run outreach -- apply -r out/review-<...>.json
```
Skriver kun godkendte punkter, højst 50 (`--max`), og nægter at køre samme review-fil to gange. Note-id'er gemmes i `out/review-<...>.applied.json`.

**6. Rollback ved behov**
```bash
npm run outreach -- rollback --log out/review-<...>.applied.json
```
Sletter præcis de noter, kørslen oprettede. Kan genoptages, hvis den afbrydes. Kodeændringer rulles tilbage med `git revert`.

Exit-koder: `0` OK · `1` fejl · `2` delvist (noget udeladt/fejlet).

## Skabeloner
`config/templates.json`, id-format `<navn>_v<nummer>`. **Ret aldrig en udsendt version** – opret en ny. Mangler en placeholder-værdi, springes leadet over.
Tilgængelige lead-felter: `name` (fornavn), `company`, `cvr`, `city`, `trade` + `sender`.

## Claude Code
Start `claude` **inde fra mappen `outreach-pipeline/`** – ellers indlæses `CLAUDE.md` og `.claude/settings.json` ikke.

`CLAUDE.md` beskriver reglerne. `.claude/settings.json` håndhæver dem:
- **Tilladt:** tests, typecheck, `validate`, `list`, `cvr`, `generate`
- **Spørger først:** `smoke` (bruger CRM-nøglen), `git push`
- **Forbudt:** `apply`, `rollback`, redigering i `out/` (review-filer), læsning af `.env`

```bash
claude --permission-mode plan
```
> Lav `haandvaerk_30min_v2` med en kortere åbning, og tilføj en test for den.

## Sikkerhed og CI
- Lokalt: `.env` (git-ignoreret). CI/prod: secrets i GitHub-environment `crm-test` (eller jeres vault) – aldrig i repo.
- `.github/workflows/outreach-pipeline.yml` (i repoets rod) kører `check` + `validate` på hver push/PR. Manuel kørsel med et lead-id laver en read-only smoke-test mod test-CRM'et.
- Fejl fra CRM pakkes i `CrmError` uden headers, så nøglen ikke havner i logs.
- `POST` prøves kun igen ved 429, så en timeout ikke giver dobbelte noter.
- Rigtige lead-data (`data/*.json`, `out/`) er git-ignoreret.

## Jura
Markedsføringslovens §10 forbyder som udgangspunkt uanmodet e-mailmarkedsføring – også over for virksomheder, og især enkeltmandsvirksomheder. Reklamebeskyttede virksomheder i CVR må ikke kontaktes med markedsføring. Skabelonen er derfor formuleret som oplæg til en **telefonopringning**. Værktøjet sender ikke mails.
