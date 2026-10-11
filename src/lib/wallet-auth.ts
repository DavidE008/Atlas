import { supabase } from "@/integrations/supabase/client";

export async function requireAuthenticatedWalletUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Create an Atlas account or sign in before connecting a wallet.");
  }
  return data.user;
}
