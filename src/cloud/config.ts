/**
 * Account server (Supabase). Both values are public by design: they only identify the
 * project; every row is protected by row-level security tied to the signed-in user.
 * Empty until the project is created — then account features appear in the app.
 */
export const SUPABASE_URL = "https://gymjrxdbbmajsonxalkm.supabase.co";
export const SUPABASE_KEY = "sb_publishable_KD_IaPSfaGREToD7v42Axw_IPm-3FmF";
/** Turned on once the Google provider is set up in the project. */
export const GOOGLE_LOGIN = false;

export const cloudConfigured = () => !!SUPABASE_URL && !!SUPABASE_KEY;
