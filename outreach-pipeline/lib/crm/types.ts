export interface OutreachNote {
  templateId: string;
  subject: string;
  body: string;
}

export interface LeadInfo {
  id: string;
  title: string;
}

/** Fælles interface, som hver CRM-adapter implementerer. Læse- og skriveoperationer er adskilt. */
export interface CrmConnector {
  readonly provider: 'pipedrive' | 'hubspot';
  // --- læs ---
  getLead(id: string): Promise<LeadInfo>;
  // --- skriv ---
  /** Opdaterer udvalgte felter på et lead (PATCH – overskriver ikke andre felter). */
  updateLead(id: string, fields: LeadUpdate): Promise<void>;
  /** Logger outreach som note på leadet. Returnerer note-id (bruges til rollback). */
  addOutreachNote(leadId: string, note: OutreachNote): Promise<string>;
  /** Sletter en note (rollback). */
  deleteNote(noteId: string): Promise<void>;
}

export interface LeadUpdate {
  title?: string;
}

export class CrmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CrmError';
  }
}
