import React, { useState, useEffect } from 'react';
import { FileUp, FileText, CheckCircle2 } from 'lucide-react';

const API_URL = '/api';

export default function Home() {
  const [step, setStep] = useState('upload'); // upload, parsing, confirm, processing, complete
  const [esfFile, setEsfFile] = useState(null);
  const [memoFile, setMemoFile] = useState(null);
  const [jobId, setJobId] = useState('');
  
  // Terminal logs state
  const [logs, setLogs] = useState([]);
  
  // Job Data
  const [vetName, setVetName] = useState('');
  const [vaFileNumber, setVaFileNumber] = useState('');
  const [conditions, setConditions] = useState([]);
  
  // Progress
  const [progressMsg, setProgressMsg] = useState('');
  const [packets, setPackets] = useState({});
  const [manualUploads, setManualUploads] = useState({});
  const [manualLinks, setManualLinks] = useState({});

  const handleUpload = async () => {
    if (!esfFile) return alert("ESF is required");
    setStep('parsing');
    
    const formData = new FormData();
    const jId = window.crypto.randomUUID();
    formData.append('jobId', jId);
    formData.append('memo', memoFile || esfFile);
    
    try {
      const res = await fetch(`/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.success) {
        setJobId(data.jobId);
        // Wait for extraction job to finish
        const interval = setInterval(async () => {
          const statusRes = await fetch(`/api/status/${data.jobId}?type=extract`);
          const statusData = await statusRes.json();
          if (statusData.status === 'done') {
            setVetName(statusData.condition_packets.vet_name || "Unknown");
            setVaFileNumber(statusData.condition_packets.va_file_number || "Unknown");
            setConditions(statusData.condition_packets.illnesses_clean || []);
            setManualLinks(statusData.condition_packets.urls || {});
            setStep('confirm');
            clearInterval(interval);
          } else if (statusData.status === 'error') {
            alert("Parsing failed");
            setStep('upload');
            clearInterval(interval);
          }
        }, 2000);
      } else {
        alert('Upload failed');
        setStep('upload');
      }
    } catch (err) {
      console.error(err);
      alert('Upload failed');
      setStep('upload');
    }
  };

  const handleProcess = async () => {
    setStep('processing');
    setProgressMsg('Initializing generation...');
    setLogs(['Initializing generation...']);
    
    try {
      const formData = new FormData();
      formData.append('jobId', jobId);
      formData.append('vetName', vetName);
      formData.append('vaFileNumber', vaFileNumber);
      formData.append('conditions', JSON.stringify(conditions));
      formData.append('manualLinks', JSON.stringify(manualLinks));
      
      if (esfFile) {
        formData.append('esf', esfFile);
      }
      
      // Append manual files
      Object.keys(manualUploads).forEach(cond => {
        if (Array.isArray(manualUploads[cond])) {
            manualUploads[cond].forEach(file => {
               formData.append(`manual_${cond}`, file);
            });
        }
      });

      const res = await fetch('/api/process', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (!data.success) {
        alert('Failed to start processing');
        setStep('confirm');
        return;
      }
    } catch (err) {
      console.error(err);
      alert('Failed to start process');
      setStep('confirm');
    }
  };

  const handleCancel = async () => {
    try {
      await fetch(`/api/cancel/${jobId}`, {
        method: 'POST'
      });
      setStep('confirm');
      setProgressMsg('');
      setLogs([]);
    } catch (err) {
      console.error('Failed to cancel', err);
    }
  };

  const handleContinue = async () => {
    try {
      // Immediately give UI feedback
      setProgressMsg('Resuming worker...');
      setLogs(prev => [...prev, 'Resuming worker...']);
      
      await fetch(`/api/continue/${jobId}`, {
        method: 'POST'
      });
    } catch (err) {
      console.error('Failed to continue', err);
    }
  };

  useEffect(() => {
    let interval;
    if (step === 'processing') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/status/${jobId}?type=process-pdf`);
          const data = await res.json();
          
          if (data.status === 'done') {
            setStep('complete');
            setPackets(data.condition_packets || {});
            clearInterval(interval);
          } else if (data.status === 'error') {
            alert('Processing error');
            clearInterval(interval);
          } else {
            setProgressMsg(data.message || 'Processing...');
            if (data.message) {
              setLogs(prev => {
                // Only append if it's different from the last log
                if (prev[prev.length - 1] !== data.message) {
                  return [...prev, data.message];
                }
                return prev;
              });
            }
          }
        } catch (err) {
          console.error(err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [step, jobId]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      {step === 'upload' && (
        <section className="animate-in fade-in">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 border border-sky-200 text-sky-800 text-xs font-medium mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
              VA Medical Evidence Processing Platform V2
            </div>
            <h2 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">Build Evidence Packets</h2>
            <p className="text-slate-500 text-base max-w-xl mx-auto leading-relaxed">
              Upload your Evidence Summary Form and an optional veteran memorandum. Add conditions and research URLs to generate per-condition PDF packets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-gradient-to-br from-sky-500 to-blue-600">1</span>
                <span className="text-slate-900 font-semibold text-sm">Evidence Summary Form (ESF)</span>
                <span className="ml-auto text-red-500 text-xs font-medium">required</span>
              </div>
              <label className={`drop-zone p-8 text-center block ${esfFile ? 'has-file' : ''}`}>
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-sky-50 border border-sky-100">
                  <FileText className="w-7 h-7 text-sky-500" />
                </div>
                <p className="text-slate-900 font-semibold text-sm mb-1">{esfFile ? esfFile.name : 'Drop .pdf ESF here'}</p>
                <p className="text-slate-500 text-xs mb-4">One filled copy created per condition</p>
                <input type="file" className="hidden" accept=".pdf" onChange={(e) => setEsfFile(e.target.files[0])} />
              </label>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-bold shrink-0">2</span>
                <span className="text-slate-900 font-semibold text-sm">Veteran Memorandum</span>
              </div>
              <label className={`drop-zone p-8 text-center block ${memoFile ? 'has-file' : ''}`}>
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-slate-50 border border-slate-200">
                  <FileUp className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-slate-900 font-semibold text-sm mb-1">{memoFile ? memoFile.name : 'Drop .docx or .pdf'}</p>
                <p className="text-slate-500 text-xs mb-4">optional — auto-fills veteran information</p>
                <input type="file" className="hidden" accept=".docx,.pdf" onChange={(e) => setMemoFile(e.target.files[0])} />
              </label>
            </div>
          </div>

          <div className="text-center mt-8">
            <button onClick={handleUpload} className="btn-primary" disabled={!esfFile}>
              Continue to Packet Builder
            </button>
          </div>
        </section>
      )}

      {step === 'parsing' && (
        <section className="glass rounded-2xl p-12 max-w-lg mx-auto text-center animate-in zoom-in-95">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center bg-indigo-500/15 border border-indigo-500/30">
            <div className="spinner w-7 h-7 border-[3px]"></div>
          </div>
          <h2 className="text-slate-900 font-bold text-xl mb-2">Analyzing memorandum…</h2>
          <p className="text-slate-500 text-sm leading-relaxed">Extracting conditions, veteran info, and research links</p>
        </section>
      )}

      {step === 'confirm' && (
        <section className="animate-in fade-in">
           <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-1 tracking-tight">Confirm Details</h2>
            <p className="text-slate-500 text-sm">Verify extracted information.</p>
          </div>
          <div className="glass-elevated rounded-xl px-6 py-5 flex flex-col gap-4 mb-6">
             <div>
               <label className="block text-sm font-semibold text-slate-700 mb-1">Veteran Full Name</label>
               <input type="text" value={vetName} onChange={e=>setVetName(e.target.value)} placeholder="e.g. DOCKERY KELLI" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20" />
             </div>
             <div>
               <label className="block text-sm font-semibold text-slate-700 mb-1">Social Security Number (SSN)</label>
               <input type="text" value={vaFileNumber} onChange={e=>setVaFileNumber(e.target.value)} placeholder="000-00-0000" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20" />
             </div>
             <div className="mt-4">
                <h3 className="text-slate-900 font-semibold mb-2">Conditions to Process:</h3>
                 {conditions.map((c, i) => (
                    <div key={i} className="flex flex-col bg-slate-50 p-3 rounded-lg mb-2">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-slate-700 font-medium">{c}</span>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-sky-700 cursor-pointer hover:text-sky-800 font-medium px-2 py-1 bg-sky-100 rounded">
                                    + Add PDF
                                    <input type="file" multiple className="hidden" accept=".pdf" onChange={(e) => {
                                        if (e.target.files.length > 0) {
                                            const newFiles = Array.from(e.target.files);
                                            setManualUploads({...manualUploads, [c]: [...(manualUploads[c] || []), ...newFiles]});
                                        }
                                    }} />
                                </label>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mb-2">
                            {manualUploads[c]?.map((file, idx) => (
                                <div key={`file-${idx}`} className="flex items-center justify-between bg-slate-100 p-2 rounded">
                                    <div className="flex items-center gap-2 overflow-hidden w-full pr-2">
                                        <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                                        <span className="text-xs text-slate-700 truncate">{file.name}</span>
                                    </div>
                                    <button onClick={() => {
                                        const newFiles = [...manualUploads[c]];
                                        newFiles.splice(idx, 1);
                                        setManualUploads({...manualUploads, [c]: newFiles});
                                    }} className="text-red-600 text-xs hover:text-red-700 whitespace-nowrap shrink-0">Remove</button>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-col gap-2">
                            {manualLinks[c]?.map((link, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-slate-100 p-2 rounded">
                                    <span className="text-xs text-slate-700 truncate w-full pr-2">{link}</span>
                                    <button onClick={() => {
                                        const newLinks = [...manualLinks[c]];
                                        newLinks.splice(idx, 1);
                                        setManualLinks({...manualLinks, [c]: newLinks});
                                    }} className="text-red-600 text-xs hover:text-red-700 whitespace-nowrap shrink-0">Remove</button>
                                </div>
                            ))}
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Paste URL here..." 
                                    id={`link-input-${i}`}
                                    className="w-full bg-slate-100 border border-slate-200 rounded px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (e.target.value) {
                                                setManualLinks({...manualLinks, [c]: [...(manualLinks[c] || []), e.target.value]});
                                                e.target.value = '';
                                            }
                                        }
                                    }}
                                />
                                <button onClick={() => {
                                    const input = document.getElementById(`link-input-${i}`);
                                    if (input.value) {
                                        setManualLinks({...manualLinks, [c]: [...(manualLinks[c] || []), input.value]});
                                        input.value = '';
                                    }
                                }} className="px-3 py-2 bg-sky-100 text-sky-700 font-medium text-xs rounded hover:bg-sky-200 whitespace-nowrap shrink-0">
                                    Add Link
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
             </div>
          </div>
          <div className="text-center p-8 glass rounded-2xl">
             <button onClick={handleProcess} className="btn-primary">Generate Packets</button>
          </div>
        </section>
      )}

      {step === 'processing' && (
        <section className="glass rounded-2xl p-8 max-w-2xl mx-auto text-center animate-in fade-in flex flex-col items-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-500/15 border border-indigo-500/30 mx-auto mb-4">
             <div className="spinner"></div>
          </div>
          <h2 className="text-slate-900 font-bold text-lg mb-4">Building evidence packets...</h2>
          
          <div className="w-full bg-slate-100 border border-slate-200 rounded-lg p-4 text-left font-mono text-xs overflow-y-auto max-h-48 flex flex-col gap-1 shadow-inner">
             {logs.length === 0 && <div className="text-slate-500">Waiting for worker logs...</div>}
             {logs.map((log, i) => (
                 <div key={i} className="text-sky-800 animate-in fade-in slide-in-from-bottom-2">
                     <span className="text-slate-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                     {log}
                 </div>
             ))}
             {/* Auto scroll anchor */}
             <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
          
          <div className="mt-6 flex gap-4">
            <button onClick={handleCancel} className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 font-semibold rounded border border-red-500/30 transition-colors">
               Force Stop Process
            </button>
            {progressMsg && progressMsg.includes('CAPTCHA') && (
              <button onClick={handleContinue} className="px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:text-green-300 font-semibold rounded border border-green-500/30 transition-colors shadow-[0_0_15px_rgba(74,222,128,0.5)] animate-pulse">
                 I Have Solved the CAPTCHA! Continue ➡️
              </button>
            )}
          </div>
        </section>
      )}

      {step === 'complete' && (
        <section className="glass rounded-2xl p-8 max-w-2xl mx-auto text-center animate-in fade-in">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-500/15 border border-green-500/30 mx-auto mb-4">
             <CheckCircle2 className="w-6 h-6 text-green-400" />
          </div>
          <h2 className="text-slate-900 font-bold text-lg mb-4">Done! Packets Generated:</h2>
          <div className="flex flex-col gap-2">
            {Object.keys(packets).map(cond => (
                <div key={cond} className="bg-slate-50 rounded-lg p-3 text-slate-700 flex justify-between items-center">
                    <span>{cond}</span>
                    <a href={`/api/download/${packets[cond].split('/').pop()}`} target="_blank" className="text-sky-600 hover:text-sky-700 font-medium">Download</a>
                </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
