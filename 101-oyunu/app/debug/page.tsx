'use client';

export default function DebugPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Environment Variables Debug</h1>
      
      <div className="space-y-4">
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="font-semibold">NEXT_PUBLIC_SUPABASE_URL:</h2>
          <p className="font-mono text-green-400">
            {supabaseUrl ? `✅ Değer var: ${supabaseUrl.substring(0, 20)}...` : '❌ Değer yok!'}
          </p>
        </div>
        
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="font-semibold">NEXT_PUBLIC_SUPABASE_ANON_KEY:</h2>
          <p className="font-mono text-green-400">
            {supabaseKey ? `✅ Değer var: ${supabaseKey.substring(0, 20)}...` : '❌ Değer yok!'}
          </p>
        </div>

        <div className="bg-gray-800 p-4 rounded">
          <h2 className="font-semibold">Tüm Environment Variables:</h2>
          <pre className="text-sm text-yellow-400">
            {JSON.stringify(
              Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC')),
              null,
              2
            )}
          </pre>
        </div>
      </div>
    </div>
  );
} 