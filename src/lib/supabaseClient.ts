// src/lib/supabaseClient.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Define las variables de entorno
const supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Inicializa y exporta el cliente Supabase.
 * Este cliente se utiliza para todas las operaciones en el lado del cliente (navegador),
 * como autenticación y consultas básicas de datos públicos/con RLS activado.
 * * @returns {SupabaseClient} Instancia del cliente Supabase.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// NOTA: Para operaciones de servidor que requieran privilegios elevados (por ejemplo, 
// bypass de RLS para administradores), se recomienda usar el token 'service_role' 
// en un archivo de servidor (ej: API routes o Server Actions), NUNCA en el cliente.
