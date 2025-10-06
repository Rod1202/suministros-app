// src/app/page.tsx

// Importamos la función 'redirect' de Next.js para forzar la redirección del lado del servidor
import { redirect } from 'next/navigation';

/**
 * Este es el componente de la página raíz. 
 * Su única función es redirigir al usuario a la página de login, 
 * ya que la aplicación requiere autenticación.
 */
export default function HomePage() {
  // Redirige al usuario al endpoint de login
  redirect('/login');
}
