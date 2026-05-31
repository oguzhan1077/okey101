'use client';

import { useState } from 'react';

export default function DebugPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testGameCreate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_mode: 'single',
          team1_name: null,
          team2_name: null,
          players: ['Test1', 'Test2', 'Test3', 'Test4'],
          user_id: null,
        }),
      });
      const data = await response.json();
      setResult({ status: response.status, ok: response.ok, data });
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Debug Paneli</h1>

      <div className="space-y-4 mb-8">
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="font-semibold mb-1">NEXT_PUBLIC_SUPABASE_URL:</h2>
          <p className="font-mono text-green-400">
            {supabaseUrl ? `✅ ${supabaseUrl.substring(0, 30)}...` : '❌ Değer yok!'}
          </p>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="font-semibold mb-1">NEXT_PUBLIC_SUPABASE_ANON_KEY:</h2>
          <p className="font-mono text-green-400">
            {supabaseKey ? `✅ Değer var (${supabaseKey.length} karakter)` : '❌ Değer yok!'}
          </p>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded">
        <h2 className="text-lg font-semibold mb-3">Games API Testi</h2>
        <button
          onClick={testGameCreate}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded font-medium mb-4"
        >
          {loading ? 'Test ediliyor...' : 'Test Oyunu Oluştur'}
        </button>

        {result && (
          <div className={`p-3 rounded ${result.ok ? 'bg-green-900' : 'bg-red-900'}`}>
            <p className="font-semibold mb-2">
              {result.ok ? '✅ Başarılı' : `❌ Hata (HTTP ${result.status})`}
            </p>
            <pre className="text-xs overflow-auto text-yellow-300">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
