import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  CRM_PROVIDER: z.enum(['pipedrive', 'hubspot']),
  CRM_URL: z.url(),
  CRM_API_KEY: z.string().min(10, 'CRM_API_KEY mangler eller er for kort'),
});

export type CrmEnv = z.infer<typeof EnvSchema>;

/** Læser og validerer CRM-miljøvariabler. Fejlbeskeden viser aldrig selve værdierne. */
export function loadCrmEnv(source: NodeJS.ProcessEnv = process.env): CrmEnv {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Ugyldig CRM-konfiguration i .env – ${fields}`);
  }
  return result.data;
}
