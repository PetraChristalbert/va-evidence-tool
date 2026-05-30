import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, History, Settings } from 'lucide-react';

export default function Header() {
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

      </div>
    </header>
  );
}
