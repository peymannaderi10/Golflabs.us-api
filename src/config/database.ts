import { createClient } from '@supabase/supabase-js';
import { validateEnvironment } from './environment';

const config = validateEnvironment();
 
export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
); 