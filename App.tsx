
import React, { useEffect, useState, useRef } from 'react';
import { Settings } from 'lucide-react';
import { Library } from './components/Library';
import { Reader } from './components/Reader';
import { SettingsPanel } from './components/SettingsPanel';
import { Book, AppSettings, VoiceSettings, ReadingMode, GlossaryItem } from './types';
import { DEFAULT_SETTINGS, DEFAULT_VOICE_SETTINGS, THEMES } from './constants';
import { getBooks, getSettings, saveSettings, saveProgress, saveBook, getGlossary, saveGlossaryItem, deleteGlossaryItem } from './services/storage';

const App: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>('spritz');
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  
  // Navigation State
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Universal Glossary State
  const [glossary, setGlossary] = useState<Record<string, GlossaryItem>>({});

  // Refs for debouncing save operations
  const saveSettingsTimeoutRef = useRef<number | null>(null);
  const saveVoiceSettingsTimeoutRef = useRef<number | null>(null);

  // Initialize
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const loadedBooks = await getBooks();
    // Sort by most recently accessed/uploaded
    setBooks(loadedBooks.sort((a, b) => b.createdAt - a.createdAt));
    
    const saved = await getSettings();
    
    // Migration Logic for old settings structure to new structure
    let newAppSettings = { ...DEFAULT_SETTINGS };
    
    if (saved.app) {
      const savedApp = saved.app as any;
      
      newAppSettings = {
        ...DEFAULT_SETTINGS,
        ...savedApp, // Spread all saved properties to ensure new fields (textAlignment, etc.) are preserved
        
        // Specific migration for renamed fields (legacy wpm -> spritzWpm)
        // We prioritize existing 'spritzWpm', then fallback to legacy 'wpm', then default
        spritzWpm: savedApp.spritzWpm ?? savedApp.wpm ?? DEFAULT_SETTINGS.spritzWpm,
        spritzFontSize: savedApp.spritzFontSize ?? savedApp.fontSize ?? DEFAULT_SETTINGS.spritzFontSize,
      };
    }

    setAppSettings(newAppSettings);
    
    if (saved.voice) {
        const v = saved.voice as any;
        // Migration: 'enabled' -> 'normalEnabled', default spritz to DEFAULT if undefined
        setVoiceSettings({
            ...DEFAULT_VOICE_SETTINGS,
            ...v,
            normalEnabled: v.normalEnabled ?? v.enabled ?? DEFAULT_VOICE_SETTINGS.normalEnabled,
            spritzEnabled: v.spritzEnabled ?? DEFAULT_VOICE_SETTINGS.spritzEnabled
        });
    } else {
        setVoiceSettings(DEFAULT_VOICE_SETTINGS);
    }

    // Load Global Glossary
    const loadedGlossary = await getGlossary();
    let mergedGlossary = { ...loadedGlossary };
    
    // Merge legacy book glossaries into global glossary
    let glossaryChanged = false;
    loadedBooks.forEach(book => {
        if (book.glossary) {
            Object.values(book.glossary).forEach(item => {
                // If it's not already in the global glossary, add it
                if (!mergedGlossary[item.word]) {
                    mergedGlossary[item.word] = item;
                    saveGlossaryItem(item); // Persist to global store
                    glossaryChanged = true;
                }
            });
        }
    });

    setGlossary(mergedGlossary);
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setAppSettings(newSettings);
    // Debounce Save
    if (saveSettingsTimeoutRef.current) window.clearTimeout(saveSettingsTimeoutRef.current);
    saveSettingsTimeoutRef.current = window.setTimeout(() => {
        saveSettings('app', newSettings);
    }, 1000);
  };

  const handleUpdateVoiceSettings = (newSettings: VoiceSettings) => {
    setVoiceSettings(newSettings);
    // Debounce Save
    if (saveVoiceSettingsTimeoutRef.current) window.clearTimeout(saveVoiceSettingsTimeoutRef.current);
    saveVoiceSettingsTimeoutRef.current = window.setTimeout(() => {
        saveSettings('voice', newSettings);
    }, 1000);
  };

  const handleBookSelect = (book: Book, mode: ReadingMode) => {
    setActiveBook(book);
    setReadingMode(mode);
  };

  const handleBookUpdate = async (updatedBook: Book) => {
    // 1. Save to DB
    await saveBook(updatedBook);
    
    // 2. Update local state
    setBooks(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
    if (activeBook && activeBook.id === updatedBook.id) {
        setActiveBook(updatedBook);
    }
  };

  const handleProgressUpdate = async (position: number) => {
    if (activeBook) {
        await saveProgress(activeBook.id, position);
        // Update local state to reflect change without full reload
        setBooks(prev => prev.map(b => b.id === activeBook.id ? { ...b, lastPosition: position, lastRead: Date.now() } : b));
    }
  };

  const handleGlossaryUpdate = async (item: GlossaryItem | string, action: 'add' | 'remove') => {
      if (action === 'add' && typeof item === 'object') {
          // Update State
          setGlossary(prev => ({ ...prev, [item.word]: item }));
          // Persist
          await saveGlossaryItem(item);
      } else if (action === 'remove' && typeof item === 'string') {
          // Update State
          setGlossary(prev => {
              const next = { ...prev };
              delete next[item];
              return next;
          });
          // Persist
          await deleteGlossaryItem(item);
      }
  };

  const handleCloseReader = () => {
      setActiveBook(null);
      loadData(); // Refresh list to update progress bars
  };

  const theme = THEMES[appSettings.theme] || THEMES.dark;

  return (
    <div 
      className="h-full flex flex-col relative font-sans transition-all duration-300 ease-in-out" 
      style={{ fontSize: `${appSettings.uiScale}rem` }}
    >
      {/* Top Bar (only visible in Library view) */}
      {!activeBook && (
        <header className={`border-b ${theme.uiBorder} ${theme.uiBg} px-4 py-2 flex items-center justify-between sticky top-0 z-10`}>
          <div className="flex items-center gap-2">
              <span className="bg-indigo-600 text-white font-bold p-0.5 px-2 rounded text-base">Z</span>
              <span className={`text-lg font-bold tracking-tight ${theme.text}`}>ZenRead</span>
          </div>
          <button 
            onClick={() => setSettingsOpen(true)}
            className={`p-1.5 rounded-full hover:bg-black/5 transition-colors ${theme.icon}`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </header>
      )}

      {/* Main Content */}
      <main className={`flex-1 overflow-auto ${theme.bg}`}>
        {activeBook ? (
          <Reader 
            book={activeBook}
            mode={readingMode}
            settings={appSettings}
            voiceSettings={voiceSettings}
            glossary={glossary}
            onClose={handleCloseReader}
            onUpdateProgress={handleProgressUpdate}
            onOpenSettings={() => setSettingsOpen(true)}
            onUpdateBook={handleBookUpdate}
            onUpdateGlossary={handleGlossaryUpdate}
            onUpdateVoiceSettings={handleUpdateVoiceSettings}
            onSettingsChange={handleUpdateSettings}
          />
        ) : (
          <Library 
            books={books} 
            onBookSelect={handleBookSelect}
            onRefresh={loadData}
            currentFolderId={currentFolderId}
            setCurrentFolderId={setCurrentFolderId}
            settings={appSettings}
            onSettingsChange={handleUpdateSettings}
          />
        )}
      </main>

      {/* Settings Modal */}
      <SettingsPanel 
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={appSettings}
        onSettingsChange={handleUpdateSettings}
        voiceSettings={voiceSettings}
        onVoiceSettingsChange={handleUpdateVoiceSettings}
        activeMode={activeBook ? readingMode : undefined} // Pass active mode
      />
    </div>
  );
};

export default App;
