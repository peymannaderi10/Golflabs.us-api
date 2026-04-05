/**
 * One-time seed script: insert default legal documents for all locations
 * that don't already have them in the location_documents table.
 *
 * Usage: npx ts-node src/scripts/seed-location-documents.ts
 */
import { supabase } from '../config/database';
import { SYSTEM_DEFAULTS } from '../modules/documents/document.service';
import { DOCUMENT_TITLES, VALID_DOCUMENT_TYPES, DocumentType } from '../modules/documents/document.types';

async function seed() {
  // Get all active locations
  const { data: locations, error: locError } = await supabase
    .from('locations')
    .select('id, name')
    .eq('status', 'active')
    .is('deleted_at', null);

  if (locError || !locations?.length) {
    console.error('Failed to fetch locations:', locError?.message);
    process.exit(1);
  }

  console.log(`Found ${locations.length} location(s)`);

  for (const location of locations) {
    // Check which docs already exist for this location
    const { data: existing } = await supabase
      .from('location_documents')
      .select('document_type')
      .eq('location_id', location.id)
      .eq('is_active', true);

    const existingTypes = new Set((existing || []).map(d => d.document_type));

    for (const docType of VALID_DOCUMENT_TYPES) {
      if (existingTypes.has(docType)) {
        console.log(`  [skip] ${location.name} / ${docType} — already exists`);
        continue;
      }

      const { data, error } = await supabase
        .from('location_documents')
        .insert({
          location_id: location.id,
          document_type: docType,
          title: DOCUMENT_TITLES[docType],
          content: SYSTEM_DEFAULTS[docType],
          content_hash: 'trigger-will-compute',
        })
        .select('id, version, content_hash')
        .single();

      if (error) {
        console.error(`  [error] ${location.name} / ${docType}: ${error.message}`);
      } else {
        console.log(`  [created] ${location.name} / ${docType} v${data.version} hash=${data.content_hash.slice(0, 16)}...`);
      }
    }
  }

  console.log('Done.');
  process.exit(0);
}

seed();
