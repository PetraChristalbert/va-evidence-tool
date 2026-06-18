import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

export default function History() {
  const [cases, setCases] = useState([]);
  
  // Mock data for display
  useEffect(() => {
    setCases([
      { id: '1', vet_name: 'John Doe', va_file_number: '12345678', status: 'done', updated: Date.now() / 1000 },
      { id: '2', vet_name: 'Jane Smith', va_file_number: '87654321', status: 'processing', updated: Date.now() / 1000 }
    ]);
  }, []);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-7 gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Case History</h1>
          <p className="text-slate-500 text-xs mt-0.5">All veteran cases and packet work</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            className="bg-white/5 border border-white/10 rounded-lg text-slate-200 text-sm py-2 pl-9 pr-4 w-64 focus:outline-none focus:border-indigo-500/50" 
            placeholder="Search name or VA file #..." 
          />
        </div>
      </div>

      <div className="space-y-4">
        {cases.map(c => (
          <div key={c.id} className="glass rounded-2xl p-5 hover:bg-white/[.055] transition-colors">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-white font-bold text-base">{c.vet_name}</h3>
                <p className="text-xs text-slate-500 mt-1">VA# {c.va_file_number} · Status: {c.status}</p>
              </div>
              <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg">
                View
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
