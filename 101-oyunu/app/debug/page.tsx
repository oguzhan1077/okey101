'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function DebugPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { user, session } = useAuth();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testFullFlow = async () => {
    if (!user) return;
    setLoading(true);
    setResult(null);
    try {
      const createRes = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_mode: 'single', players: ['A', 'B', 'C', 'D'] }),
      });
      const game = await createRes.json();
      if (!createRes.ok) { setResult({ label: 'Create hatası', game }); setLoading(false); return; }

      const finishRes = await fetch(`/api/games/${game.id}/finish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winner_name: 'A', winner_type: 'single',
          client_user_id: user.id,
          access_token: session?.access_token ?? null,
          game_statistics: {
            players: [{ name: 'A', total_score: 80, okey_count: 1, penalty_count: 0, finished_count: 1, skill_score: 12 }],
            rounds: [{ round: 1, players: [{ name: 'A', points: 20, total: 20, has_okey1: false, has_okey2: false, finished: true, hand_finished: false, individual_penalty: 0 }] }],
            total_okeys: 1, total_penalties: 0, total_finished_hands: 1,
            highest_round_score: 20, lowest_round_score: 20, team1_total_score: 0, team2_total_score: 0,
          },
        }),
      });
      const finished = await finishRes.json();
      setResult({ finish_status: finishRes.status, finish_data: finished });
    } catch (err: any) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen space-y-4">
      <h1 className="text-2xl font-bold">Debug Paneli</h1>

      <div className={`p-4 rounded ${user ? 'bg-green-900' : 'bg-red-900'}`}>
        <h2 className="font-semibold mb-1">Auth Durumu</h2>
        {user ? (
          <>
            <p>✅ Giriş yapılmış</p>
            <p className="font-mono text-xs mt-1">user.id: {user.id}</p>
            <p className="font-mono text-xs">email: {user.email}</p>
            <p className="font-mono text-xs">token: {session?.access_token ? '✅ var' : '❌ yok'}</p>
          </>
        ) : <p>❌ Giriş yapılmamış</p>}
      </div>

      <div className="bg-gray-800 p-4 rounded space-y-3">
        <h2 className="font-semibold">Env Variables</h2>
        <p className="font-mono text-xs text-green-400">{supabaseUrl ? `✅ URL: ${supabaseUrl.substring(0, 30)}...` : '❌ URL yok'}</p>
        <p className="font-mono text-xs text-green-400">{supabaseKey ? `✅ KEY: var` : '❌ KEY yok'}</p>
      </div>

      <div className="bg-gray-800 p-4 rounded space-y-3">
        <h2 className="font-semibold">Tam Akış Testi</h2>
        <button onClick={testFullFlow} disabled={loading || !user}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium">
          {loading ? 'Test ediliyor...' : 'Oyun Oluştur + Bitir'}
        </button>
        {result && (
          <pre className="text-xs overflow-auto text-green-300 bg-gray-900 p-3 rounded">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
