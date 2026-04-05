export type DocumentType = 'terms_of_service' | 'privacy_policy' | 'liability_waiver';

export const VALID_DOCUMENT_TYPES: DocumentType[] = ['terms_of_service', 'privacy_policy', 'liability_waiver'];

export const DOCUMENT_TITLES: Record<DocumentType, string> = {
  terms_of_service: 'Terms of Service',
  privacy_policy: 'Privacy Policy',
  liability_waiver: 'Liability Waiver and Release',
};

export interface LocationDocument {
  id: string;
  location_id: string;
  document_type: DocumentType;
  version: number;
  title: string;
  content: string;
  content_hash: string;
  is_active: boolean;
  published_by: string | null;
  created_at: string;
}

export interface ActiveDocumentInfo {
  title: string;
  content: string;
  contentHash: string;
  version: number;
  isDefault: boolean;
}

export type ActiveDocumentSet = Record<DocumentType, ActiveDocumentInfo>;
