import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { FullScreenLoader } from '../components/Status.tsx';
import { getSupabase } from '../lib/auth.ts';

/** OAuth redirect target on the web: supabase-js exchanges the ?code= automatically on init. */
export default function AuthCallback() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    void (async () => {
      const sb = getSupabase();
      if (sb) await (await sb).auth.getSession();
      await qc.invalidateQueries();
      navigate('/settings', { replace: true });
    })();
  }, [navigate, qc]);
  return <FullScreenLoader />;
}
