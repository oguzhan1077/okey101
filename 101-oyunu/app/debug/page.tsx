'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function DebugPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { user, session } = useAuth();

  // public.users'da bu kullanıcı var mı?
  const checkPublicUsers = async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setResult(null);
    const { data, error } = await supabase.from('users').select('id').eq('id', user.id);
    setResult({ label: 'public.users kontrolü', data, error: error?.message });
    setLoading(false);
  };

  // Gerçek user_id ile bir game oluştur ve finish et
  const testFullFlow = async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setResult(null);
    try {
      // 1. Oyun oluştur
      const createRes = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_mode: 'single', players: ['A', 'B', 'C', 'D'] }),
      });
      const game = await createRes.json();
      if (!createRes.ok) { setResult({ label: 'Create hatası', game }); setLoading(false); return; }

      // 2. Finish et
      const sampleStats = {
        players: [
          { name: 'A', total_score: 80, okey_count: 1, penalty_count: 0, finished_count: 1, skill_score: 12 },
          { name: 'B', total_score: 120, okey_count: 0, penalty_count: 1, finished_count: 0, skill_score: -15 },
          { name: 'C', total_score: 100, okey_count: 0, penalty_count: 0, finished_count: 0, skill_score: -5 },
          { name: 'D', total_score: 110, okey_count: 0, penalty_count: 0, finished_count: 0, skill_score: -8 },
        ],
        rounds: [
          { round: 1, players: [
            { name: 'A', points: 20, penalty: 0, individual_penalty: 0, has_okey1: true, has_okey2: false, total: 20, finished: true, hand_finished: false },
            { name: 'B', points: 30, penalty: 0, individual_penalty: 0, has_okey1: false, has_okey2: false, total: 30, finished: false, hand_finished: false },
            { name: 'C', points: 25, penalty: 0, individual_penalty: 0, has_okey1: false, has_okey2: false, total: 25, finished: false, hand_finished: false },
            { name: 'D', points: 28, penalty: 0, individual_penalty: 0, has_okey1: false, has_okey2: false, total: 28, finished: false, hand_finished: false },
          ]},
        ],
        total_okeys: 1, total_penalties: 1, total_finished_hands: 1,
        highest_round_score: 30, lowest_round_score: 20,
        team1_total_score: 0, team2_total_score: 0,
      };
      const finishRes = await fetch(`/api/games/${game.id}/finish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner_name: 'A', winner_type: 'single', client_user_id: user.id, access_token: session?.access_token ?? null, game_statistics: sampleStats }),
      });
      const finished = await finishRes.json();

      // 3. Sonucu oku
      const { data: check } = await supabase.from('games').select('id, user_id, finished_at').eq('id', game.id).single();
      setResult({ label: 'Tam akış testi', game_id: game.id, finish_status: finishRes.status, finish_data: finished, db_check: check });
    } catch (err: any) {
      setResult({ label: 'Hata', error: err.message });
    }
    setLoading(false);
  };

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen space-y-4">
      <h1 className="text-2xl font-bold">Debug Paneli</h1>

      {/* Auth Durumu */}
      <div className={`p-4 rounded ${user ? 'bg-green-900' : 'bg-red-900'}`}>
        <h2 className="font-semibold mb-2">Auth Durumu</h2>
        {user ? (
          <>
            <p>✅ Giriş yapılmış</p>
            <p className="font-mono text-xs mt-1">user.id: {user.id}</p>
            <p className="font-mono text-xs">email: {user.email}</p>
            <p className="font-mono text-xs">session token: {session?.access_token ? '✅ var' : '❌ yok'}</p>
          </>
        ) : (
          <p>❌ Giriş yapılmamış</p>
        )}
      </div>

      {/* Testler */}
      <div className="bg-gray-800 p-4 rounded space-y-3">
        <h2 className="text-lg font-semibold">Testler</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={checkPublicUsers} disabled={loading || !user}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-2 rounded text-sm font-medium">
            public.users kontrolü
          </button>
          <button onClick={testFullFlow} disabled={loading || !user}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-2 rounded text-sm font-medium">
            Tam akış testi (oluştur + bitir + kontrol)
          </button>
        </div>

        {result && (
          <div className="bg-gray-900 p-3 rounded">
            <p className="font-semibold mb-2 text-yellow-400">{result.label}</p>
            <pre className="text-xs overflow-auto text-green-300">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
