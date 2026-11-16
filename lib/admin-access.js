import { cookies } from 'next/headers';
import { findUserBySession } from './users';

export const ADMIN_SECTIONS = ['sites', 'categories', 'wallpapers'];

export function isAdminSection(value) {
  return ADMIN_SECTIONS.includes(String(value || ''));
}

export function isAdminNextPath(value) {
  const next = String(value || '');
  if (next === '/admin') return true;
  return /^\/admin\/(sites|categories|wallpapers)$/.test(next);
}

export async function loadAdminUser() {
  try {
    const jar = await cookies();
    const user = await findUserBySession(jar.get('wa_session')?.value || '');
    return { user, failed: false };
  } catch {
    return { user: null, failed: true };
  }
}
