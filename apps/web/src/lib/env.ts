import { Capacitor } from '@capacitor/core';

const e = import.meta.env;

export const env = {
  googleMapsKey: (e.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '',
  googleMapId: (e.VITE_GOOGLE_MAP_ID as string | undefined) || 'DEMO_MAP_ID',
  supabaseUrl: (e.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseAnonKey: (e.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  /** Absolute API origin for the native app; the web app uses same-origin requests. */
  apiBase: ((e.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, ''),
  /** Public URL of the web app, used for share links from the native app. */
  publicUrl: ((e.VITE_PUBLIC_URL as string | undefined) ?? '').replace(/\/$/, ''),
  streetViewMock: e.VITE_STREETVIEW_MOCK === '1',
};

export const isNative = Capacitor.isNativePlatform();
export const useSupabaseAuth = env.supabaseUrl !== '' && env.supabaseAnonKey !== '';

export function shareUrl(path: string): string {
  const origin = isNative ? env.publicUrl || env.apiBase : window.location.origin;
  return `${origin}${path}`;
}
