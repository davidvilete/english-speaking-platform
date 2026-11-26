import { createClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo Supabase (service_role).
 * USO EXCLUSIVO NO SERVIDOR (Server Actions / Route Handlers).
 * Nunca importar este arquivo em componentes Client ("use client").
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no servidor.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
