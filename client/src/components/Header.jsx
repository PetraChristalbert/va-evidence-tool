import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, History, Settings } from 'lucide-react';

export default function Header({ showHistory, setShowHistory }) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-xl shadow-sm">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
        
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-sky-500 to-blue-600 shadow-[0_2px_12px_rgba(2,132,199,.3)]">
          <Shield className="w-5 h-5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-slate-800 font-bold text-base leading-none tracking-tight">Evidence Processors</h1>
          <p className="text-slate-500 text-xs mt-0.5 font-medium">Medical Research Packet Builder</p>
        </div>
        
        <button 
          onClick={() => setShowHistory(!showHistory)} 
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
        >
          <History className="w-4 h-4" />
          {showHistory ? 'Close History' : 'View History'}
        </button>

      </div>
    </header>
  );
}
