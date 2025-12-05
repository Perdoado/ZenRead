




import React, { useState, useEffect } from 'react';
import { X, Book, Loader2, Volume2, Highlighter, Save, Edit2, Bold, Italic, Underline, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { DictionaryResult } from '../services/geminiService';
import { GlossaryItem } from '../types';

interface DictionaryCardProps {
  word: string;
  data: DictionaryResult | null;
  isLoading: boolean;
  initialEditMode?: boolean;
  showDefinition?: boolean;
  onClose: () => void;
  theme: any; 
  glossaryItem?: GlossaryItem;
  onToggleHighlight?: (definition: string, style?: Partial<GlossaryItem>) => void;
  onUpdateDefinition?: (newDefinition: string, style?: Partial<GlossaryItem>, newTranslation?: string) => void;
  onRegenerate?: (lang: 'en' | 'pt') => void;
  onToggleShowDefinition?: (show: boolean) => void;
}

const COLORS = [
  { id: 'yellow', bg: 'bg-yellow-400' },
  { id: 'green', bg: 'bg-green-400' },
  { id: 'blue', bg: 'bg-blue-400' },
  { id: 'pink', bg: 'bg-pink-400' },
  { id: 'purple', bg: 'bg-purple-400' },
] as const;

export const DictionaryCard: React.FC<DictionaryCardProps> = ({ 
  word, data, isLoading, initialEditMode, showDefinition = true, onClose, theme, glossaryItem, onToggleHighlight, onUpdateDefinition, onRegenerate, onToggleShowDefinition
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editTranslation, setEditTranslation] = useState('');
  
  // Style States
  const [highlightColor, setHighlightColor] = useState<string>('yellow');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);

  // Initialize Edit Mode
  useEffect(() => {
      if (initialEditMode) setIsEditing(true);
  }, [initialEditMode]);

  // Reset state when data changes
  useEffect(() => {
    if (glossaryItem) {
        setEditValue(glossaryItem.definition);
        setEditTranslation(glossaryItem.translation || '');
        setHighlightColor(glossaryItem.highlightColor || 'yellow');
        setIsBold(!!glossaryItem.highlightBold);
        setIsItalic(!!glossaryItem.highlightItalic);
        setIsUnderline(!!glossaryItem.highlightUnderline);
    } else if (data) {
        setEditValue(data.definition);
        setEditTranslation(data.translation || '');
        // Default new
        setHighlightColor('yellow');
        setIsBold(false);
        setIsItalic(false);
        setIsUnderline(false);
    }
  }, [data, glossaryItem]);
  
  const displayWord = word.replace(/[^\w\s'-]/g, '');

  const playPronunciation = () => {
      if (!displayWord) return;
      const u = new SpeechSynthesisUtterance(displayWord);
      window.speechSynthesis.speak(u);
  };

  const getStyleUpdates = () => ({
      highlightColor: highlightColor as any,
      highlightBold: isBold,
      highlightItalic: isItalic,
      highlightUnderline: isUnderline
  });

  const handleSaveEdit = () => {
      if (onUpdateDefinition) onUpdateDefinition(editValue, getStyleUpdates(), editTranslation);
      setIsEditing(false);
  };

  const handleToggleHighlight = () => {
      // Pass current styles when toggling on
      if (onToggleHighlight) {
          onToggleHighlight(editValue || data?.definition || '', getStyleUpdates());
          onClose(); // Close the card on highlight as requested
      }
  };

  const isHighlighted = !!glossaryItem;

  // Determine data to show: prefer glossary item (edited) over API data
  const currentDefinition = glossaryItem?.definition || data?.definition;
  const currentTranslation = glossaryItem?.translation || data?.translation;
  const currentPhonetic = glossaryItem?.phonetic || data?.phonetic;
  const currentPartOfSpeech = glossaryItem?.partOfSpeech || data?.partOfSpeech;
  const currentExample = glossaryItem?.example || data?.example;

  return (
    <div className={`
        fixed bottom-24 left-1/2 transform -translate-x-1/2 
        w-[90%] max-w-md p-6 rounded-2xl shadow-2xl z-[80]
        ${theme.uiBg} ${theme.uiBorder} border
        animate-in slide-in-from-bottom-4 fade-in duration-300
    `}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`p-2 rounded-full ${theme.highlight} bg-opacity-10 shrink-0`}>
                <Book className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
                {isEditing ? (
                    <div className="flex items-center gap-2">
                         <span className={`text-xl font-bold font-serif ${theme.text}`}>{displayWord}</span>
                         <span className="text-xl font-bold font-serif opacity-50">-</span>
                         <input 
                            type="text"
                            className={`
                                flex-1 p-1 text-base font-bold rounded border focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0
                                ${theme.text === 'text-gray-300' 
                                    ? 'bg-zinc-800 border-zinc-700 text-white placeholder-gray-500' 
                                    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'}
                            `}
                            placeholder="Translation"
                            value={editTranslation}
                            onChange={(e) => setEditTranslation(e.target.value)}
                        />
                    </div>
                ) : (
                    <h3 className={`text-xl font-bold font-serif ${theme.text} leading-tight`}>
                        {displayWord} 
                        {currentTranslation && (
                            <span className={`font-sans text-base font-bold ml-2 ${theme.theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
                                - {currentTranslation}
                            </span>
                        )}
                    </h3>
                )}
                {currentPhonetic && !isEditing && (
                    <span className="text-sm opacity-60 font-mono block">{currentPhonetic}</span>
                )}
            </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
            {!isLoading && (data || glossaryItem) && (
                <>
                {onToggleShowDefinition && !isEditing && (
                    <button
                        onClick={() => onToggleShowDefinition(!showDefinition)}
                        className={`p-2 rounded-full hover:bg-black/5 transition-colors ${theme.icon}`}
                        title={showDefinition ? "Hide definition" : "Show definition"}
                    >
                        {showDefinition ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                    </button>
                )}
                <button 
                    onClick={handleToggleHighlight}
                    className={`p-2 rounded-full transition-colors ${isHighlighted ? 'bg-yellow-400 text-yellow-900 shadow-lg shadow-yellow-400/20' : 'hover:bg-black/5 opacity-50 hover:opacity-100 ' + theme.icon}`}
                    title={isHighlighted ? "Remove Highlight" : "Highlight this word"}
                >
                    <Highlighter className="w-5 h-5" />
                </button>
                </>
            )}
            <button 
                onClick={onClose}
                className={`p-1 rounded-full hover:bg-black/5 transition-colors ${theme.icon}`}
            >
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-8 opacity-60 gap-3">
             <Loader2 className={`w-8 h-8 animate-spin ${theme.icon}`} />
             <p className="text-sm">Looking up definition...</p>
        </div>
      ) : (data || glossaryItem) ? (
         <div className="space-y-3">
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-50 border border-current px-1.5 rounded">
                    {currentPartOfSpeech}
                </span>
                <button onClick={playPronunciation} className="opacity-50 hover:opacity-100 transition-opacity">
                    <Volume2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsEditing(!isEditing)} className="ml-auto opacity-70 hover:opacity-100 text-xs flex items-center gap-1 bg-black/5 px-2 py-1 rounded hover:bg-black/10 transition-colors">
                    <Edit2 className="w-3 h-3" /> {isEditing ? 'Cancel Edit' : 'Edit / Style'}
                </button>
            </div>
            
            {isEditing ? (
                <div className="space-y-4 pt-2 animate-in fade-in zoom-in-95 duration-200">
                    <div>
                        <label className="text-xs font-bold uppercase opacity-50 mb-1 block">Definition</label>
                        <textarea 
                            className={`
                                w-full p-2 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-indigo-500
                                ${theme.text === 'text-gray-300' 
                                    ? 'bg-zinc-800 border-zinc-700 text-white placeholder-gray-500' 
                                    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'}
                            `}
                            rows={4}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                        />
                        {/* Regenerate Buttons */}
                        <div className="flex gap-2 mt-2">
                            <button 
                                onClick={() => onRegenerate && onRegenerate('en')}
                                className="text-xs px-2 py-1 rounded bg-black/5 hover:bg-black/10 flex items-center gap-1 transition-colors opacity-70 hover:opacity-100"
                            >
                                <RefreshCw className="w-3 h-3" /> Regenerate EN
                            </button>
                            <button 
                                onClick={() => onRegenerate && onRegenerate('pt')}
                                className="text-xs px-2 py-1 rounded bg-black/5 hover:bg-black/10 flex items-center gap-1 transition-colors opacity-70 hover:opacity-100"
                            >
                                <RefreshCw className="w-3 h-3" /> Regenerate PT
                            </button>
                        </div>
                    </div>
                    
                    {/* Styling Controls */}
                    <div className="space-y-3 p-3 bg-black/5 rounded-lg">
                        <div className="text-xs font-bold uppercase opacity-50">Highlight Style</div>
                        
                        {/* Colors */}
                        <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                                {COLORS.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => setHighlightColor(c.id)}
                                        className={`w-6 h-6 rounded-full ${c.bg} border-2 transition-all ${highlightColor === c.id ? 'border-indigo-600 scale-110 shadow' : 'border-transparent hover:scale-105'}`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Toggles */}
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setIsBold(!isBold)}
                                className={`flex-1 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 transition-colors ${isBold ? 'bg-indigo-600 text-white' : 'bg-white border text-slate-600'}`}
                            >
                                <Bold className="w-3 h-3" /> Bold
                            </button>
                            <button 
                                onClick={() => setIsItalic(!isItalic)}
                                className={`flex-1 py-1.5 rounded text-xs italic flex items-center justify-center gap-1 transition-colors ${isItalic ? 'bg-indigo-600 text-white' : 'bg-white border text-slate-600'}`}
                            >
                                <Italic className="w-3 h-3" /> Italic
                            </button>
                            <button 
                                onClick={() => setIsUnderline(!isUnderline)}
                                className={`flex-1 py-1.5 rounded text-xs underline flex items-center justify-center gap-1 transition-colors ${isUnderline ? 'bg-indigo-600 text-white' : 'bg-white border text-slate-600'}`}
                            >
                                <Underline className="w-3 h-3" /> Underline
                            </button>
                        </div>
                    </div>

                    <button 
                        onClick={handleSaveEdit}
                        className="w-full py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        <Save className="w-4 h-4" /> Save Changes
                    </button>
                </div>
            ) : (
                <>
                {showDefinition && (
                    <div className={`text-lg leading-relaxed ${theme.text}`}>
                        {currentDefinition}
                        
                        {/* Style Preview Badge */}
                        {glossaryItem && (
                            <div className="mt-4 flex items-center gap-2">
                                <span className="text-[10px] uppercase font-bold opacity-50">Current Style:</span>
                                <div className={`px-2 py-0.5 rounded text-xs border border-current opacity-70 flex items-center gap-1`}>
                                    <div className={`w-2 h-2 rounded-full bg-${glossaryItem.highlightColor || 'yellow'}-400`}></div>
                                    {glossaryItem.highlightBold && <Bold className="w-3 h-3" />}
                                    {glossaryItem.highlightItalic && <Italic className="w-3 h-3" />}
                                    {glossaryItem.highlightUnderline && <Underline className="w-3 h-3" />}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                </>
            )}
            
            {currentExample && !isEditing && showDefinition && (
                <div className={`mt-3 pl-3 border-l-2 border-indigo-500/30 text-sm italic opacity-80`}>
                    "{currentExample}"
                </div>
            )}
         </div>
      ) : (
          <div className="text-center py-4 opacity-60">
              Could not find definition.
          </div>
      )}
    </div>
  );
};