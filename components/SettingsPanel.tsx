



import React, { useEffect, useState } from 'react';
import { X, Star, Volume2, Type, Eye, Zap, BookOpen, AlignLeft, AlignJustify, Bold, Italic, Scroll, Book, Maximize2, Move, Clock, ChevronsDown, Timer, AlignJustifyIcon, Layout, Columns, Sidebar, BookOpenText, Disc, Repeat, Activity, Layers, Grid, Target, ArrowDown, AlignCenter, ArrowUp, Square, RotateCcw, Crosshair, BoxSelect, Database, Upload, Download, Keyboard, ArrowLeft, ArrowRight } from 'lucide-react';
import { AppSettings, VoiceSettings, ReadingMode, KeyBindings } from '../types';
import { exportBackup, importBackup } from '../services/storage';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
  voiceSettings: VoiceSettings;
  onVoiceSettingsChange: (v: VoiceSettings) => void;
  activeMode?: ReadingMode;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen, onClose, settings, onSettingsChange, voiceSettings, onVoiceSettingsChange, activeMode
}) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [configTab, setConfigTab] = useState<ReadingMode>(activeMode || 'spritz');
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [listeningForKey, setListeningForKey] = useState<keyof KeyBindings | null>(null);

  useEffect(() => {
    if (activeMode) setConfigTab(activeMode);
  }, [activeMode]);

  useEffect(() => {
    const loadVoices = () => {
      const vs = window.speechSynthesis.getVoices();
      setVoices(vs);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);
  
  // Key Binder Listener
  useEffect(() => {
      if (!listeningForKey) return;
      const handler = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopPropagation();
          
          let newKey = e.key;
          if (newKey === ' ') newKey = ' '; // normalize space if needed, though ' ' is standard

          onSettingsChange({
              ...settings,
              keyBindings: {
                  ...settings.keyBindings,
                  [listeningForKey]: newKey
              }
          });
          setListeningForKey(null);
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
  }, [listeningForKey, settings, onSettingsChange]);

  if (!isOpen) return null;

  const toggleFavorite = (uri: string) => {
    const favs = voiceSettings.favorites.includes(uri)
      ? voiceSettings.favorites.filter(f => f !== uri)
      : [...voiceSettings.favorites, uri];
    onVoiceSettingsChange({ ...voiceSettings, favorites: favs });
  };

  const filteredVoices = voices.filter(v => 
    v.name.toLowerCase().includes(voiceSearch.toLowerCase()) || 
    v.lang.toLowerCase().includes(voiceSearch.toLowerCase())
  ).sort((a, b) => {
    const aFav = voiceSettings.favorites.includes(a.voiceURI);
    const bFav = voiceSettings.favorites.includes(b.voiceURI);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return 0;
  });

  const SectionHeader = ({ title, icon: Icon }: { title: string, icon: any }) => (
    <div className="flex items-center gap-2 mb-6 pb-2 border-b-2 border-slate-100">
        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{title}</h3>
    </div>
  );

  const getVoiceEnabledState = () => {
    switch(configTab) {
        case 'wheel': return voiceSettings.wheelEnabled;
        case 'tiktok': return voiceSettings.tiktokEnabled;
        case 'spritz': return voiceSettings.spritzEnabled;
        default: return voiceSettings.normalEnabled;
    }
  }

  const toggleVoiceEnabled = (val: boolean) => {
    switch(configTab) {
        case 'wheel': onVoiceSettingsChange({ ...voiceSettings, wheelEnabled: val }); break;
        case 'tiktok': onVoiceSettingsChange({ ...voiceSettings, tiktokEnabled: val }); break;
        case 'spritz': onVoiceSettingsChange({ ...voiceSettings, spritzEnabled: val }); break;
        default: onVoiceSettingsChange({ ...voiceSettings, normalEnabled: val }); break;
    }
  }

  const handleBackup = async () => {
    setIsBackupLoading(true);
    try {
        const json = await exportBackup();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zenread-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('Backup failed');
        console.error(e);
    } finally {
        setIsBackupLoading(false);
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!confirm("Restoring will overwrite existing items with the same ID. Are you sure you want to proceed?")) {
        e.target.value = '';
        return;
    }

    setIsBackupLoading(true);
    try {
        const text = await file.text();
        await importBackup(text);
        alert('Restore successful. The app will reload to apply changes.');
        window.location.reload();
    } catch (e) {
        alert('Restore failed. Please check the file format.');
        console.error(e);
    } finally {
        setIsBackupLoading(false);
        e.target.value = '';
    }
  };

  // Helper to map internal mode to display name
  const getModeDisplayName = (mode: ReadingMode) => {
    switch(mode) {
        case 'scroll': return 'Continuous';
        case 'paginated': return 'Paginated';
        case 'wheel': return 'Wheel';
        case 'tiktok': return 'Viral';
        case 'spritz': return 'Spritz';
        default: return mode;
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div 
        className="w-full max-w-md bg-white h-full shadow-2xl relative animate-in slide-in-from-right duration-300 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
            <h2 className="text-xl font-bold text-slate-800">Settings</h2>
            <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-600" />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <SectionHeader title="Visual" icon={Type} />

          <section className="mb-10">
             {/* Global Settings */}
             <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                 <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Global UI Scale</span>
                    <span>{Math.round(settings.uiScale * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.8" 
                  max="1.5" 
                  step="0.05"
                  value={settings.uiScale || 1.1} 
                  onChange={(e) => onSettingsChange({ ...settings, uiScale: Number(e.target.value) })}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
             </div>

             {/* Library Settings (Only visible when no active book is open) */}
             {!activeMode && (
                <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Library Card Size</label>
                    <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                        {(['small', 'medium', 'large'] as const).map(size => (
                            <button
                                key={size}
                                onClick={() => onSettingsChange({ ...settings, libraryCardSize: size })}
                                className={`flex-1 py-1.5 text-xs font-medium rounded capitalize ${settings.libraryCardSize === size ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {size}
                            </button>
                        ))}
                    </div>
                </div>
             )}

            {!activeMode && (
              <div className="flex p-1 bg-slate-100 rounded-lg mb-6 gap-1 overflow-x-auto">
                <button 
                  onClick={() => setConfigTab('spritz')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${configTab === 'spritz' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Zap className="w-3.5 h-3.5" /> Spritz
                </button>
                 <button 
                  onClick={() => setConfigTab('wheel')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${configTab === 'wheel' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Disc className="w-3.5 h-3.5" /> Wheel
                </button>
                 <button 
                  onClick={() => setConfigTab('tiktok')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${configTab === 'tiktok' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Activity className="w-3.5 h-3.5" /> Viral
                </button>
                <button 
                  onClick={() => setConfigTab('scroll')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${configTab === 'scroll' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Scroll className="w-3.5 h-3.5" /> Continuous
                </button>
                <button 
                  onClick={() => setConfigTab('paginated')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${configTab === 'paginated' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <BookOpenText className="w-3.5 h-3.5" /> Paginated
                </button>
              </div>
            )}
            
            <div className="space-y-8">
              {(configTab === 'spritz' || configTab === 'wheel' || configTab === 'tiktok') && (
                <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-6">
                   <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Reading Speed (WPM)</label>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range" 
                        min="100" 
                        max="1000" 
                        step="10"
                        value={settings.spritzWpm} 
                        onChange={(e) => onSettingsChange({ ...settings, spritzWpm: Number(e.target.value) })}
                        disabled={getVoiceEnabledState()}
                        className={`flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 ${getVoiceEnabledState() ? 'opacity-50' : ''}`}
                      />
                      <span className="w-12 text-right font-mono text-slate-600">{settings.spritzWpm}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Text Size</label>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range" 
                        min="16" 
                        max="128" 
                        value={settings.spritzFontSize} 
                        onChange={(e) => onSettingsChange({ ...settings, spritzFontSize: Number(e.target.value) })}
                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <span className="w-12 text-right font-mono text-slate-600">{settings.spritzFontSize}px</span>
                    </div>
                  </div>
                  
                  {configTab === 'wheel' && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                            type="checkbox"
                            checked={settings.wheelContinuousMode}
                            onChange={(e) => onSettingsChange({ ...settings, wheelContinuousMode: e.target.checked })}
                            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <div className="flex items-center gap-2">
                            <Repeat className="w-4 h-4 text-slate-500" />
                            <span className="font-medium text-slate-700">Continuous Spin</span>
                        </div>
                        </label>
                    </div>
                  )}

                  {configTab === 'tiktok' && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-5">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={settings.tiktokBuildUp ?? true}
                                onChange={(e) => onSettingsChange({ ...settings, tiktokBuildUp: e.target.checked })}
                                className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-slate-500" />
                                <span className="font-medium text-slate-700">Build Up Mode</span>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={settings.tiktokShowWholeChunk ?? false}
                                onChange={(e) => onSettingsChange({ ...settings, tiktokShowWholeChunk: e.target.checked })}
                                className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                            <div className="flex items-center gap-2">
                                <Square className="w-4 h-4 text-slate-500" />
                                <span className="font-medium text-slate-700">Show Whole Block</span>
                            </div>
                        </label>

                         <div className="border-t border-slate-100 pt-4">
                            <button
                                onClick={() => onSettingsChange({ ...settings, tiktokCustomPosition: null })}
                                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-slate-500 bg-slate-100 rounded hover:bg-slate-200"
                            >
                                <RotateCcw className="w-3 h-3" /> Reset Position
                            </button>
                        </div>

                        <div className="border-t border-slate-100 pt-4">
                            <label className="flex items-center gap-3 cursor-pointer mb-3">
                                <input 
                                    type="checkbox"
                                    checked={settings.tiktokNoOverlap ?? false}
                                    onChange={(e) => onSettingsChange({ ...settings, tiktokNoOverlap: e.target.checked })}
                                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <div className="flex items-center gap-2">
                                    <Grid className="w-4 h-4 text-slate-500" />
                                    <span className="font-medium text-slate-700">Stack Mode (Align)</span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 cursor-pointer mt-3">
                                <input 
                                    type="checkbox"
                                    checked={settings.tiktokAllCaps ?? false}
                                    onChange={(e) => onSettingsChange({ ...settings, tiktokAllCaps: e.target.checked })}
                                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <div className="flex items-center gap-2">
                                    <Type className="w-4 h-4 text-slate-500" />
                                    <span className="font-medium text-slate-700">All Caps</span>
                                </div>
                            </label>
                            
                            {settings.tiktokNoOverlap && (
                                <div className="space-y-4 pl-8 animate-in slide-in-from-left-2 mt-4">
                                     {/* Alignment */}
                                    <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                                        <button
                                            onClick={() => onSettingsChange({...settings, tiktokAlign: 'center'})}
                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.tiktokAlign === 'center' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <AlignCenter className="w-3 h-3" /> Center
                                        </button>
                                        <button
                                            onClick={() => onSettingsChange({...settings, tiktokAlign: 'left'})}
                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.tiktokAlign === 'left' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <AlignLeft className="w-3 h-3" /> Left
                                        </button>
                                    </div>

                                    {/* Vertical Alignment */}
                                     <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                                        <button
                                            onClick={() => onSettingsChange({...settings, tiktokVerticalAlign: 'top'})}
                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.tiktokVerticalAlign === 'top' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <ArrowUp className="w-3 h-3" /> Top
                                        </button>
                                         <button
                                            onClick={() => onSettingsChange({...settings, tiktokVerticalAlign: 'center'})}
                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${(settings.tiktokVerticalAlign || 'center') === 'center' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <AlignCenter className="w-3 h-3" /> Mid
                                        </button>
                                        <button
                                            onClick={() => onSettingsChange({...settings, tiktokVerticalAlign: 'bottom'})}
                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.tiktokVerticalAlign === 'bottom' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <ArrowDown className="w-3 h-3" /> Bot
                                        </button>
                                    </div>

                                    {/* Layout Direction */}
                                     <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                                        <button
                                            onClick={() => onSettingsChange({...settings, tiktokLayout: 'row'})}
                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.tiktokLayout === 'row' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <Layout className="w-3 h-3" /> Row
                                        </button>
                                        <button
                                            onClick={() => onSettingsChange({...settings, tiktokLayout: 'column'})}
                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.tiktokLayout === 'column' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <ArrowDown className="w-3 h-3" /> Column
                                        </button>
                                    </div>
                                    
                                    {/* Words Per Line */}
                                     <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Words Per Line</label>
                                        <div className="flex items-center gap-3">
                                            <input 
                                                type="range" 
                                                min="0" max="8" step="1"
                                                value={settings.tiktokWordsPerLine ?? 0}
                                                onChange={(e) => onSettingsChange({ ...settings, tiktokWordsPerLine: Number(e.target.value) })}
                                                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                            />
                                            <span className="w-8 text-center font-mono text-slate-600 text-xs">{(settings.tiktokWordsPerLine === 0) ? 'Auto' : settings.tiktokWordsPerLine}</span>
                                        </div>
                                     </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="border-t border-slate-100 pt-4">
                            <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Chunk Size (Build Up)</label>
                            <div className="flex items-center gap-3 mb-3">
                                <input 
                                    type="range" 
                                    min="1" max="15" step="1"
                                    value={settings.tiktokWordCount ?? 3}
                                    onChange={(e) => onSettingsChange({ ...settings, tiktokWordCount: Number(e.target.value) })}
                                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                                <span className="w-8 text-center font-mono text-slate-600">{settings.tiktokWordCount ?? 3}</span>
                            </div>
                            
                            <div className="flex bg-white rounded-lg border border-slate-200 p-1 mb-4">
                                <button
                                    onClick={() => onSettingsChange({...settings, tiktokCountMode: 'exact'})}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.tiktokCountMode === 'exact' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <Target className="w-3 h-3" /> Exact
                                </button>
                                <button
                                    onClick={() => onSettingsChange({...settings, tiktokCountMode: 'range'})}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${(settings.tiktokCountMode || 'range') === 'range' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <Activity className="w-3 h-3" /> Range
                                </button>
                            </div>
                        </div>

                    </div>
                  )}

                  {configTab === 'spritz' && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="flex items-center gap-3 cursor-pointer mb-4">
                      <input 
                        type="checkbox"
                        checked={settings.showGhostWords}
                        onChange={(e) => onSettingsChange({ ...settings, showGhostWords: e.target.checked })}
                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-slate-500" />
                        <span className="font-medium text-slate-700">Show Ghost Words</span>
                      </div>
                    </label>

                    {settings.showGhostWords && (
                        <div className="pl-8 animate-in slide-in-from-top-2 space-y-4">
                             <div className="space-y-2">
                                <div className="text-xs font-semibold text-slate-500 uppercase">Ghost Layout</div>
                                <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                                    <button
                                        onClick={() => onSettingsChange({...settings, spritzGhostLayout: 'vertical'})}
                                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.spritzGhostLayout === 'vertical' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <AlignJustifyIcon className="w-3 h-3" /> Vertical
                                    </button>
                                    <button
                                        onClick={() => onSettingsChange({...settings, spritzGhostLayout: 'horizontal'})}
                                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.spritzGhostLayout === 'horizontal' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <Layout className="w-3 h-3 rotate-90" /> Horizontal
                                    </button>
                                </div>
                             </div>

                             <div className="space-y-2">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Ghost Opacity</label>
                                    <span className="text-xs font-mono bg-slate-200 px-1.5 rounded">{Math.round((settings.spritzGhostOpacity ?? 0.5) * 100)}%</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0.1" 
                                    max="1" 
                                    step="0.05"
                                    value={settings.spritzGhostOpacity ?? 0.5} 
                                    onChange={(e) => onSettingsChange({ ...settings, spritzGhostOpacity: Number(e.target.value) })}
                                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                             </div>
                        </div>
                    )}
                  </div>
                  )}
                </div>
              )}

              {configTab === 'scroll' && (
                 <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-6">
                    {/* Auto Scroll Mode Selector */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3 block">Auto-Scroll Mode</label>
                        <div className="flex flex-wrap gap-2">
                             {[
                                 { id: 'continuous', label: 'Fluid', icon: Activity },
                                 { id: 'line', label: 'Line', icon: AlignJustify },
                                 { id: 'sentence', label: 'Sentence', icon: BookOpen },
                                 { id: 'paragraph', label: 'Para', icon: AlignLeft },
                                 { id: 'page', label: 'Page', icon: Book }
                             ].map(m => (
                                 <button
                                    key={m.id}
                                    onClick={() => onSettingsChange({ ...settings, autoScrollMode: m.id as any })}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${settings.autoScrollMode === m.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                 >
                                     <m.icon className="w-3 h-3" /> {m.label}
                                 </button>
                             ))}
                        </div>

                        {/* Specific Controls based on Mode */}
                        <div className="mt-4 pt-4 border-t border-slate-200 animate-in slide-in-from-top-2">
                            {settings.autoScrollMode === 'continuous' && (
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-xs font-medium text-slate-700">Scroll Speed (Pixels)</label>
                                        <span className="text-xs font-mono bg-slate-200 px-1.5 rounded">{settings.continuousScrollSpeed?.toFixed(1) ?? 1.0}</span>
                                    </div>
                                    <input 
                                        type="range" min="0.2" max="5.0" step="0.1"
                                        value={settings.continuousScrollSpeed ?? 1.0}
                                        onChange={(e) => onSettingsChange({ ...settings, continuousScrollSpeed: Number(e.target.value) })}
                                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                </div>
                            )}

                            {settings.autoScrollMode === 'line' && (
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-xs font-medium text-slate-700">Trigger Margin (Words into line)</label>
                                        <span className="text-xs font-mono bg-slate-200 px-1.5 rounded">{settings.autoScrollTriggerMargin ?? 2}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="10" step="1"
                                        value={settings.autoScrollTriggerMargin ?? 2}
                                        onChange={(e) => onSettingsChange({ ...settings, autoScrollTriggerMargin: Number(e.target.value) })}
                                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-2">Scrolls when the reader reaches the {settings.autoScrollTriggerMargin}-th word on the next line.</p>
                                </div>
                            )}
                             {(settings.autoScrollMode !== 'continuous') && (
                                <div className="mt-4">
                                     <div className="flex justify-between mb-2">
                                        <label className="text-xs font-medium text-slate-700">Scroll Animation Duration (ms)</label>
                                        <span className="text-xs font-mono bg-slate-200 px-1.5 rounded">{settings.autoScrollDuration ?? 250}</span>
                                    </div>
                                    <input 
                                        type="range" min="50" max="1000" step="50"
                                        value={settings.autoScrollDuration ?? 250}
                                        onChange={(e) => onSettingsChange({ ...settings, autoScrollDuration: Number(e.target.value) })}
                                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                </div>
                             )}
                        </div>
                    </div>

                    {/* Typography */}
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3 block">Typography</label>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1.5">Font Family</label>
                                <select 
                                    value={settings.normalFontFamily}
                                    onChange={(e) => onSettingsChange({...settings, normalFontFamily: e.target.value})}
                                    className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="Inter">Inter (Sans)</option>
                                    <option value="Lora">Lora (Serif)</option>
                                    <option value='"Source Code Pro"'>Source Code Pro (Mono)</option>
                                    <option value='"Fira Code"'>Fira Code (Mono)</option>
                                </select>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Font Size</label>
                                    <input 
                                        type="number" 
                                        value={settings.normalFontSize}
                                        onChange={(e) => onSettingsChange({...settings, normalFontSize: Number(e.target.value)})}
                                        className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Line Height</label>
                                    <input 
                                        type="number" step="0.1"
                                        value={settings.lineHeight}
                                        onChange={(e) => onSettingsChange({...settings, lineHeight: Number(e.target.value)})}
                                        className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                                    />
                                </div>
                            </div>

                             <div>
                                <div className="flex justify-between mb-1">
                                    <label className="text-xs font-medium text-slate-700">Max Width (px)</label>
                                    <span className="text-xs font-mono">{settings.normalMaxWidth}px</span>
                                </div>
                                <input 
                                    type="range" min="400" max="1200" step="50"
                                    value={settings.normalMaxWidth}
                                    onChange={(e) => onSettingsChange({...settings, normalMaxWidth: Number(e.target.value) })}
                                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                            </div>
                            
                            <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                                <button
                                    onClick={() => onSettingsChange({...settings, textAlignment: 'left'})}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.textAlignment === 'left' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <AlignLeft className="w-3 h-3" /> Left
                                </button>
                                <button
                                    onClick={() => onSettingsChange({...settings, textAlignment: 'justify'})}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.textAlignment === 'justify' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <AlignJustify className="w-3 h-3" /> Justify
                                </button>
                            </div>
                        </div>
                    </div>
                 </div>
              )}
              
              {configTab === 'paginated' && (
                  <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-6">
                       <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                           <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3 block">Layout</label>
                            <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                                <button
                                    onClick={() => onSettingsChange({...settings, paginatedColumns: 1})}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.paginatedColumns === 1 ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <Square className="w-3 h-3" /> Single Column
                                </button>
                                <button
                                    onClick={() => onSettingsChange({...settings, paginatedColumns: 2})}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.paginatedColumns === 2 ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <Columns className="w-3 h-3" /> Two Columns
                                </button>
                            </div>
                       </div>
                       
                        {/* Typography (Shared but needs separate block for conditional rendering) */}
                         <div>
                            <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3 block">Typography</label>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Font Family</label>
                                    <select 
                                        value={settings.normalFontFamily}
                                        onChange={(e) => onSettingsChange({...settings, normalFontFamily: e.target.value})}
                                        className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="Inter">Inter (Sans)</option>
                                        <option value="Lora">Lora (Serif)</option>
                                        <option value='"Source Code Pro"'>Source Code Pro (Mono)</option>
                                        <option value='"Fira Code"'>Fira Code (Mono)</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Font Size</label>
                                        <input 
                                            type="number" 
                                            value={settings.normalFontSize}
                                            onChange={(e) => onSettingsChange({...settings, normalFontSize: Number(e.target.value)})}
                                            className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Line Height</label>
                                        <input 
                                            type="number" step="0.1"
                                            value={settings.lineHeight}
                                            onChange={(e) => onSettingsChange({...settings, lineHeight: Number(e.target.value)})}
                                            className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                                        />
                                    </div>
                                </div>
                                <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                                    <button
                                        onClick={() => onSettingsChange({...settings, textAlignment: 'left'})}
                                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.textAlignment === 'left' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <AlignLeft className="w-3 h-3" /> Left
                                    </button>
                                    <button
                                        onClick={() => onSettingsChange({...settings, textAlignment: 'justify'})}
                                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.textAlignment === 'justify' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <AlignJustify className="w-3 h-3" /> Justify
                                    </button>
                                </div>
                            </div>
                        </div>
                  </div>
              )}
            </div>
          </section>

          <SectionHeader title="Keyboard & Shortcuts" icon={Keyboard} />

          <section className="mb-10">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-5">
                  {/* Seek Granularity */}
                  <div>
                      <div className="flex items-center gap-2 mb-3">
                          <span className="font-bold text-sm text-slate-700">Seek Behavior (Arrow Left/Right)</span>
                      </div>
                      <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                          <button
                              onClick={() => onSettingsChange({...settings, keySeekGranularity: 'line'})}
                              className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.keySeekGranularity === 'line' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                              <AlignJustify className="w-3 h-3" /> Line
                          </button>
                          <button
                              onClick={() => onSettingsChange({...settings, keySeekGranularity: 'sentence'})}
                              className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.keySeekGranularity === 'sentence' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                              <BookOpen className="w-3 h-3" /> Sentence
                          </button>
                          <button
                              onClick={() => onSettingsChange({...settings, keySeekGranularity: 'paragraph'})}
                              className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${(settings.keySeekGranularity || 'paragraph') === 'paragraph' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                              <AlignLeft className="w-3 h-3" /> Paragraph
                          </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">
                        Controls how far the cursor moves when pressing Left or Right arrow keys during playback.
                      </p>
                  </div>

                  {/* Speed Step */}
                  <div>
                      <div className="flex justify-between items-center mb-2">
                          <label className="font-bold text-sm text-slate-700">Speed Change Step</label>
                          <span className="text-xs font-mono bg-slate-200 px-1.5 rounded">+/- {settings.keySpeedStep || 0.1}x</span>
                      </div>
                      <input 
                          type="range" 
                          min="0.05" 
                          max="0.5" 
                          step="0.05"
                          value={settings.keySpeedStep || 0.1} 
                          onChange={(e) => onSettingsChange({ ...settings, keySpeedStep: Number(e.target.value) })}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                  </div>
                  
                  {/* Default Speed */}
                  <div>
                      <div className="flex justify-between items-center mb-2">
                          <label className="font-bold text-sm text-slate-700">Default Speed (Reset Target)</label>
                          <span className="text-xs font-mono bg-slate-200 px-1.5 rounded">{settings.keyDefaultSpeed || 1.3}x</span>
                      </div>
                      <input 
                          type="range" 
                          min="0.5" 
                          max="3.0" 
                          step="0.1"
                          value={settings.keyDefaultSpeed || 1.3} 
                          onChange={(e) => onSettingsChange({ ...settings, keyDefaultSpeed: Number(e.target.value) })}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                  </div>

                   {/* Key Bindings */}
                   <div className="pt-4 border-t border-slate-100">
                       <h4 className="font-bold text-sm text-slate-700 mb-3">Key Bindings</h4>
                       <div className="space-y-2">
                           {[
                               { id: 'next', label: 'Navigate Forward' },
                               { id: 'prev', label: 'Navigate Backward' },
                               { id: 'speedUp', label: 'Increase Speed' },
                               { id: 'speedDown', label: 'Decrease Speed' },
                               { id: 'resetSpeed', label: 'Reset Speed' },
                               { id: 'playPause', label: 'Play / Pause' }
                           ].map(item => {
                               const keyId = item.id as keyof KeyBindings;
                               const currentKey = settings.keyBindings?.[keyId] || '';
                               const isListening = listeningForKey === keyId;
                               
                               return (
                                   <div key={keyId} className="flex items-center justify-between">
                                       <span className="text-xs text-slate-600 font-medium">{item.label}</span>
                                       <button 
                                            onClick={() => setListeningForKey(keyId)}
                                            className={`
                                                min-w-[80px] px-3 py-1.5 rounded text-xs font-mono font-bold border transition-all text-center
                                                ${isListening 
                                                    ? 'bg-red-50 text-red-600 border-red-200 ring-2 ring-red-100 animate-pulse' 
                                                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'}
                                            `}
                                       >
                                           {isListening ? 'Press Key...' : (currentKey === ' ' ? 'Space' : currentKey)}
                                       </button>
                                   </div>
                               );
                           })}
                       </div>
                       <p className="text-[10px] text-slate-400 mt-3 italic">
                           Click a button and press any key to rebind.
                       </p>
                   </div>
              </div>
          </section>

          <SectionHeader title="Voice & TTS" icon={Volume2} />

          <section className="mb-10">
            <div className="mb-6">
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input 
                  type="checkbox" 
                  checked={getVoiceEnabledState()}
                  onChange={(e) => toggleVoiceEnabled(e.target.checked)}
                  className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <span className="font-medium text-slate-700">Enable Synchronized TTS ({getModeDisplayName(configTab)})</span>
              </label>
            </div>

            {getVoiceEnabledState() && (
              <div className="space-y-6 animate-in slide-in-from-top-4">
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-2">Speech Rate</label>
                   <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="0.5" 
                      max="4" 
                      step="0.1"
                      value={voiceSettings.rate} 
                      onChange={(e) => onVoiceSettingsChange({ ...voiceSettings, rate: Number(e.target.value) })}
                      className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="w-12 text-right font-mono text-slate-600">{voiceSettings.rate}x</span>
                  </div>
                  {voiceSettings.rate > 2 && (
                      <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded border border-amber-200">
                          <strong>Note:</strong> Speeds above 2x automatically reduce pauses.
                      </p>
                  )}
                </div>
                
                {/* Highlight Settings */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                         <BoxSelect className="w-4 h-4 text-indigo-600" />
                         <span className="font-bold text-sm text-slate-700">Highlight Scope</span>
                    </div>
                    
                    <div className="flex bg-white rounded-lg border border-slate-200 p-1 mb-4">
                        <button
                            onClick={() => onSettingsChange({...settings, highlightScope: 'word'})}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.highlightScope === 'word' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Word
                        </button>
                        <button
                            onClick={() => onSettingsChange({...settings, highlightScope: 'sentence'})}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded ${settings.highlightScope === 'sentence' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Sentence
                        </button>
                    </div>

                    {settings.highlightScope === 'word' && (
                         <div className="animate-in slide-in-from-top-2">
                             <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Words to Highlight</label>
                                <span className="text-xs font-mono bg-slate-200 px-1.5 rounded">{settings.highlightWindowSize || 1}</span>
                             </div>
                             <input 
                                type="range" 
                                min="1" 
                                max="5" 
                                step="1"
                                value={settings.highlightWindowSize || 1} 
                                onChange={(e) => onSettingsChange({ ...settings, highlightWindowSize: Number(e.target.value) })}
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                         </div>
                    )}
                </div>
                
                {/* Repeat Mode */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                            <Repeat className="w-4 h-4 text-indigo-600" />
                            <span className="font-bold text-sm text-slate-700">Repeat Mode</span>
                    </div>
                    <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                        {(['off', 'word', 'phrase', 'sentence'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => onVoiceSettingsChange({...voiceSettings, repeatMode: mode})}
                                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded capitalize ${voiceSettings.repeatMode === mode ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Audio Text Delay Slider */}
                <div>
                   <div className="flex justify-between items-center mb-2">
                       <label className="text-sm font-medium text-slate-700">Text Lead Time (Audio Delay)</label>
                       <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{settings.audioTextDelay ?? 0}ms</span>
                   </div>
                   <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="0" 
                      max="3000" 
                      step="50"
                      value={settings.audioTextDelay ?? 0} 
                      onChange={(e) => onSettingsChange({ ...settings, audioTextDelay: Number(e.target.value) })}
                      className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                   <p className="text-[10px] text-slate-500 mt-1">
                       Activate word highlight <strong>before</strong> audio catches up.
                   </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Select Voice</label>
                  <input 
                    type="text" 
                    placeholder="Search voices..." 
                    value={voiceSearch}
                    onChange={(e) => setVoiceSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="h-60 overflow-y-auto border border-slate-200 rounded-lg">
                    {filteredVoices.map(voice => (
                      <div 
                        key={voice.voiceURI}
                        onClick={() => onVoiceSettingsChange({ ...voiceSettings, voiceURI: voice.voiceURI })}
                        className={`
                          p-3 flex items-center justify-between cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50
                          ${voiceSettings.voiceURI === voice.voiceURI ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}
                        `}
                      >
                        <div className="flex-1 min-w-0 pr-2">
                           <div className="font-medium text-sm truncate">{voice.name}</div>
                           <div className="text-xs opacity-60 truncate">{voice.lang}</div>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(voice.voiceURI); }}
                          className={`p-1.5 rounded-full hover:bg-black/5 ${voiceSettings.favorites.includes(voice.voiceURI) ? 'text-yellow-400' : 'text-slate-300'}`}
                        >
                          <Star className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <SectionHeader title="Data Management" icon={Database} />

          <section className="mb-6">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                  <p className="text-xs text-slate-500 leading-relaxed mb-2">
                      Backup all your data (Settings, Library, Books, Folders, and Glossary) to a single file. Restore to recover your state.
                  </p>
                  
                  <button 
                    onClick={handleBackup}
                    disabled={isBackupLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
                  >
                      {isBackupLoading ? <span className="animate-spin">...</span> : <Download className="w-4 h-4" />}
                      Download Backup
                  </button>
                  
                  <label className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer font-medium text-sm shadow-sm relative">
                       {isBackupLoading ? <span className="animate-spin">...</span> : <Upload className="w-4 h-4" />}
                       Restore from File
                       <input 
                         type="file" 
                         accept=".json" 
                         onChange={handleRestore}
                         disabled={isBackupLoading}
                         className="absolute inset-0 opacity-0 cursor-pointer" 
                       />
                  </label>
              </div>
          </section>

        </div>
      </div>
    </div>
  );
}