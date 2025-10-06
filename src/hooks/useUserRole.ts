// src/hooks/useUserRole.ts
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Tipado del perfil del usuario
export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null; // Un único rol por usuario
}

/**
 * Hook para obtener el perfil y el rol actual del usuario autenticado.
 */
export const useUserRole = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);

      // 1️⃣ Obtener el usuario autenticado
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error('Error al obtener el usuario:', userError);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (user) {
        // 2️⃣ Obtener información básica del perfil
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', user.id)
          .single();

        // 3️⃣ Obtener el rol desde la tabla "roles"
        const { data: roleData, error: roleError } = await supabase
          .from('roles')
          .select('rol_nombre')
          .eq('user_id', user.id)
          .single();

        if (profileError || roleError) {
          console.error('Error al cargar perfil o rol:', profileError || roleError);
          setProfile(null);
        } else if (profileData) {
          setProfile({
            id: profileData.id,
            full_name: profileData.full_name,
            email: profileData.email,
            role: roleData?.rol_nombre ?? null,
          });
        }
      } else {
        // Usuario no autenticado
        setProfile(null);
      }

      setLoading(false);
    };

    // 4️⃣ Suscripción a cambios de sesión (login/logout)
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    // 5️⃣ Ejecutar al montar
    fetchProfile();

    // 6️⃣ Limpiar al desmontar
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 🔐 Verificación de permisos según rol
  const hasAccess = (allowedRoles: string[]) => {
    if (!profile?.role) return false;
    return allowedRoles.includes(profile.role);
  };

  return { profile, loading, hasAccess };
};
