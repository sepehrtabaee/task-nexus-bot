import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

let session = null;

export async function getAuthToken() {
  if (session && new Date(session.expires_at * 1000) > Date.now()) {
    return session.access_token;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: config.supabaseBotEmail,
    password: config.supabaseBotPassword,
  });

  if (error) throw new Error(`Supabase auth failed: ${error.message}`);
  session = data.session;
  return session.access_token;
}
