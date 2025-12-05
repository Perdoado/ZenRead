import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { 
  Play, Pause, ArrowLeft, Settings, RotateCcw, RotateCw, ChevronDown, Highlighter, Edit3, X, Type, Check, Mic, Star, Search, ArrowUp, ArrowDown, Target, Sidebar, ChevronLeft, ChevronRight, BookOpen, Lock, Unlock, Zap, Gauge, TrendingUp, TrendingDown, Timer, Eye, List
} from 'lucide-react';
import { Book, AppSettings, VoiceSettings, SpritzWord, ReadingMode, GlossaryItem, Chapter } from '../types';
import { THEMES } from '../constants';
import { DictionaryCard } from './DictionaryCard';
import { getDefinition, DictionaryResult } from '../services/geminiService';
import { saveSettings } from '../services/storage';

interface ReaderProps {
  book: Book;
  mode: ReadingMode;
  settings: AppSettings;
  voiceSettings: VoiceSettings;
  glossary: Record<string, GlossaryItem>;
  onClose: () => void;
  onUpdateProgress: (position: number) => void;
  onOpenSettings: () => void;
  onUpdateBook: (book: Book) => void;
  onUpdateGlossary: (item: GlossaryItem | string, action: 'add' | 'remove') => void;
  onUpdateVoiceSettings: (settings: VoiceSettings) => void;
  onSettingsChange: (settings: AppSettings) => void;
}

// ... Helper for Highlight Styles ...
const getHighlightClass = (
    item: GlossaryItem | undefined, 
    themeName: 'light' | 'dark' | 'sepia', 
    settings?: AppSettings,
    isSidebar: boolean = false
) => {
  if (isSidebar && settings && !settings.sidebarMatchTextStyle) {
      if (settings.sidebarCustomColor && settings.sidebarCustomColor !== 'none') {
           const color = settings.sidebarCustomColor;
           const colors: Record<string, string> = {
                yellow: themeName === 'dark' ? 'bg-yellow-900/40 text-yellow-200 border-yellow-700/50' : 'bg-yellow-200 text-slate-900 border-yellow-300',
                green: themeName === 'dark' ? 'bg-green-900/40 text-green-200 border-green-700/50' : 'bg-green-200 text-slate-900 border-green-300',
                blue: themeName === 'dark' ? 'bg-blue-900/40 text-blue-200 border-blue-700/50' : 'bg-blue-200 text-slate-900 border-blue-300',
                pink: themeName === 'dark' ? 'bg-pink-900/40 text-pink-200 border-pink-700/50' : 'bg-pink-200 text-slate-900 border-pink-300',
                purple: themeName === 'dark' ? 'bg-purple-900/40 text-purple-200 border-purple-700/50' : 'bg-purple-200 text-slate-900 border-purple-300',
            };
            return colors[color] + ' border-l-4';
      }
      return 'border-l-4 border-slate-500 bg-transparent';
  }

  const color = item?.highlightColor || 'yellow';
  
  const colors: Record<string, string> = {
    yellow: themeName === 'dark' ? 'bg-yellow-900/40 text-yellow-200 border-yellow-700/50' : 'bg-yellow-200 text-slate-900 border-yellow-300',
    green: themeName === 'dark' ? 'bg-green-900/40 text-green-200 border-green-700/50' : 'bg-green-200 text-slate-900 border-green-300',
    blue: themeName === 'dark' ? 'bg-blue-900/40 text-blue-200 border-blue-700/50' : 'bg-blue-200 text-slate-900 border-blue-300',
    pink: themeName === 'dark' ? 'bg-pink-900/40 text-pink-200 border-pink-700/50' : 'bg-pink-200 text-slate-900 border-pink-300',
    purple: themeName === 'dark' ? 'bg-purple-900/40 text-purple-200 border-purple-700/50' : 'bg-purple-200 text-slate-900 border-purple-300',
  };

  let cls = colors[color] || colors['yellow'];
  
  if (isSidebar) {
      cls += ' border-l-4 border-b-0'; 
  } else {
      cls += ' border-b-2';
  }
  
  if (item?.highlightBold) cls += ' font-bold';
  if (item?.highlightItalic) cls += ' italic';
  if (item?.highlightUnderline) cls += ' underline decoration-2 underline-offset-2';
  
  return cls;
};

const formatTimeSeconds = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || !isFinite(totalSeconds)) return '0:00:00';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getSentenceRange = (words: string[], currentIndex: number) => {
    let start = currentIndex;
    let end = currentIndex;

    while (start > 0) {
        const prevWord = words[start - 1];
        if (prevWord === undefined || prevWord === '\n' || /[.!?]$/.test(prevWord)) break;
        start--;
    }

    while (end < words.length - 1) {
        const currWord = words[end];
        if (currWord === undefined || currWord === '\n' || /[.!?]$/.test(currWord)) break;
        end++;
    }
    return { start, end };
};

const getNextLargeChunk = (words: string[], startIndex: number) => {
    const TARGET_SIZE = 4000; 
    let end = Math.min(words.length, startIndex + TARGET_SIZE);
    
    if (end < words.length) {
        let lookback = end;
        const limit = Math.max(startIndex, end - 500); 
        while (lookback > limit) {
             const w = words[lookback];
             if (/[.!?]$/.test(w) || w === '\n') {
                 end = lookback + 1;
                 break;
             }
             lookback--;
        }
    }
    
    return {
        text: words.slice(startIndex, end).join(' '),
        start: startIndex,
        end: end
    };
};

const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
};

// Helper to flatten chapters for position mapping
const flattenChapters = (chapters: Chapter[]): Chapter[] => {
    let flat: Chapter[] = [];
    chapters.forEach(c => {
        flat.push(c);
        if (c.subchapters) {
            flat = flat.concat(flattenChapters(c.subchapters));
        }
    });
    return flat;
};

// --- Sub-Components ---

// Character-Based WheelDisplay with Constant Visual Speed and Active Sync
const WheelDisplay = React.memo(({ 
    words, 
    currentIndex, 
    isPlaying, 
    wpm, 
    continuousMode, 
    theme, 
    fontSize, 
    onIndexChange 
}: { 
    words: string[], 
    currentIndex: number, 
    isPlaying: boolean, 
    wpm: number, 
    continuousMode: boolean, 
    theme: any, 
    fontSize: number, 
    onIndexChange: (idx: number) => void 
}) => {
    const [tick, setTick] = useState(0);
    const smoothIndexRef = useRef(currentIndex);
    const lastTimeRef = useRef(0);
    const lastRenderTimeRef = useRef(0);
    const loopRef = useRef<number | null>(null);

    // When the parent updates currentIndex (from TTS or manual seek), we decide how to handle it.
    useEffect(() => {
        // Calculate difference between where the wheel IS and where it SHOULD be.
        const diff = smoothIndexRef.current - currentIndex;
        const absDiff = Math.abs(diff);
        
        // If not playing, or not continuous, or if the diff is massive (seek), just snap.
        // A "seek" is usually > 1.5 words away.
        if (!continuousMode || !isPlaying || absDiff > 1.5) {
             smoothIndexRef.current = currentIndex;
        }
        // If playing in continuous mode with a small diff, the loop will handle the catch-up.
    }, [currentIndex, continuousMode, isPlaying]);

    // Helper: Standard ORP (Optimum Recognition Point) Pivot
    const getPivot = (w: string | undefined) => {
        if (!w) return 0;
        return Math.floor((w.length + 1) / 2) - 1;
    }

    // Animation Loop
    useEffect(() => {
        if (continuousMode) {
            const loop = (time: number) => {
                if (!lastTimeRef.current) lastTimeRef.current = time;
                const dt = (time - lastTimeRef.current) / 1000;
                lastTimeRef.current = time;

                if (isPlaying) {
                    const idx = Math.floor(smoothIndexRef.current);
                    const currentWord = words[idx];
                    
                    // 1. Calculate Base Speed
                    // This is the ideal speed if we were perfectly in sync.
                    let stepDist = 5; 
                    if (currentWord) {
                        const nextWord = words[idx + 1];
                        const curLen = currentWord.length;
                        const curPivot = getPivot(currentWord);
                        const nextPivot = getPivot(nextWord);
                        stepDist = (curLen + 1) + nextPivot - curPivot;
                    }
                    const visualSpeedFactor = 5 / Math.max(1, stepDist);
                    const baseIncrement = (wpm / 60) * dt;
                    let increment = baseIncrement * visualSpeedFactor;

                    // 2. Apply Sync Correction (Proportional Controller)
                    // Error > 0 means the Target (currentIndex) is AHEAD of SmoothIndex. We are LAGGING.
                    // We need to INCREASE speed.
                    const error = currentIndex - smoothIndexRef.current;
                    
                    // K is the gain. If we are 1 word behind, how much extra index per second do we add?
                    // Adding 1.0 * dt means we catch up 1 word in 1 second.
                    // Let's be a bit more aggressive to feel responsive but smooth.
                    const K = 3.0; 
                    
                    // Only apply correction if error is within "non-seek" bounds
                    if (Math.abs(error) <= 1.5) {
                         increment += (error * K * dt);
                    }
                    
                    // Apply
                    smoothIndexRef.current += increment;
                    
                    // Boundary Checks
                    if (smoothIndexRef.current >= words.length) {
                        smoothIndexRef.current = words.length - 1;
                        onIndexChange(words.length - 1);
                    } else if (smoothIndexRef.current < 0) {
                        smoothIndexRef.current = 0;
                    } else {
                        // Notify parent of integer changes ONLY if we are driving the playback (no TTS)
                        // If TTS is driving, parent updates us, we just smooth.
                        // But for "onIndexChange" usually means updating the seek bar UI.
                        const newInt = Math.floor(smoothIndexRef.current);
                        if (newInt !== Math.floor(smoothIndexRef.current - increment)) {
                             onIndexChange(newInt);
                        }
                    }
                    
                    // Throttle React Renders to ~30 FPS for the 3D transforms
                    if (time - lastRenderTimeRef.current > 33) {
                        lastRenderTimeRef.current = time;
                        setTick(t => t + 1);
                    }
                }
                loopRef.current = requestAnimationFrame(loop);
            };
            loopRef.current = requestAnimationFrame(loop);
            return () => { if (loopRef.current) cancelAnimationFrame(loopRef.current); lastTimeRef.current = 0; };
        } else {
             smoothIndexRef.current = currentIndex;
             setTick(t => t + 1);
        }
    }, [continuousMode, isPlaying, wpm, words, onIndexChange, currentIndex]); // Changed words.length to words to prevent stale closure

    const radius = 500; 
    const charSpacingAngle = 2.5; // Degrees per character

    const currentWordIndex = continuousMode ? smoothIndexRef.current : currentIndex;
    const floorIndex = Math.floor(currentWordIndex);
    
    // Construct a window of text characters around the current position
    const contextRange = 8; // Words before/after
    const startIdx = Math.max(0, floorIndex - contextRange);
    const endIdx = Math.min(words.length, floorIndex + contextRange + 1);
    
    // Build array of characters with metadata
    let charList: { char: string, wordIndex: number, isCenter: boolean }[] = [];

    for (let i = startIdx; i < endIdx; i++) {
        const word = words[i];
        if (!word) continue;
        const chars = word.split('');
        chars.forEach((c, cIdx) => {
            charList.push({ char: c, wordIndex: i, isCenter: false });
        });
        // Add space
        if (i < endIdx - 1) {
             charList.push({ char: ' ', wordIndex: i, isCenter: false });
        }
    }

    // 1. Calculate activeCharIndex (The Global Pivot Index of the current word)
    let activeCharIndex = 0;
    // Count chars up to the current word
    for (let i = startIdx; i < floorIndex; i++) {
        const w = words[i];
        if (w) {
            activeCharIndex += (w.length + 1);
        }
    }
    // Add Pivot of current word
    activeCharIndex += getPivot(words[floorIndex]);
    
    // 2. Calculate smooth offset
    const fraction = currentWordIndex - floorIndex;
    
    const curPivot = getPivot(words[floorIndex]);
    const nextPivot = getPivot(words[floorIndex + 1]);
    const curLen = words[floorIndex]?.length || 0;
    
    const stepDist = (curLen + 1) + nextPivot - curPivot;
    const fractionalCharOffset = fraction * stepDist;

    const renderChars = [];
    
    for (let i = 0; i < charList.length; i++) {
        const charObj = charList[i];
        // Distance from the exact float center
        const distance = i - (activeCharIndex + fractionalCharOffset);
        
        const angle = distance * charSpacingAngle;

        if (Math.abs(angle) > 90) continue;

        const absAngle = Math.abs(angle);
        const opacity = Math.max(0, 1 - Math.pow(absAngle / 60, 2)); // Fade edges
        // Fisheye scale: Center is biggest
        const scale = 0.8 + (Math.cos(angle * (Math.PI / 180)) * 0.7); 
        
        // Highlight logic
        const isTargetWord = charObj.wordIndex === floorIndex;
        const colorClass = isTargetWord && !continuousMode ? 'text-red-500 font-bold' : theme.text;

        renderChars.push(
            <span
                key={`c-${i}`}
                className={`absolute inline-block whitespace-pre font-mono ${colorClass}`}
                style={{
                    fontSize: `${fontSize}px`,
                    opacity: opacity,
                    transform: `rotateY(${angle}deg) translateZ(${radius}px) scale(${scale})`,
                    backfaceVisibility: 'hidden',
                    willChange: 'transform'
                }}
            >
                {charObj.char}
            </span>
        );
    }

    return (
        <div className="flex items-center justify-center h-full w-full overflow-hidden perspective-[1000px] select-none" style={{ perspective: '1000px' }}>
             <div 
                className="relative w-full h-64 flex items-center justify-center preserve-3d" 
                style={{ 
                    transformStyle: 'preserve-3d',
                    transform: `translateZ(-${radius}px) rotateX(10deg)` // Slight Upward Tilt 
                }}
             >
                 {renderChars}
             </div>
             <div className="absolute top-1/2 left-1/2 w-0.5 h-16 bg-red-500/20 -translate-x-1/2 -translate-y-1/2 pointer-events-none blur-[1px]"></div>
        </div>
    );
}, (prev, next) => {
    // Custom equality check
    if (next.continuousMode && next.isPlaying && prev.isPlaying) {
        // In continuous mode, we rely on the internal loop for index updates, 
        // BUT we need to detect if 'currentIndex' changed significantly or if 'wpm' changed.
        // We return false if currentIndex changed (to trigger the effect hook in the component)
        return (
             prev.currentIndex === next.currentIndex &&
             prev.wpm === next.wpm &&
             prev.words === next.words &&
             prev.theme === next.theme &&
             prev.fontSize === next.fontSize
        );
    }
    return (
        prev.currentIndex === next.currentIndex && 
        prev.isPlaying === next.isPlaying &&
        prev.wpm === next.wpm &&
        prev.continuousMode === next.continuousMode &&
        prev.words === next.words &&
        prev.theme === next.theme &&
        prev.fontSize === next.fontSize
    );
});


export const Reader: React.FC<ReaderProps> = ({ 
  book, 
  mode,
  settings, 
  voiceSettings,
  glossary, 
  onClose, 
  onUpdateProgress,
  onOpenSettings,
  onUpdateBook,
  onUpdateGlossary,
  onUpdateVoiceSettings,
  onSettingsChange
}) => {
  // ... (State logic unchanged) ...
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(book.lastPosition);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [dictionaryData, setDictionaryData] = useState<DictionaryResult | null>(null);
  const [isDictionaryLoading, setIsDictionaryLoading] = useState(false);
  const [dictionaryEditMode, setDictionaryEditMode] = useState(false);
  const [sidebarSettingsOpen, setSidebarSettingsOpen] = useState(false);
  const [statLeftMode, setStatLeftMode] = useState<'elapsed' | 'percent'>('elapsed');
  const [statRightMode, setStatRightMode] = useState<'remaining' | 'total'>('remaining');
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [autoHideControls, setAutoHideControls] = useState(mode === 'paginated');
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [recenterDirection, setRecenterDirection] = useState<'up' | 'down' | null>(null);
  const [tocOpen, setTocOpen] = useState(false); // TOC State
  const [tocAutoPlay, setTocAutoPlay] = useState(true); // TOC Auto-Play Toggle (Default True)
  const [paginatedTransition, setPaginatedTransition] = useState(true); // Controls CSS transition for paginated view
  const [pendingJumpIndex, setPendingJumpIndex] = useState<number | null>(null);

  // BROWSE MODE STATE: When set, the Reader view window is decoupled from currentIndex
  const [browserWindowStart, setBrowserWindowStart] = useState<number | null>(null);

  const scrollAnimRef = useRef<number | null>(null);
  const continuousScrollRef = useRef<number | null>(null);
  const isAutoScrollingRef = useRef(false);
  const wasAutoScrollEnabledRef = useRef(true); // Track state before opening dictionary
  const wasPlayingRef = useRef(false); // Track play state before opening dictionary
  const clickedWordIndexRef = useRef<number>(-1); // Track which word was clicked for dictionary
  
  const [paginatedOffset, setPaginatedOffset] = useState(0); 
  const paginatedOffsetRef = useRef(0);
  const paginatedContainerRef = useRef<HTMLDivElement>(null);
  const paginatedContentRef = useRef<HTMLDivElement>(null);
  const lastWheelTimeRef = useRef(0);
  const currentLineTopRef = useRef<number | null>(null);
  const wordsOnLineRef = useRef<number>(0);
  const voiceSettingsRef = useRef(voiceSettings);
  
  // Drag state for TikTok
  const [tiktokDragState, setTiktokDragState] = useState<{ isDragging: boolean, startX: number, startY: number, offsetX: number, offsetY: number }>({
      isDragging: false, startX: 0, startY: 0, offsetX: settings.tiktokCustomPosition?.x || 0, offsetY: settings.tiktokCustomPosition?.y || 0
  });

  // Map of chapter positions for efficient lookup in render
  const chapterMap = useMemo(() => {
    const map = new Map<number, string>();
    if (!book.chapters) return map;
    const flat = flattenChapters(book.chapters);
    flat.forEach(c => map.set(c.position, c.title));
    return map;
  }, [book.chapters]);

  // Reset drag offset when settings change externally (e.g. reset button)
  useEffect(() => {
      if (settings.tiktokCustomPosition === null) {
          setTiktokDragState(prev => ({ ...prev, offsetX: 0, offsetY: 0 }));
      }
  }, [settings.tiktokCustomPosition]);
  
  useEffect(() => { voiceSettingsRef.current = voiceSettings; }, [voiceSettings]);
  useEffect(() => { setAutoHideControls(mode === 'paginated'); }, [mode]);
  useEffect(() => { paginatedOffsetRef.current = paginatedOffset; }, [paginatedOffset]);
  
  // Scroll active chapter into view when TOC opens (ALWAYS)
  useEffect(() => {
    if (tocOpen) {
        setTimeout(() => {
            const activeEl = document.querySelector('[data-toc-active="true"]');
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
  }, [tocOpen]);
  
  // Handle Pending Jumps (Fix for large scroll jumps)
  useEffect(() => {
        if (pendingJumpIndex !== null && activeWordRef.current) {
            const currentIdx = parseInt(activeWordRef.current.getAttribute('data-index') || '-1');
            // Ensure we are scrolling to the NEW target, not a lingering old one
            // We allow some tolerance for visualIndex vs actual index discrepancies
            if (Math.abs(currentIdx - pendingJumpIndex) < 200) {
                 if (mode === 'scroll') {
                     activeWordRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
                     setAutoScrollEnabled(true);
                 } else if (mode === 'paginated' && paginatedContainerRef.current) {
                      const containerWidth = paginatedContainerRef.current.clientWidth;
                      const gap = 40;
                      // We can use activeWordRef.current.offsetLeft directly as we know it is the target index
                      const wordLeft = activeWordRef.current.offsetLeft;
                      const pageIndex = Math.floor(wordLeft / (containerWidth + gap));
                      const newOffset = pageIndex * (containerWidth + gap);
                      
                      setPaginatedOffset(newOffset);
                      
                      // Re-enable transition after a brief moment to allow instant jump
                      setTimeout(() => setPaginatedTransition(true), 50);
                 }
                 setPendingJumpIndex(null);
            }
        }
  });

  // ... (Voices effect unchanged) ...
  useEffect(() => {
    const load = () => {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
        const specificEmma = voices.find(v => v.name === "Microsoft Emma Multilingual Online (Natural)");
        if (specificEmma && !voiceSettings.favorites.includes(specificEmma.voiceURI)) {
             onUpdateVoiceSettings({ ...voiceSettings, favorites: [...voiceSettings.favorites, specificEmma.voiceURI] });
        }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  const filteredVoices = useMemo(() => {
      return availableVoices.filter(v => 
          v.name.toLowerCase().includes(voiceSearch.toLowerCase()) || 
          v.lang.toLowerCase().includes(voiceSearch.toLowerCase())
      ).sort((a, b) => {
          const aFav = voiceSettings.favorites.includes(a.voiceURI);
          const bFav = voiceSettings.favorites.includes(b.voiceURI);
          if (aFav && !bFav) return -1;
          if (!aFav && bFav) return 1;
          return 0;
      });
  }, [availableVoices, voiceSearch, voiceSettings.favorites]);

  const toggleFavorite = (uri: string) => {
    const favs = voiceSettings.favorites.includes(uri) ? voiceSettings.favorites.filter(f => f !== uri) : [...voiceSettings.favorites, uri];
    onUpdateVoiceSettings({ ...voiceSettings, favorites: favs });
  };

  const [normalWindowStart, setNormalWindowStart] = useState(0);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  
  const activeWpm = useMemo(() => {
      let isVoiceEnabled = false;
      if (mode === 'spritz') isVoiceEnabled = voiceSettings.spritzEnabled;
      else if (mode === 'wheel') isVoiceEnabled = voiceSettings.wheelEnabled;
      else if (mode === 'tiktok') isVoiceEnabled = voiceSettings.tiktokEnabled;
      else isVoiceEnabled = voiceSettings.normalEnabled;

      if (mode === 'spritz' || mode === 'wheel' || mode === 'tiktok') {
          return settings.spritzWpm;
      }
      if ((mode === 'scroll' || mode === 'paginated') && isVoiceEnabled) {
          return Math.max(1, Math.round(200 * voiceSettings.rate));
      }
      return settings.normalWpm;
  }, [mode, settings.spritzWpm, settings.normalWpm, voiceSettings.normalEnabled, voiceSettings.spritzEnabled, voiceSettings.wheelEnabled, voiceSettings.tiktokEnabled, voiceSettings.rate]);

  const activeFontSize = (mode === 'spritz' || mode === 'wheel' || mode === 'tiktok') ? settings.spritzFontSize : settings.normalFontSize;

  const wordsRef = useRef<string[]>([]);
  const indexRef = useRef(currentIndex);
  const onUpdateProgressRef = useRef(onUpdateProgress);
  const activeWordRef = useRef<HTMLSpanElement>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const lastScrollTimeRef = useRef<number>(0);
  
  const shouldPlayRef = useRef(false);
  const activeUtterancesRef = useRef<Set<SpeechSynthesisUtterance>>(new Set());
  const timerRef = useRef<number | null>(null);
  const chunkQueueNextIndex = useRef(0);
  
  // Memoize words for WheelDisplay
  const memoizedWords = useMemo(() => wordsRef.current, [wordsRef.current.length, book.id]); // Re-memoize if length or book changes

  useEffect(() => { 
      indexRef.current = currentIndex; 
  }, [currentIndex]);
  
  useEffect(() => { onUpdateProgressRef.current = onUpdateProgress; }, [onUpdateProgress]);

  // Periodic Save
  useEffect(() => {
      const interval = setInterval(() => {
          if (isPlaying) {
              onUpdateProgressRef.current(indexRef.current);
          }
      }, 30000); // 30 seconds
      return () => clearInterval(interval);
  }, [isPlaying]);

  // Calculate Visual Index (The index to SHOW) based on Audio/Time delay
  // If playing, we add the delay (converted to words).
  const visualIndex = useMemo(() => {
    if (!isPlaying || !settings.audioTextDelay) return currentIndex;
    const offsetWords = (settings.audioTextDelay / 60000) * activeWpm;
    // visualIndex > currentIndex means Visual is AHEAD of audio
    const newIdx = currentIndex + offsetWords;
    return Math.min(wordsRef.current.length - 1, newIdx);
  }, [currentIndex, isPlaying, settings.audioTextDelay, activeWpm, wordsRef.current.length]);

  // ... (Parsing logic unchanged) ...
  useEffect(() => {
    const rawSegments = book.content.split(/(\n)/);
    const tokens: string[] = [];
    rawSegments.forEach(seg => {
        if (seg === '\n') tokens.push('\n');
        else {
            const words = seg.trim().split(/[ ]+/);
            words.forEach(w => { if (w.length > 0) tokens.push(w); });
        }
    });
    wordsRef.current = tokens;
    setNormalWindowStart(Math.max(0, book.lastPosition - 200));
    setVisibleRange({ start: book.lastPosition, end: book.lastPosition + 50 });
  }, [book.content, book.lastPosition]);

  useEffect(() => { return () => { onUpdateProgressRef.current(indexRef.current); }; }, []);

  useEffect(() => {
      return () => {
          shouldPlayRef.current = false;
          window.speechSynthesis.cancel();
          if (timerRef.current) clearInterval(timerRef.current);
          if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
          if (continuousScrollRef.current) cancelAnimationFrame(continuousScrollRef.current);
      }
  }, []);

  useEffect(() => { 
      if (isPlaying) {
          setDictionaryOpen(false); 
      }
  }, [isPlaying]);

  // --- Virtualization Window Logic ---
  // If browserWindowStart is set (Browse Mode), use it. Otherwise use normalWindowStart (Follow Mode).
  const renderWindowStart = browserWindowStart !== null ? browserWindowStart : normalWindowStart;

  useEffect(() => {
      if ((mode !== 'scroll') || settings.normalViewMode === 'page') return;
      
      // If we are in Browse Mode (manual override), DO NOT update window based on visualIndex
      if (browserWindowStart !== null) return;

      const WINDOW_SIZE = 2500;
      const BUFFER = 500; 
      // Use visualIndex for window calculation to ensure we load future text if offset is large
      if (visualIndex >= normalWindowStart + WINDOW_SIZE - BUFFER) {
          setNormalWindowStart(Math.max(0, visualIndex - 200));
      } else if (visualIndex < normalWindowStart + 100 && normalWindowStart > 0) {
          setNormalWindowStart(Math.max(0, visualIndex - WINDOW_SIZE + 200));
      }
  }, [visualIndex, mode, normalWindowStart, settings.normalViewMode, browserWindowStart]);

  const paginatedWindow = useMemo(() => {
    if (mode !== 'paginated') return { start: 0, end: 0 };
    const CHUNK_SIZE = 3000;
    // Use visualIndex
    const start = Math.max(0, visualIndex - 500); 
    const end = Math.min(wordsRef.current.length, visualIndex + CHUNK_SIZE);
    return { start, end };
  }, [mode, wordsRef.current.length, visualIndex]); 

  useEffect(() => {
      if (mode !== 'paginated') return;
      if (visualIndex > paginatedWindow.end - 500 || visualIndex < paginatedWindow.start) {
          setNormalWindowStart(Math.max(0, visualIndex - 500));
      }
  }, [visualIndex, mode, paginatedWindow]);
  
  const activePaginatedWindow = useMemo(() => {
      if (mode !== 'paginated') return { start: 0, end: 0 };
      const start = renderWindowStart;
      const end = Math.min(wordsRef.current.length, start + 4000);
      return { start, end };
  }, [renderWindowStart, mode, wordsRef.current.length]);

  const snapToPage = useCallback(() => {
      if ((mode !== 'paginated') || !paginatedContainerRef.current || !activeWordRef.current) return;
      const container = paginatedContainerRef.current;
      const containerWidth = container.clientWidth;
      const gap = 40; 
      const wordLeft = activeWordRef.current.offsetLeft;
      const pageIndex = Math.floor(wordLeft / (containerWidth + gap));
      const newOffset = pageIndex * (containerWidth + gap);
      if (Math.abs(newOffset - paginatedOffsetRef.current) > 5) {
          setPaginatedOffset(newOffset);
      }
  }, [mode]);

  useEffect(() => {
      if ((mode !== 'paginated') || !paginatedContainerRef.current) return;
      const resizeObserver = new ResizeObserver(() => { snapToPage(); });
      resizeObserver.observe(paginatedContainerRef.current);
      return () => resizeObserver.disconnect();
  }, [mode, snapToPage]);

  // ... (Page change and scroll logic unchanged) ...
  useEffect(() => {
    currentLineTopRef.current = null;
    wordsOnLineRef.current = 0;
    if (mode === 'paginated') {
        setTimeout(() => {
            if (activeWordRef.current && paginatedContainerRef.current) {
                const wordLeft = activeWordRef.current.offsetLeft;
                const containerWidth = paginatedContainerRef.current.clientWidth;
                const gap = 40;
                const pageIndex = Math.floor(wordLeft / (containerWidth + gap));
                const newOffset = pageIndex * (containerWidth + gap);
                setPaginatedOffset(newOffset);
            }
        }, 100);
    }
  }, [book.id, mode, settings.normalFontSize, settings.normalMaxWidth, settings.normalFontFamily, settings.lineHeight, settings.paginatedColumns]);

  const changePage = useCallback((direction: -1 | 1) => {
        if (!paginatedContainerRef.current) return;
        const containerWidth = paginatedContainerRef.current.clientWidth;
        const gap = 40;
        const stride = containerWidth + gap; 
        const targetScroll = paginatedOffset + (direction * stride);
        
        if (targetScroll < 0) {
             if (activePaginatedWindow.start > 0) {
                setNormalWindowStart(Math.max(0, activePaginatedWindow.start - 2000));
                setTimeout(() => setPaginatedOffset(0), 50); 
             }
             return;
        }

        if (paginatedContentRef.current && targetScroll >= paginatedContentRef.current.scrollWidth) {
             if (activePaginatedWindow.end < wordsRef.current.length) {
                  setNormalWindowStart(activePaginatedWindow.end - 500);
                  setTimeout(() => setPaginatedOffset(0), 50);
             }
             return;
        }

        if (paginatedContentRef.current) {
            const spans = paginatedContentRef.current.querySelectorAll('span[data-index]');
            let foundIndex = -1;
            for (let i = 0; i < spans.length; i++) {
                const el = spans[i] as HTMLElement;
                if (el.offsetLeft >= targetScroll - 10) {
                    foundIndex = parseInt(el.getAttribute('data-index') || '-1');
                    if (foundIndex !== -1) break;
                }
            }

            if (foundIndex !== -1 && foundIndex !== Math.floor(visualIndex)) {
                // Seek logic (Update actual currentIndex)
                setBrowserWindowStart(null); // Clear browse mode if navigating manually
                setCurrentIndex(foundIndex);
                if (isPlaying) {
                    shouldPlayRef.current = true; 
                    window.speechSynthesis.cancel();
                    activeUtterancesRef.current.clear();
                    chunkQueueNextIndex.current = foundIndex;
                    setTimeout(() => speakText(foundIndex), 10);
                }
            }
        }
        setPaginatedOffset(targetScroll);
  }, [paginatedOffset, activePaginatedWindow, wordsRef.current.length, visualIndex, isPlaying]);

  const handlePaginatedWheel = useCallback((e: React.WheelEvent) => {
    if (mode !== 'paginated') return;
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 250) return; 
    if (Math.abs(e.deltaY) < 20) return;

    if (e.deltaY > 0) { changePage(1); lastWheelTimeRef.current = now; } 
    else { changePage(-1); lastWheelTimeRef.current = now; }
  }, [mode, changePage]);

  // NEW: Navigate Sentence Logic
  const navigateBySentence = useCallback((direction: 1 | -1) => {
      setBrowserWindowStart(null); // Clear browse mode
      const range = getSentenceRange(wordsRef.current, currentIndex);
      let newIndex = currentIndex;

      if (direction === 1) {
          // Go to start of next sentence
          newIndex = Math.min(wordsRef.current.length - 1, range.end + 1);
      } else {
          // If we are deep into the current sentence, go to its start
          if (currentIndex > range.start + 2) {
              newIndex = range.start;
          } else {
              // Otherwise go to start of previous sentence
              const prevRange = getSentenceRange(wordsRef.current, Math.max(0, range.start - 2));
              newIndex = prevRange.start;
          }
      }

      setCurrentIndex(newIndex);
      if (isPlaying) {
          shouldPlayRef.current = true;
          window.speechSynthesis.cancel();
          activeUtterancesRef.current.clear();
          chunkQueueNextIndex.current = newIndex;
          setTimeout(() => speakText(newIndex), 10);
      }
      if (mode === 'scroll') setTimeout(scrollToActiveWord, 100);
  }, [currentIndex, isPlaying, mode, wordsRef.current]);

  // NEW: Speed Change Logic
  const handleSpeedChange = useCallback((direction: 1 | -1) => {
      // Determine which setting to change based on mode
      if (mode === 'spritz' || mode === 'wheel' || mode === 'tiktok') {
          const currentWpm = settings.spritzWpm;
          const newWpm = Math.max(50, Math.min(1000, currentWpm + (direction * 25)));
          onSettingsChange({ ...settings, spritzWpm: newWpm });
      } else {
          // Scroll or Paginated or Normal
          const currentRate = voiceSettings.rate;
          // 0.1 increment
          const newRate = Math.max(0.1, Math.min(4.0, parseFloat((currentRate + (direction * 0.1)).toFixed(1))));
          onUpdateVoiceSettings({ ...voiceSettings, rate: newRate });
      }
  }, [mode, settings, voiceSettings, onSettingsChange, onUpdateVoiceSettings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (dictionaryOpen || sidebarSettingsOpen || voiceMenuOpen || speedMenuOpen || tocOpen) return;
        
        // Global Play/Pause via Space
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            togglePlay();
            return; 
        }

        // New Navigation & Speed Controls
        switch (e.key) {
            case 'ArrowLeft': 
                e.preventDefault(); 
                navigateBySentence(-1);
                break;
            case 'ArrowRight': 
                e.preventDefault(); 
                navigateBySentence(1); 
                break;
            case 'ArrowUp':
                e.preventDefault();
                handleSpeedChange(1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                handleSpeedChange(-1);
                break;
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, changePage, dictionaryOpen, sidebarSettingsOpen, voiceMenuOpen, speedMenuOpen, isPlaying, navigateBySentence, handleSpeedChange, tocOpen]);

  const smoothScroll = useCallback((target: number, duration: number) => {
      const container = readerContainerRef.current;
      if (!container) return;
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
      const start = container.scrollTop;
      const change = target - start;
      const startTime = performance.now();
      const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 4);
          container.scrollTop = start + (change * ease);
          if (progress < 1) scrollAnimRef.current = requestAnimationFrame(animate);
          else scrollAnimRef.current = null;
      };
      scrollAnimRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const container = readerContainerRef.current;
    if (mode === 'scroll' && settings.normalViewMode === 'scroll' && settings.autoScrollMode === 'continuous' && container) {
        const loop = () => {
            if (!isPlaying || !autoScrollEnabled) {
                 if (continuousScrollRef.current) cancelAnimationFrame(continuousScrollRef.current);
                 return;
            }
            isAutoScrollingRef.current = true;
            if (activeWordRef.current) {
                 const rect = activeWordRef.current.getBoundingClientRect();
                 const containerRect = container.getBoundingClientRect();
                 const wordCenter = rect.top + rect.height / 2;
                 const viewCenter = containerRect.top + containerRect.height / 2;
                 const delta = wordCenter - viewCenter;
                 if (Math.abs(delta) > 5) {
                    const correction = delta * 0.05;
                    container.scrollTop += correction;
                 }
            } else {
                 const speed = settings.continuousScrollSpeed || 1.0;
                 container.scrollTop += speed;
            }
            continuousScrollRef.current = requestAnimationFrame(loop);
        };
        continuousScrollRef.current = requestAnimationFrame(loop);
        return () => { if (continuousScrollRef.current) cancelAnimationFrame(continuousScrollRef.current); };
    }
  }, [mode, settings.normalViewMode, isPlaying, autoScrollEnabled, settings.autoScrollMode, settings.continuousScrollSpeed]);

  useEffect(() => {
    if (settings.autoScrollMode === 'continuous') return;
    if (mode === 'scroll' && settings.normalViewMode === 'scroll' && activeWordRef.current && readerContainerRef.current && isPlaying && autoScrollEnabled) {
        const el = activeWordRef.current;
        const container = readerContainerRef.current;
        const currentWord = wordsRef.current[Math.floor(visualIndex)];
        const currentTop = el.offsetTop;
        if (currentLineTopRef.current === null) currentLineTopRef.current = currentTop;
        if (Math.abs(currentTop - currentLineTopRef.current) > 15) {
            currentLineTopRef.current = currentTop;
            wordsOnLineRef.current = 1;
        } else wordsOnLineRef.current += 1;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const isVisible = (rect.top >= containerRect.top && rect.bottom <= containerRect.bottom - 60);
        const relativeTop = rect.top - containerRect.top;
        let targetScrollTop = container.scrollTop + relativeTop - (container.clientHeight / 2) + (rect.height / 2);
        const scrollTrigger = settings.autoScrollTriggerMargin ?? 2;
        const scrollDuration = settings.autoScrollDuration ?? 250;
        const scrollMode = settings.autoScrollMode || 'line';
        let shouldScroll = false;
        // Logic uses visualIndex approx via currentWord lookup
        if (scrollMode === 'line') { if (wordsOnLineRef.current === scrollTrigger) shouldScroll = true; } 
        else if (scrollMode === 'sentence') { if (/[.!?]['"]?$/.test(currentWord)) shouldScroll = true; } 
        else if (scrollMode === 'paragraph') {
            const nextToken = wordsRef.current[Math.floor(visualIndex) + 1];
            if (nextToken === '\n' || !nextToken) shouldScroll = true;
        } else if (scrollMode === 'page') {
             const threshold = containerRect.bottom - 160;
             if (rect.bottom > threshold) {
                 shouldScroll = true;
                 targetScrollTop = container.scrollTop + relativeTop - 40;
             }
        }
        if (!isVisible) {
            smoothScroll(targetScrollTop, 400);
            wordsOnLineRef.current = 100; 
        } else if (shouldScroll) {
            smoothScroll(targetScrollTop, scrollDuration);
        }
    }
  }, [visualIndex, mode, isPlaying, settings.normalViewMode, autoScrollEnabled, smoothScroll, settings.autoScrollDuration, settings.autoScrollTriggerMargin, settings.autoScrollMode]);

  const scrollToActiveWord = (e?: React.MouseEvent | React.TouchEvent) => {
      if (e) e.stopPropagation();
      setBrowserWindowStart(null); // Reset browse mode
      
      if (mode === 'scroll' && activeWordRef.current) {
          activeWordRef.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          setTimeout(() => {
              setAutoScrollEnabled(true);
              setRecenterDirection(null);
              currentLineTopRef.current = null;
              wordsOnLineRef.current = 0;
          }, 100);
      } else if (mode === 'paginated' && activeWordRef.current && paginatedContainerRef.current) {
          const containerWidth = paginatedContainerRef.current.clientWidth;
          const wordLeft = activeWordRef.current.offsetLeft;
          const gap = 40;
          const pageIndex = Math.floor(wordLeft / (containerWidth + gap));
          setPaginatedOffset(pageIndex * (containerWidth + gap));
      }
  };

  const handleUserInteraction = useCallback(() => {
      // Don't disable scroll just because of interaction if the dictionary is open
      // This listener is on the container scroll events
      if (dictionaryOpen) return;
      if (scrollAnimRef.current) { cancelAnimationFrame(scrollAnimRef.current); scrollAnimRef.current = null; }
      if (autoScrollEnabled) setAutoScrollEnabled(false);
  }, [autoScrollEnabled, dictionaryOpen]);

  const enqueueNextChunk = useCallback(() => {
      if (!shouldPlayRef.current) return;
      if (activeUtterancesRef.current.size >= 2) return;

      const currentStart = chunkQueueNextIndex.current;
      if (currentStart >= wordsRef.current.length) return;

      const repeatMode = voiceSettingsRef.current.repeatMode || 'off';
      let chunk;

      if (repeatMode === 'word') {
          // Single word unit
          const w = wordsRef.current[currentStart];
          chunk = { text: w, start: currentStart, end: currentStart + 1 };
      } else if (repeatMode === 'phrase') {
          // Phrase unit: Scan for comma, semicolon, colon, or sentence endings
          let endIdx = currentStart;
          while (endIdx < wordsRef.current.length) {
              const w = wordsRef.current[endIdx];
              if (/[.!?\n,;:]['"]?$/.test(w) || w === '\n') {
                  break;
              }
              endIdx++;
          }
          const sliceEnd = Math.min(wordsRef.current.length, endIdx + 1);
          const text = wordsRef.current.slice(currentStart, sliceEnd).join(' ');
          chunk = { text, start: currentStart, end: sliceEnd };
      } else if (repeatMode === 'sentence') {
          // Sentence unit (scan forward only from currentStart)
          let endIdx = currentStart;
          while (endIdx < wordsRef.current.length) {
              const w = wordsRef.current[endIdx];
              if (/[.!?]['"]?$/.test(w) || w === '\n') {
                  break;
              }
              endIdx++;
          }
          const sliceEnd = Math.min(wordsRef.current.length, endIdx + 1);
          const text = wordsRef.current.slice(currentStart, sliceEnd).join(' ');
          chunk = { text, start: currentStart, end: sliceEnd };
      } else {
          // Default large chunk
          chunk = getNextLargeChunk(wordsRef.current, currentStart);
      }

      if (!chunk.text.trim()) {
           chunkQueueNextIndex.current = chunk.end;
           if (chunk.end < wordsRef.current.length) enqueueNextChunk();
           return;
      }

      // Construct Utterance Logic
      const isRepeating = repeatMode !== 'off';
      const textMain = chunk.text;
      
      // OPTIMIZATION: Use a space separator for minimal pausing.
      const separator = " "; 
      
      // OPTIMIZATION: Strip trailing punctuation (including commas/colons for phrases) 
      // from the first part of the pair to avoid pauses.
      const firstPart = textMain.replace(/[.!?\n,;:]+$/, '');
      
      const fullText = isRepeating ? `${firstPart}${separator}${textMain}` : textMain;

      // Helper to create configured utterance
      const createUtterance = () => {
          const u = new SpeechSynthesisUtterance(fullText);
          const currentSettings = voiceSettingsRef.current;
          const voices = window.speechSynthesis.getVoices();
          let voice = null;
          if (currentSettings.voiceURI) voice = voices.find(v => v.voiceURI === currentSettings.voiceURI) || null;
          if (!voice) voice = voices.find(v => v.name.includes('Emma')) || null;
          if (voice) u.voice = voice;
          u.rate = currentSettings.rate;
          u.pitch = currentSettings.pitch;
          
          u.onboundary = (event) => {
              if (event.name === 'word') {
                 let charIndex = event.charIndex;

                 // Logic for handling repetition boundaries
                 if (isRepeating) {
                     const splitPoint = firstPart.length + separator.length;
                     // If we are in the repeated part, offset the index back to the start
                     if (charIndex >= splitPoint) {
                         charIndex -= splitPoint;
                     }
                     // If we are somehow inside the separator (unlikely but safe to check), ignore
                     // Also check if charIndex was originally past splitPoint but mapped back
                     if (charIndex > firstPart.length) return;
                 }
                 
                 // Use firstPart (cleaned text) for logic if repeating, otherwise regular textMain
                 const referenceText = isRepeating ? firstPart : textMain;
                 const textBefore = referenceText.slice(0, charIndex);
                 const relativeIndex = (textBefore.match(/ /g) || []).length;
                 const newIndex = chunk.start + relativeIndex;
                 
                 // Only update if changed
                 if (newIndex !== indexRef.current) {
                    setCurrentIndex(newIndex);
                    
                    if (mode === 'paginated' && activeWordRef.current && paginatedContainerRef.current) {
                        const el = activeWordRef.current;
                        const container = paginatedContainerRef.current;
                        const wordLeft = el.offsetLeft;
                        const currentScroll = Math.abs(parseFloat(paginatedContentRef.current?.style.transform.replace('translateX(', '').replace('px)', '') || '0'));
                        if (wordLeft > currentScroll + container.clientWidth) setPaginatedOffset(currentScroll + container.clientWidth + 40);
                    }
                 }
              }
          };
          
          u.onend = () => {
              if (activeUtterancesRef.current.has(u)) {
                  activeUtterancesRef.current.delete(u);
                  enqueueNextChunk();
                  if (activeUtterancesRef.current.size === 0 && chunkQueueNextIndex.current >= wordsRef.current.length) {
                      setIsPlaying(false);
                      shouldPlayRef.current = false;
                  }
              }
          };
          
          u.onerror = (event) => {
              if (event.error !== 'interrupted' && event.error !== 'canceled') console.error("TTS Error:", event.error);
              activeUtterancesRef.current.delete(u);
          };

          return u;
      };

      // Queue the single utterance (which contains the repeat if enabled)
      chunkQueueNextIndex.current = chunk.end;
      const u = createUtterance();
      activeUtterancesRef.current.add(u);
      window.speechSynthesis.speak(u);

      // Prefetch next chunk immediately to ensure gapless playback between chunks
      enqueueNextChunk();
  }, [mode, settings.wheelContinuousMode]);
  
  const speakText = useCallback((startIndex: number) => {
      shouldPlayRef.current = true;
      window.speechSynthesis.cancel();
      activeUtterancesRef.current.clear();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      chunkQueueNextIndex.current = startIndex;

      let isVoiceEnabled = false;
      if (mode === 'spritz') isVoiceEnabled = voiceSettings.spritzEnabled;
      else if (mode === 'wheel') isVoiceEnabled = voiceSettings.wheelEnabled;
      else if (mode === 'tiktok') isVoiceEnabled = voiceSettings.tiktokEnabled;
      else isVoiceEnabled = voiceSettings.normalEnabled;

      if (!isVoiceEnabled) {
          if (mode === 'wheel' && settings.wheelContinuousMode) return;
          const delay = 60000 / activeWpm;
          timerRef.current = window.setInterval(() => {
              if (!shouldPlayRef.current) {
                  if (timerRef.current) clearInterval(timerRef.current);
                  return;
              }
              setCurrentIndex(prev => {
                  if (prev >= wordsRef.current.length - 1) {
                      setIsPlaying(false);
                      shouldPlayRef.current = false;
                      if (timerRef.current) clearInterval(timerRef.current);
                      return prev;
                  }
                  return prev + 1;
              });
          }, delay);
          return;
      }
      enqueueNextChunk();
      // Ensure buffer is filled (1st call adds current, 2nd call ensures next is pre-fetched if logic allows)
      enqueueNextChunk();
  }, [activeWpm, voiceSettings, mode, enqueueNextChunk, settings.wheelContinuousMode]);

  // ... (Effect and togglePlay unchanged) ...
  useEffect(() => {
      const t = setTimeout(() => {
          if (!isPlaying) {
              setIsPlaying(true);
              shouldPlayRef.current = true;
              speakText(book.lastPosition);
              setTimeout(() => { if (mode === 'scroll') scrollToActiveWord(); }, 100);
          }
      }, 500);
      return () => clearTimeout(t);
  }, []);

  useEffect(() => {
      if (isPlaying) {
          shouldPlayRef.current = false;
          window.speechSynthesis.cancel();
          if (timerRef.current) clearInterval(timerRef.current);
          setTimeout(() => {
                shouldPlayRef.current = true;
                speakText(currentIndex);
          }, 50);
      }
  }, [voiceSettings.rate, voiceSettings.voiceURI, voiceSettings.normalEnabled, voiceSettings.spritzEnabled, voiceSettings.wheelEnabled, voiceSettings.tiktokEnabled, voiceSettings.repeatMode]);

  const togglePlay = () => {
    if (isPlaying) {
        shouldPlayRef.current = false;
        window.speechSynthesis.cancel();
        if (timerRef.current) clearInterval(timerRef.current);
        setIsPlaying(false);
    } else {
        shouldPlayRef.current = true;
        setIsPlaying(true);
        if (mode === 'scroll') scrollToActiveWord();
        speakText(currentIndex);
    }
  };

  const changePosition = (delta: number) => {
      setBrowserWindowStart(null); // Clear browse mode on manual seek
      const newIndex = Math.max(0, Math.min(wordsRef.current.length - 1, currentIndex + delta));
      setCurrentIndex(newIndex);
      if (isPlaying) {
          speakText(newIndex);
          if (mode === 'scroll') scrollToActiveWord();
      }
  };
  
  // Callback for WheelDisplay to update progress without heavy lifting in its loop
  const handleWheelIndexChange = useCallback((newIndex: number) => {
      // Use functional update to avoid dependency on currentIndex
      setCurrentIndex(prev => (prev !== newIndex ? newIndex : prev));
  }, []);

  const openDictionaryForWord = async (word: string, index?: number, initialEditMode = false) => {
    const cleanWord = word.replace(/[^\w\s'-]/g, '');
    if (!cleanWord) return;
    
    // SAVE INDEX HERE: Track which word was clicked
    clickedWordIndexRef.current = index !== undefined ? index : currentIndex;

    // Track auto scroll state to resume later
    wasAutoScrollEnabledRef.current = autoScrollEnabled;
    setAutoScrollEnabled(false); // Stop scrolling when dictionary opens
    
    // Track play state to resume later if option enabled
    wasPlayingRef.current = isPlaying;
    if (settings.pauseAudioOnGlossary && isPlaying) {
        setIsPlaying(false);
        shouldPlayRef.current = false;
        window.speechSynthesis.cancel();
        if (timerRef.current) clearInterval(timerRef.current);
    }

    setSelectedWord(word);
    setDictionaryOpen(true);
    setDictionaryEditMode(initialEditMode);
    const glossaryKey = cleanWord.toLowerCase();
    if (glossary[glossaryKey]) {
        setDictionaryData({
            definition: glossary[glossaryKey].definition,
            translation: glossary[glossaryKey].translation,
            partOfSpeech: glossary[glossaryKey].partOfSpeech || 'unknown',
            example: glossary[glossaryKey].example || '',
            phonetic: glossary[glossaryKey].phonetic || ''
        });
        return;
    }
    setIsDictionaryLoading(true);
    setDictionaryData(null);
    try {
        const idx = index !== undefined ? index : currentIndex;
        const start = Math.max(0, idx - 10);
        const end = Math.min(wordsRef.current.length, idx + 10);
        const context = wordsRef.current.slice(start, end).join(' ');
        const result = await getDefinition(cleanWord, context, settings.sidebarLanguage || 'pt');
        setDictionaryData(result);
    } catch (err) { console.error(err); } finally { setIsDictionaryLoading(false); }
  };
  
  const handleDictionaryClose = () => {
    setDictionaryOpen(false);
    // Restore auto-scroll if it was enabled
    if (wasAutoScrollEnabledRef.current) setAutoScrollEnabled(true);
    // Restore audio if enabled
    if (settings.pauseAudioOnGlossary && wasPlayingRef.current) {
         if (settings.resumeFromSentenceStart) {
             // Use stored clicked index to find the sentence start
             const targetIndex = clickedWordIndexRef.current !== -1 ? clickedWordIndexRef.current : currentIndex;
             const { start } = getSentenceRange(wordsRef.current, targetIndex);
             setCurrentIndex(start);
             setIsPlaying(true);
             shouldPlayRef.current = true;
             speakText(start);
         } else {
             togglePlay();
         }
    }
    clickedWordIndexRef.current = -1; // Reset
  }

  // ... (Dictionary handlers unchanged) ...
  const handleRegenerateDefinition = async (lang: 'en' | 'pt') => {
      if (!selectedWord) return;
      setIsDictionaryLoading(true);
      try {
        const start = Math.max(0, currentIndex - 10);
        const end = Math.min(wordsRef.current.length, currentIndex + 10);
        const context = wordsRef.current.slice(start, end).join(' ');
        const cleanWord = selectedWord.replace(/[^\w\s'-]/g, '');
        const result = await getDefinition(cleanWord, context, lang);
        setDictionaryData(result);
      } catch (err) { console.error(err); } finally { setIsDictionaryLoading(false); }
  }

  const handleWordClick = async (index: number, e: React.MouseEvent) => {
      if (e.button === 1) { e.preventDefault(); openDictionaryForWord(wordsRef.current[index], index); }
      else if (e.button === 0) {
          if (window.getSelection()?.toString().length) return;
          setBrowserWindowStart(null); // Clear browse mode on click
          setCurrentIndex(index);
          if (mode === 'scroll') { setAutoScrollEnabled(true); setRecenterDirection(null); }
          setIsPlaying(true);
          shouldPlayRef.current = true;
          speakText(index);
      }
  };
  const preventMiddleClickScroll = (e: React.MouseEvent) => { if (e.button === 1) e.preventDefault(); };

  const handleToggleHighlight = (definition: string, style?: Partial<GlossaryItem>) => {
      if (!selectedWord || !dictionaryData) return;
      const cleanKey = selectedWord.replace(/[^\w\s'-]/g, '').toLowerCase();
      if (glossary[cleanKey]) onUpdateGlossary(cleanKey, 'remove');
      else onUpdateGlossary({
              word: cleanKey, definition: definition || dictionaryData.definition, translation: dictionaryData.translation,
              partOfSpeech: dictionaryData.partOfSpeech, example: dictionaryData.example, phonetic: dictionaryData.phonetic,
              createdAt: Date.now(), ...style
          }, 'add');
  };
  const handleUpdateDefinition = (newDef: string, style?: Partial<GlossaryItem>, newTranslation?: string) => {
      if (!selectedWord || !dictionaryData) return;
      const cleanKey = selectedWord.replace(/[^\w\s'-]/g, '').toLowerCase();
      const existing = glossary[cleanKey] || {};

      onUpdateGlossary({
          // Default fallback data
          partOfSpeech: dictionaryData.partOfSpeech,
          example: dictionaryData.example, 
          phonetic: dictionaryData.phonetic,
          
          // Spread existing first to maintain potential other properties
          ...existing,

          // Overwrite with updates
          word: cleanKey, 
          definition: newDef, 
          translation: newTranslation || existing.translation || dictionaryData.translation, // Use new, or existing, or original
          createdAt: Date.now(), 
          ...style 
      }, 'add');
  };
  const handleUpdateSidebarSettings = (updates: Partial<AppSettings>) => { onSettingsChange({ ...settings, ...updates }); };

  const updateVisibleRange = useCallback(() => {
      if (mode === 'paginated') {
          if (!paginatedContainerRef.current || !paginatedContentRef.current) return;
          const containerWidth = paginatedContainerRef.current.clientWidth;
          const visibleStart = paginatedOffset;
          const visibleEnd = paginatedOffset + containerWidth;
          const spans = paginatedContentRef.current.querySelectorAll('span[data-index]');
          let minIdx = Number.MAX_SAFE_INTEGER;
          let maxIdx = -1;
          for (let i = 0; i < spans.length; i++) {
              const el = spans[i] as HTMLElement;
              const left = el.offsetLeft;
              if (left >= visibleStart - 10 && left <= visibleEnd + 10) {
                  const idx = parseInt(el.getAttribute('data-index') || '0', 10);
                  if (idx < minIdx) minIdx = idx;
                  if (idx > maxIdx) maxIdx = idx;
              }
          }
          if (maxIdx >= 0) setVisibleRange({ start: minIdx, end: maxIdx });
          return;
      }
      if (!readerContainerRef.current) return;
      const container = readerContainerRef.current;
      const rect = container.getBoundingClientRect();
      const xPositions = [rect.left + 50, rect.left + rect.width / 2, rect.right - 50];
      let minIdx = Number.MAX_SAFE_INTEGER;
      let maxIdx = -1;
      let foundAny = false;
      for (let y = rect.top + 40; y < rect.bottom - 40; y += 20) {
          for (const x of xPositions) {
            const el = document.elementFromPoint(x, y);
            if (el && el.hasAttribute('data-index')) {
                const idx = parseInt(el.getAttribute('data-index') || '0', 10);
                if (idx < minIdx) minIdx = idx;
                if (idx > maxIdx) maxIdx = idx;
                foundAny = true;
            }
          }
      }
      if (mode === 'scroll' && activeWordRef.current) {
          const activeRect = activeWordRef.current.getBoundingClientRect();
          const isVisible = (activeRect.top >= rect.top && activeRect.bottom <= rect.bottom);
          if (!isVisible) {
              if (activeRect.top < rect.top) setRecenterDirection('up');
              else setRecenterDirection('down');
          } else setRecenterDirection(null);
      }
      if (!foundAny) return; 
      const SAFETY_BUFFER = 50; 
      setVisibleRange({ start: Math.max(0, minIdx - SAFETY_BUFFER), end: maxIdx + SAFETY_BUFFER });
  }, [mode, paginatedOffset]);

  const handleScroll = () => {
      const now = Date.now();
      if (now - lastScrollTimeRef.current > 100) { updateVisibleRange(); lastScrollTimeRef.current = now; }
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = window.setTimeout(updateVisibleRange, 150);
  };
  useEffect(() => {
     if (mode === 'paginated') { const t = setTimeout(updateVisibleRange, 50); return () => clearTimeout(t); }
  }, [paginatedOffset, mode, updateVisibleRange]);
  useEffect(() => { if (mode === 'scroll') setTimeout(updateVisibleRange, 500); }, [updateVisibleRange, normalWindowStart, mode]);

  // Compute all book items only when glossary or book changes, separate from scroll logic
  const allBookGlossaryItems = useMemo(() => {
      if (!settings.sidebarShowAllDefinitions) return [];
      const uniqueItems = new Map<string, GlossaryItem>();
      // Iterate through the entire book's tokens
      for (let i = 0; i < wordsRef.current.length; i++) {
          const word = wordsRef.current[i];
          if (!word) continue;
          const cleanKey = word.toLowerCase().replace(/[^\w'-]/g, '');
          if (cleanKey && glossary[cleanKey] && !uniqueItems.has(cleanKey)) {
              uniqueItems.set(cleanKey, glossary[cleanKey]);
          }
      }
      return Array.from(uniqueItems.values());
  }, [glossary, settings.sidebarShowAllDefinitions, wordsRef.current]);

  const visibleSidebarItems = useMemo(() => {
      // If showing all, simply return the pre-computed list
      if (settings.sidebarShowAllDefinitions) {
          return allBookGlossaryItems;
      }

      // If showing only visible, compute based on visible range (depends on scroll)
      const uniqueItems = new Map<string, GlossaryItem>();
      const start = Math.max(0, visibleRange.start);
      const end = Math.min(wordsRef.current.length, visibleRange.end + 1);
      for (let i = start; i < end; i++) {
          const word = wordsRef.current[i];
          if (!word) continue;
          const cleanKey = word.toLowerCase().replace(/[^\w'-]/g, '');
          if (cleanKey && glossary[cleanKey]) uniqueItems.set(cleanKey, glossary[cleanKey]);
      }
      return Array.from(uniqueItems.values());
  }, [visibleRange, glossary, settings.sidebarShowAllDefinitions, allBookGlossaryItems]);

  const renderSpritz = () => {
    // USE VISUAL INDEX for rendering
    const word = wordsRef.current[Math.floor(visualIndex)] || '';
    const pivot = Math.floor((word.length + 1) / 2) - 1;
    const pre = word.slice(0, pivot);
    const center = word[pivot] || '';
    const post = word.slice(pivot + 1);
    const theme = THEMES[settings.theme];
    const highContrastText = settings.theme === 'light' ? 'text-slate-900' : 'text-white';
    const ghostTextColor = settings.theme === 'light' ? 'text-slate-400' : 'text-slate-500';
    let prevWord = '';
    let nextWord = '';
    if (settings.showGhostWords) {
        let i = Math.floor(visualIndex) - 1;
        while(i >= 0 && (!wordsRef.current[i] || wordsRef.current[i] === '\n')) i--;
        prevWord = wordsRef.current[i] || '';
        let j = Math.floor(visualIndex) + 1;
        while(j < wordsRef.current.length && (!wordsRef.current[j] || wordsRef.current[j] === '\n')) j++;
        nextWord = wordsRef.current[j] || '';
    }
    const isVertical = settings.spritzGhostLayout === 'vertical';
    const ghostHeight = settings.spritzFontSize * 1.5;
    const ghostOpacity = settings.spritzGhostOpacity ?? 0.5;
    
    const VerticalGhost = ({ w }: { w: string }) => (
        <div className={`flex items-center justify-center select-none ${ghostTextColor} font-mono overflow-hidden whitespace-nowrap transition-all`}
            style={{ fontSize: `${settings.spritzFontSize}px`, height: `${ghostHeight}px`, opacity: ghostOpacity }}>{w || '\u00A0'}</div>
    );
    return (
      <div className="flex flex-col items-center justify-center h-full w-full max-w-4xl mx-auto px-4 pb-20">
        <div className="flex flex-col items-center w-full">
            {settings.showGhostWords && isVertical && <VerticalGhost w={prevWord} />}
            <div className="flex items-baseline gap-3 w-full justify-center my-1">
                <div className={`relative rounded-xl border-y-2 border-slate-300 w-full max-w-lg flex flex-col justify-center items-center ${theme.bg}`} style={{ height: `${settings.spritzFontSize * 2.5}px` }}>
                    <div className="absolute top-0 left-1/2 w-0.5 bg-slate-300 transform -translate-x-1/2 h-2.5"></div>
                    <div className="absolute bottom-0 left-1/2 w-0.5 bg-slate-300 transform -translate-x-1/2 h-2.5"></div>
                    <div className="flex items-baseline w-full justify-center font-mono leading-none select-none relative" style={{ fontSize: `${settings.spritzFontSize}px` }}>
                        <div className="flex-1 w-0 flex justify-end overflow-visible">
                            <span className="whitespace-nowrap flex items-baseline">
                                {settings.showGhostWords && !isVertical && prevWord && (<span className={`${ghostTextColor} font-light mr-[1ch]`} style={{ opacity: ghostOpacity }}>{prevWord}</span>)}
                                <span className={highContrastText}>{pre}</span>
                            </span>
                        </div>
                        <span className="text-red-500 font-bold text-center w-auto mx-0 flex-none z-10">{center}</span>
                        <div className="flex-1 w-0 flex justify-start overflow-visible">
                            <span className="whitespace-nowrap flex items-baseline">
                                <span className={highContrastText}>{post}</span>
                                {settings.showGhostWords && !isVertical && nextWord && (<span className={`${ghostTextColor} font-light ml-[1ch]`} style={{ opacity: ghostOpacity }}>{nextWord}</span>)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            {settings.showGhostWords && isVertical && <VerticalGhost w={nextWord} />}
        </div>
      </div>
    );
  };

  const renderTikTok = () => {
      // USE VISUAL INDEX
      const currentVisual = Math.floor(visualIndex);
      const renderWord = (index: number, isRelative = false) => {
          const word = wordsRef.current[index];
          if (!word) return null;
          const seed = index;
          const rand1 = seededRandom(seed * 1.1);
          const rand2 = seededRandom(seed * 2.2);
          const rand3 = seededRandom(seed * 3.3);
          const rand4 = seededRandom(seed * 4.4);
          
          // Extended Palette
          const colors = [
              '#FF0050', '#00F2EA', '#FE2C55', '#25F4EE', '#FFFFFF', '#FFD700', '#32CD32', 
              '#FF00FF', '#FFA500', '#8A2BE2', '#00FF00', '#00FFFF'
          ];
          const color = colors[Math.floor(rand1 * colors.length)];
          const dynamicSize = 1.5 + (rand2 * 2.5);
          const textClass = settings.tiktokAllCaps ? 'uppercase' : '';

          if (settings.tiktokNoOverlap) {
              return (
                  <span 
                    key={index}
                    className={`inline-block mx-2 mb-2 animate-in zoom-in-50 fade-in duration-100 origin-bottom-left ${textClass}`}
                    style={{
                        fontSize: `${dynamicSize}rem`,
                        lineHeight: '1',
                        color: color,
                        fontFamily: '"Impact", "Arial Black", sans-serif',
                        textShadow: '2px 2px 0px rgba(0,0,0,0.5)',
                        WebkitTextStroke: '1px black',
                    }}
                  >
                      {word}
                  </span>
              )
          }

          const fontSize = settings.spritzFontSize * 2;
          const scale = 0.8 + (rand2 * 0.7); 
          const rotate = -15 + (rand3 * 30); 
          const spreadX = settings.tiktokBuildUp ? 150 : 100;
          const spreadY = settings.tiktokBuildUp ? 100 : 60;
          const xOffset = -spreadX/2 + (rand4 * spreadX);
          const yOffset = -spreadY/2 + (rand1 * spreadY);
          return (
             <div
                key={index}
                className={`absolute font-black text-center tracking-tighter animate-in zoom-in-50 duration-200 ${textClass}`}
                style={{
                    fontSize: `${fontSize}px`,
                    color: color,
                    transform: `translate(${xOffset}px, ${yOffset}px) rotate(${rotate}deg) scale(${scale})`,
                    WebkitTextStroke: '2px black',
                    textShadow: '3px 3px 0px rgba(0,0,0,0.5)',
                    fontFamily: '"Impact", "Arial Black", sans-serif',
                    zIndex: index
                }}
             >
                 {word}
             </div>
          );
      };
      
      // DRAG LOGIC
      const handleMouseDown = (e: React.MouseEvent) => {
          setTiktokDragState(prev => ({ ...prev, isDragging: true, startX: e.clientX, startY: e.clientY }));
      };
      
      const handleMouseMove = (e: React.MouseEvent) => {
          if (!tiktokDragState.isDragging) return;
          const dx = e.clientX - tiktokDragState.startX;
          const dy = e.clientY - tiktokDragState.startY;
          setTiktokDragState(prev => ({ 
              ...prev, 
              offsetX: prev.offsetX + dx, 
              offsetY: prev.offsetY + dy, 
              startX: e.clientX, 
              startY: e.clientY 
          }));
      };
      
      const handleMouseUp = () => {
          if (tiktokDragState.isDragging) {
              setTiktokDragState(prev => ({ ...prev, isDragging: false }));
              // Save position to settings
              onSettingsChange({ ...settings, tiktokCustomPosition: { x: tiktokDragState.offsetX, y: tiktokDragState.offsetY } });
          }
      };

      if (settings.tiktokBuildUp) {
           const maxCount = settings.tiktokWordCount || 3;
           let chunkStart = currentVisual;
           if (settings.tiktokCountMode === 'exact') chunkStart = currentVisual - (currentVisual % maxCount);
           else {
               let anchor = currentVisual;
               let dist = 0;
               while (anchor > 0 && dist < 50) {
                   const w = wordsRef.current[anchor];
                   if (/[.!?]$/.test(w) || w === '\n') break; 
                   anchor--;
                   dist++;
               }
               const sentenceStart = anchor === 0 ? 0 : anchor + 1;
               const offsetInSentence = Math.max(0, currentVisual - sentenceStart);
               chunkStart = sentenceStart + Math.floor(offsetInSentence / maxCount) * maxCount;
           }
           
           if (chunkStart > currentVisual) chunkStart = currentVisual;
           
           // If "Show Whole Chunk", force rendering up to the end of the calculated chunk
           let renderEndIndex = currentVisual;
           if (settings.tiktokShowWholeChunk) {
               renderEndIndex = chunkStart + maxCount - 1;
               if (settings.tiktokCountMode === 'range') {
                   // Find next sentence end
                   let endAnchor = chunkStart;
                   let count = 0;
                   while (endAnchor < wordsRef.current.length && count < maxCount) {
                       const w = wordsRef.current[endAnchor];
                       if (/[.!?]$/.test(w) || w === '\n') {
                           renderEndIndex = endAnchor;
                           break;
                       }
                       renderEndIndex = endAnchor;
                       endAnchor++;
                       count++;
                   }
               }
               // Cap at EOF
               if (renderEndIndex >= wordsRef.current.length) renderEndIndex = wordsRef.current.length - 1;
           }

           const wordsToShow = [];
           if (settings.tiktokNoOverlap) {
               const wordsInChunk = [];
               for (let i = chunkStart; i <= renderEndIndex; i++) {
                   wordsInChunk.push(renderWord(i));
               }
               
               const wordsPerLine = settings.tiktokWordsPerLine || 4; 
               let currentRow: React.ReactNode[] = [];
               
               wordsInChunk.forEach((w, idx) => {
                   currentRow.push(w);
                   if (currentRow.length === wordsPerLine) {
                       wordsToShow.push(
                           <div key={`row-${idx}`} className={`flex flex-wrap ${settings.tiktokAlign === 'left' ? 'justify-start' : 'justify-center'} items-end w-full mb-4`}>
                               {currentRow}
                           </div>
                       );
                       currentRow = [];
                   }
               });
               if (currentRow.length > 0) {
                    wordsToShow.push(
                       <div key="row-last" className={`flex flex-wrap ${settings.tiktokAlign === 'left' ? 'justify-start' : 'justify-center'} items-end w-full mb-4`}>
                           {currentRow}
                       </div>
                    );
               }
           } else {
               for (let i = chunkStart; i <= renderEndIndex; i++) wordsToShow.push(renderWord(i));
           }

           // Vertical Alignment Class
           let justifyClass = 'justify-center'; // Default center
           if (settings.tiktokVerticalAlign === 'top') justifyClass = 'justify-start pt-20';
           else if (settings.tiktokVerticalAlign === 'bottom') justifyClass = 'justify-end pb-20';

           return (
                <div 
                    className="flex flex-col items-center h-full w-full overflow-hidden bg-black text-white relative select-none cursor-move"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-900 to-black pointer-events-none"></div>
                    
                    {/* Draggable Container Layer */}
                    <div 
                        className={`relative w-full h-full p-10 flex flex-col items-center ${justifyClass}`}
                        style={{ transform: `translate(${tiktokDragState.offsetX}px, ${tiktokDragState.offsetY}px)` }}
                    >
                        {settings.tiktokNoOverlap ? (
                            // ALIGNED MODE: Block centered, text aligned as per setting
                            <div className={`w-full max-w-6xl ${settings.tiktokAlign === 'left' ? 'text-left flex items-start flex-col' : 'text-center flex items-center flex-col'}`}>
                                {wordsToShow}
                            </div>
                        ) : (
                            // SCATTER MODE
                            <div className="flex items-center justify-center w-full h-full relative">
                                {wordsToShow}
                            </div>
                        )}
                    </div>
                </div>
           )
      } else {
          return (
            <div className="flex items-center justify-center h-full w-full overflow-hidden bg-black text-white relative select-none">
                <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-900 to-black pointer-events-none"></div>
                <div className="relative flex items-center justify-center w-[80%] h-[60%]">
                     {renderWord(currentVisual)}
                </div>
            </div>
          );
      }
  };

  const renderContent = (isPaginated = false) => {
      // ... (Content rendering unchanged) ...
      const theme = THEMES[settings.theme];
      let start = 0;
      let end = wordsRef.current.length;
      if (isPaginated) { start = activePaginatedWindow.start; end = activePaginatedWindow.end; } 
      else { 
          // Use renderWindowStart which respects Browser Mode
          start = renderWindowStart; 
          end = Math.min(wordsRef.current.length, renderWindowStart + 3000); 
      }
      const visibleWords = wordsRef.current.slice(start, end);
      const { start: sentenceStart, end: sentenceEnd } = getSentenceRange(wordsRef.current, Math.floor(visualIndex));

      const floorIndex = Math.floor(visualIndex);

      return (
          <div className={`${settings.textAlignment === 'justify' ? 'text-justify' : 'text-left'}`} style={{ hyphens: 'auto', wordBreak: 'break-word' }}>
            {visibleWords.map((word, relIndex) => {
                const absIndex = start + relIndex;
                const isNewLine = word === '\n';
                
                // USE VISUAL INDEX for highlight
                let isActive = false;
                if (settings.highlightScope === 'sentence') {
                     isActive = absIndex >= sentenceStart && absIndex <= sentenceEnd;
                } else {
                     // Word Mode with Window Size
                     const windowSize = settings.highlightWindowSize || 1;
                     isActive = absIndex >= floorIndex && absIndex < floorIndex + windowSize;
                }

                // Show subtle sentence highlight only if we are in 'word' mode
                const isSentence = settings.highlightScope === 'word' && (absIndex >= sentenceStart && absIndex <= sentenceEnd);
                
                const cleanKey = word.toLowerCase().replace(/[^\w'-]/g, '');
                const glossaryItem = cleanKey ? glossary[cleanKey] : undefined;
                if (isNewLine) return <div key={absIndex} className="h-6 w-full" />;
                const glossaryClass = glossaryItem ? getHighlightClass(glossaryItem, settings.theme, settings, false) : '';
                let finalClass = 'hover:bg-black/5';
                
                if (isActive) {
                    finalClass = theme.highlight;
                } else if (glossaryClass) {
                    finalClass = glossaryClass;
                } else if (isSentence) {
                    finalClass = theme.sentenceHighlight;
                }

                // Check for Chapter Header
                const chapterTitle = chapterMap.get(absIndex);
                
                const content = (
                    <span
                        key={absIndex}
                        ref={absIndex === floorIndex ? activeWordRef : null} // Keep ref on the exact current word for auto-scroll
                        data-index={absIndex}
                        onMouseDown={(e) => { preventMiddleClickScroll(e); handleWordClick(absIndex, e); }}
                        className={`inline cursor-pointer select-text px-0.5 rounded-sm ${finalClass}`}
                    >
                        {word}{' '}
                    </span>
                );

                if (chapterTitle) {
                    return (
                        <React.Fragment key={`frag-${absIndex}`}>
                             <div className="w-full py-16 flex flex-col items-center justify-center text-center break-inside-avoid">
                                 <div className={`w-32 h-px mb-6 opacity-30 ${theme.theme === 'dark' ? 'bg-white' : 'bg-slate-900'}`}></div>
                                 <h2 className={`text-2xl md:text-3xl font-serif font-bold tracking-wide leading-tight px-8 ${theme.text}`}>{chapterTitle}</h2>
                                 <div className={`w-32 h-px mt-6 opacity-30 ${theme.theme === 'dark' ? 'bg-white' : 'bg-slate-900'}`}></div>
                             </div>
                             {content}
                        </React.Fragment>
                    );
                }

                return content;
            })}
          </div>
      );
  };
  
  // ... (renderScroll and renderPaginated unchanged) ...
  const renderScroll = () => {
    const theme = THEMES[settings.theme];
    return (
      <div 
        ref={readerContainerRef}
        className={`h-full overflow-y-auto px-4 sm:px-8 py-8 ${theme.bg} ${theme.text}`}
        onScroll={() => handleScroll()}
        onWheel={handleUserInteraction}
        onTouchMove={handleUserInteraction}
        onTouchStart={handleUserInteraction}
        onMouseDown={handleUserInteraction}
      >
        <div 
            className={`mx-auto pb-32 transition-all duration-300 ease-in-out`}
            style={{ 
                maxWidth: settings.normalMaxWidth ? `${settings.normalMaxWidth}px` : '800px',
                fontSize: `${activeFontSize}px`,
                fontFamily: settings.normalFontFamily,
                textAlign: settings.textAlignment,
                fontWeight: settings.fontWeight,
                fontStyle: settings.fontStyle,
                lineHeight: settings.lineHeight
            }}
        >
          {renderWindowStart > 0 && <div className="h-20" />} 
          {renderContent(false)}
          {Math.min(wordsRef.current.length, renderWindowStart + 3000) < wordsRef.current.length && <div className="h-screen" />} 
        </div>
      </div>
    );
  };

  const renderPaginated = () => {
    const theme = THEMES[settings.theme];
    const gap = 40;
    const cols = settings.paginatedColumns || 1;
    const currentPageNum = Math.floor(paginatedOffset / (paginatedContainerRef.current?.clientWidth || 1000)) + 1;
    const marginClass = cols === 2 ? 'px-20' : 'px-16';

    return (
        <div className={`flex h-full w-full relative overflow-hidden ${theme.bg} ${theme.text} select-none`}>
            <div className="absolute left-0 top-0 bottom-0 w-16 z-20 cursor-pointer hover:bg-black/5 transition-colors flex items-center justify-center group" onClick={(e) => { e.stopPropagation(); changePage(-1); }}>
                <ChevronLeft className="w-8 h-8 opacity-0 group-hover:opacity-50" />
            </div>
            <div className={`flex-1 h-full relative mx-auto my-4 overflow-hidden flex flex-col ${marginClass}`} style={{ maxWidth: cols === 2 ? '1400px' : '800px', width: '100%', }} onWheel={handlePaginatedWheel}>
                 <div ref={paginatedContainerRef} className="w-full h-full relative overflow-hidden" style={{ paddingBottom: '3rem' }}>
                    <div 
                        ref={paginatedContentRef} 
                        className={`h-full ease-out ${paginatedTransition ? 'transition-transform duration-300' : ''}`}
                        style={{ 
                            transform: `translateX(-${paginatedOffset}px)`, 
                            columnCount: cols, 
                            columnGap: `${gap}px`, 
                            columnFill: 'auto', 
                            width: '100%', 
                            height: '100%', 
                            fontSize: `${activeFontSize}px`, 
                            fontFamily: settings.normalFontFamily, 
                            textAlign: 'justify', 
                            fontWeight: settings.fontWeight, 
                            fontStyle: settings.fontStyle, 
                            lineHeight: settings.lineHeight, 
                        }}
                    >
                        {renderContent(true)}
                    </div>
                 </div>
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-16 z-20 cursor-pointer hover:bg-black/5 transition-colors flex items-center justify-center group" onClick={(e) => { e.stopPropagation(); changePage(1); }}>
                <ChevronRight className="w-8 h-8 opacity-0 group-hover:opacity-50" />
            </div>
             {cols === 2 && (<div className={`absolute left-1/2 top-4 bottom-12 w-px border-r border-dashed opacity-20 pointer-events-none ${theme.uiBorder}`}></div>)}
             <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 text-xs opacity-50 font-mono pointer-events-none flex flex-col items-center z-20 ${theme.text}`}>
                 <span>Page {currentPageNum}</span>
                 <span className="text-[10px] opacity-70">{Math.round((currentIndex / (book.totalWords || 1)) * 100)}%</span>
             </div>
        </div>
    );
  };

  const theme = THEMES[settings.theme];
  // ... (Floating bar and layout logic unchanged) ...
  let floatingBg = '';
  let floatingText = '';
  const bgColor = settings.floatingBarColor || 'white';
  if (settings.floatingBarBg === 'opaque') {
      if (bgColor === 'white') floatingBg = 'bg-white shadow-xl border border-slate-200';
      else if (bgColor === 'dark') floatingBg = 'bg-zinc-900 shadow-xl border border-zinc-800';
      else if (bgColor === 'sepia') floatingBg = 'bg-[#f4ecd8] shadow-xl border border-[#d3c4a5]';
  } else if (settings.floatingBarBg === 'solid') {
      if (bgColor === 'white') floatingBg = 'bg-white shadow-lg border border-slate-200';
      else if (bgColor === 'dark') floatingBg = 'bg-zinc-900 shadow-lg border border-zinc-800';
      else if (bgColor === 'sepia') floatingBg = 'bg-[#f4ecd8] shadow-lg border border-[#d3c4a5]';
  } else { 
      if (bgColor === 'white') floatingBg = 'bg-white/80 backdrop-blur-md shadow-lg border border-white/20';
      else if (bgColor === 'dark') floatingBg = 'bg-black/80 backdrop-blur-md shadow-lg border border-white/10';
      else if (bgColor === 'sepia') floatingBg = 'bg-[#f4ecd8]/90 backdrop-blur-md shadow-lg border border-[#d3c4a5]/50';
  }
  if (bgColor === 'dark') floatingText = 'text-white';
  else if (bgColor === 'sepia') floatingText = 'text-[#5b4636]';
  else floatingText = 'text-slate-700';
  
  const elapsedSeconds = (currentIndex / activeWpm) * 60;
  const totalSeconds = (book.totalWords / activeWpm) * 60;
  const secondsLeft = ((book.totalWords - currentIndex) / activeWpm) * 60;
  const percentage = Math.round((currentIndex / book.totalWords) * 100);
  const currentVoice = availableVoices.find(v => v.voiceURI === voiceSettings.voiceURI) || availableVoices.find(v => v.name.includes('Emma'));
  const currentLangCode = currentVoice ? currentVoice.lang.split('-').pop()?.toUpperCase() : '??';
  const controlVisibilityClass = autoHideControls ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transform translate-y-4 group-hover:translate-y-0" : "opacity-100 translate-y-0";

  // Helper for recursive TOC
  const renderTocItems = (items: Chapter[], depth = 0, parentLimit = book.totalWords) => {
      return items.map((chapter, idx) => {
          // Determine the end boundary of this chapter
          // If there is a next sibling, it ends there.
          // If not, it ends at the parent's limit.
          const nextSiblingPos = items[idx + 1]?.position ?? parentLimit;
          
          const startsBefore = chapter.position <= currentIndex;
          const endsAfter = nextSiblingPos > currentIndex; 
          const isActiveRange = startsBefore && endsAfter;

          // Check children to see if a more specific child is active
          const firstChildPos = chapter.subchapters?.[0]?.position ?? Number.MAX_SAFE_INTEGER;
          const hasStartedChild = firstChildPos <= currentIndex;
          
          // It's the active *leaf* (or deepest node) if it's in range and no child has started covering the range yet.
          const isActive = isActiveRange && !hasStartedChild;

          return (
              <React.Fragment key={`${chapter.title}-${idx}`}>
                  <button 
                      data-toc-active={isActive ? "true" : undefined}
                      onClick={() => {
                          setPaginatedTransition(false); // Disable transition for jump

                          if (tocAutoPlay) {
                              setBrowserWindowStart(null); // Clear browse mode if auto-play is on
                              setCurrentIndex(chapter.position);
                              
                              // PRE-CALCULATE WINDOW for BOTH Modes
                              // This forces the virtualized window to update immediately.
                              setNormalWindowStart(Math.max(0, chapter.position - 200));

                              setIsPlaying(true);
                              shouldPlayRef.current = true;
                              window.speechSynthesis.cancel();
                              activeUtterancesRef.current.clear();
                              chunkQueueNextIndex.current = chapter.position;
                              setTimeout(() => speakText(chapter.position), 10);
                              
                              // Use pending jump state for robust scrolling/offset calculation
                              setPendingJumpIndex(chapter.position);
                              
                          } else {
                              // Browse Mode: Don't change currentIndex. Don't stop playing.
                              // Set the window to start at this chapter.
                              setBrowserWindowStart(Math.max(0, chapter.position - 50));
                              // Disable auto-scroll so the view doesn't snap back to the playing word
                              setAutoScrollEnabled(false);
                              
                              if (mode === 'paginated') {
                                 setPaginatedOffset(0); // Reset offset to start of new window
                                 setTimeout(() => setPaginatedTransition(true), 50);
                              } else {
                                  // Force scroll to top of container
                                  setTimeout(() => {
                                      if (readerContainerRef.current) {
                                          readerContainerRef.current.scrollTop = 0;
                                      }
                                  }, 100);
                              }
                          }
                          setTocOpen(false);
                      }}
                      className={`
                          w-full text-left py-2 px-3 rounded-lg hover:bg-black/5 text-sm transition-colors border-l-4
                          ${isActive 
                            ? 'font-bold bg-indigo-50 text-indigo-700 border-indigo-500' 
                            : `border-transparent ${theme.text} opacity-80`}
                      `}
                      style={{ paddingLeft: `${(depth * 16) + 12}px` }}
                  >
                      {chapter.title}
                  </button>
                  {chapter.subchapters && renderTocItems(chapter.subchapters, depth + 1, nextSiblingPos)}
              </React.Fragment>
          );
      });
  };

  return (
    <div className={`h-full flex flex-col relative ${theme.bg}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-1.5 border-b ${theme.uiBorder} ${theme.uiBg} shrink-0`}>
        <div className="flex items-center gap-3">
            <button onClick={onClose} className={`flex items-center justify-center p-1.5 rounded-full hover:bg-black/5 ${theme.icon}`}><ArrowLeft className="w-5 h-5" /></button>
            <div className="flex flex-col justify-center"><h2 className={`font-bold leading-none text-sm ${theme.text}`}>{book.title}</h2></div>
        </div>
        <div className="flex items-center gap-2">
            {book.chapters && book.chapters.length > 0 && (
                <button 
                    onClick={() => setTocOpen(!tocOpen)} 
                    className={`p-1.5 rounded-full hover:bg-black/5 ${tocOpen ? 'bg-indigo-100 text-indigo-600' : theme.icon}`} 
                    title="Table of Contents"
                >
                    <List className="w-5 h-5" />
                </button>
            )}
            {mode !== 'spritz' && mode !== 'wheel' && mode !== 'tiktok' && (
                <button onClick={() => handleUpdateSidebarSettings({ sidebarAlwaysOpen: !settings.sidebarAlwaysOpen })} className={`p-1.5 rounded-full hover:bg-black/5 ${settings.sidebarAlwaysOpen ? 'bg-indigo-100 text-indigo-600' : theme.icon}`} title={settings.sidebarAlwaysOpen ? "Close Sidebar" : "Keep Sidebar Open"}><Sidebar className="w-5 h-5" /></button>
            )}
            <button onClick={onOpenSettings} className={`p-1.5 rounded-full hover:bg-black/5 ${theme.icon}`}><Settings className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative flex">
          <div className="flex-1 h-full relative">
            {mode === 'spritz' ? renderSpritz() : mode === 'wheel' ? (
                <WheelDisplay 
                    words={memoizedWords}
                    currentIndex={visualIndex} // USE VISUAL INDEX
                    isPlaying={isPlaying}
                    wpm={activeWpm}
                    continuousMode={settings.wheelContinuousMode}
                    theme={theme}
                    fontSize={settings.spritzFontSize}
                    onIndexChange={handleWheelIndexChange}
                />
            ) : mode === 'tiktok' ? renderTikTok() : mode === 'paginated' ? renderPaginated() : renderScroll()}
            
            {/* Scroll Resume Button */}
            {mode === 'scroll' && (recenterDirection || (!autoScrollEnabled && isPlaying) || browserWindowStart !== null) && (
                <button onClick={scrollToActiveWord} className={`absolute left-1/2 transform -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full shadow-xl hover:bg-indigo-700 hover:scale-105 transition-all animate-in zoom-in-50 duration-200`} style={{ bottom: '8rem' }}>
                    {!autoScrollEnabled && isPlaying ? <ArrowDown className="w-5 h-5" /> : (recenterDirection === 'up' ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />)}
                    <span className="text-sm font-bold truncate max-w-[200px]">{browserWindowStart !== null ? 'Back to Reading' : (wordsRef.current[currentIndex] || 'Resume Auto-Scroll')}</span>
                </button>
            )}

            {/* Floating Controls */}
            <div className="fixed bottom-0 left-0 w-full h-32 flex items-end justify-center pb-6 z-20 group pointer-events-none">
                <div className={`flex items-end gap-3 pointer-events-auto transition-all duration-300 ${controlVisibilityClass}`} style={{ transform: !autoHideControls ? `scale(${settings.floatingBarScale ?? 1})` : `scale(${settings.floatingBarScale ?? 1}) ${controlVisibilityClass.includes('translate') ? '' : ''}` }}>
                    <button onClick={() => setAutoHideControls(!autoHideControls)} className={`w-12 h-12 rounded-full shadow-lg border flex items-center justify-center font-bold text-sm hover:scale-105 active:scale-95 transition-all ${floatingBg} ${floatingText}`} title={autoHideControls ? "Lock Controls Visible" : "Enable Auto-Hide"}>
                        {autoHideControls ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                    </button>
                    {/* ... (Existing control buttons) ... */}
                    <div className="relative">
                        {voiceMenuOpen && (
                            <div className="absolute bottom-full left-0 mb-3 w-72 max-h-80 flex flex-col bg-white rounded-xl shadow-xl border border-slate-200 z-30 animate-in slide-in-from-bottom-2 overflow-hidden text-slate-900">
                                {/* Voice list implementation unchanged */}
                                <div className="p-2 border-b border-slate-100 bg-white sticky top-0 z-10">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input type="text" placeholder="Search voices..." value={voiceSearch} onChange={(e) => setVoiceSearch(e.target.value)} className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-50 text-slate-900" autoFocus />
                                    </div>
                                </div>
                                <div className="overflow-y-auto p-1">
                                    {filteredVoices.map(v => (
                                        <button key={v.voiceURI} onClick={() => { onUpdateVoiceSettings({...voiceSettings, voiceURI: v.voiceURI}); setVoiceMenuOpen(false); }} className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50 flex items-center gap-3 ${currentVoice?.voiceURI === v.voiceURI ? 'bg-indigo-50' : ''}`}>
                                            <div onClick={(e) => { e.stopPropagation(); toggleFavorite(v.voiceURI); }} className={`p-1 rounded-full hover:bg-black/5 flex-shrink-0 ${voiceSettings.favorites.includes(v.voiceURI) ? 'text-yellow-400' : 'text-slate-300'}`}><Star className="w-4 h-4 fill-current" /></div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`truncate ${currentVoice?.voiceURI === v.voiceURI ? 'font-bold text-indigo-700' : 'text-slate-700'}`}>{v.name}</div>
                                                <div className="text-xs opacity-50 truncate text-slate-500">{v.lang}</div>
                                            </div>
                                        </button>
                                    ))}
                                    {filteredVoices.length === 0 && <div className="p-4 text-center text-xs text-slate-400">No voices found</div>}
                                </div>
                            </div>
                        )}
                        <button onClick={() => setVoiceMenuOpen(!voiceMenuOpen)} className={`w-12 h-12 rounded-full shadow-lg border flex items-center justify-center font-bold text-sm hover:scale-105 active:scale-95 transition-all ${floatingBg} ${floatingText}`} title="Change Voice">{currentLangCode || <Mic className="w-5 h-5" />}</button>
                    </div>

                    <div className={`flex items-center justify-between px-4 py-2 rounded-full ${floatingBg} ${floatingText} min-w-[300px]`}>
                        <button onClick={() => setStatLeftMode(m => m === 'elapsed' ? 'percent' : 'elapsed')} className={`w-20 text-xs font-bold text-center tabular-nums select-none hover:bg-black/5 rounded py-1 transition-colors ${floatingText}`}>{statLeftMode === 'elapsed' ? formatTimeSeconds(elapsedSeconds) : `${percentage}%`}</button>
                        <div className="flex items-center gap-3">
                            <button onClick={() => changePosition(-10)} className={`p-2 rounded-full hover:bg-black/5 transition-colors ${floatingText}`}><RotateCcw className="w-5 h-5" /></button>
                            <button onClick={togglePlay} className="w-12 h-12 flex items-center justify-center bg-indigo-600 text-white rounded-full shadow hover:bg-indigo-700 hover:scale-105 transition-all">{isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}</button>
                            <button onClick={() => changePosition(10)} className={`p-2 rounded-full hover:bg-black/5 transition-colors ${floatingText}`}><RotateCw className="w-5 h-5" /></button>
                        </div>
                        <button onClick={() => setStatRightMode(m => m === 'remaining' ? 'total' : 'remaining')} className={`w-20 text-xs font-bold text-center tabular-nums select-none hover:bg-black/5 rounded py-1 transition-colors ${floatingText}`}>{statRightMode === 'remaining' ? `-${formatTimeSeconds(secondsLeft)}` : formatTimeSeconds(totalSeconds)}</button>
                    </div>

                    <div className="relative">
                        {speedMenuOpen && (
                                <div className="absolute bottom-full right-0 mb-3 w-16 bg-white rounded-xl shadow-xl border border-slate-200 z-30 p-2 animate-in slide-in-from-bottom-2 flex flex-col items-center gap-2">
                                <div className="h-32 w-full flex justify-center py-2">
                                    <input type="range" min="0.5" max="3" step="0.1" value={voiceSettings.rate} onChange={(e) => onUpdateVoiceSettings({...voiceSettings, rate: parseFloat(e.target.value)})} className="h-full w-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 writing-mode-vertical" style={{ writingMode: 'vertical-lr', direction: 'rtl' }} />
                                </div>
                                <div className="space-y-1 w-full">
                                    {[1, 1.5, 2].map(speed => (
                                        <button key={speed} onClick={() => { onUpdateVoiceSettings({...voiceSettings, rate: speed}); setSpeedMenuOpen(false); }} className={`w-full text-left py-1 text-[10px] rounded hover:bg-slate-100 ${voiceSettings.rate === speed ? 'font-bold text-indigo-600' : 'text-slate-500'}`}>{speed}x</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button onClick={() => setSpeedMenuOpen(!speedMenuOpen)} className={`w-12 h-12 rounded-full shadow-lg border flex items-center justify-center font-bold text-sm hover:scale-105 active:scale-95 transition-all ${floatingBg} ${floatingText}`} title="Change Speed">{voiceSettings.rate}x</button>
                    </div>
                </div>
            </div>
          </div>

          {/* Sidebar (unchanged) */}
          {(mode !== 'spritz' && mode !== 'wheel' && mode !== 'tiktok' && (visibleSidebarItems.length > 0 || settings.sidebarAlwaysOpen)) && (
              <div className={`hidden lg:flex w-72 border-l ${theme.uiBorder} ${theme.uiBg} flex-col overflow-y-auto shrink-0 animate-in slide-in-from-right-4 duration-500 relative`}>
                  {/* ... Sidebar content ... */}
                   <div className={`p-4 flex items-center justify-between border-b ${theme.uiBorder}`}>
                       <span className={`font-bold text-xs uppercase tracking-wider opacity-50 ${theme.text}`}>On this page</span>
                       <div className="relative flex items-center gap-1">
                            <button onClick={() => handleUpdateSidebarSettings({ sidebarAlwaysOpen: !settings.sidebarAlwaysOpen })} className={`p-1.5 rounded transition-colors ${settings.sidebarAlwaysOpen ? 'bg-indigo-100 text-indigo-600' : `${theme.icon} hover:bg-black/10`}`} title="Always Keep Open"><Sidebar className="w-4 h-4" /></button>
                            <button onClick={() => setSidebarSettingsOpen(!sidebarSettingsOpen)} className={`p-1.5 rounded hover:bg-black/10 transition-colors ${theme.icon}`}><Settings className="w-4 h-4" /></button>
                            {sidebarSettingsOpen && (
                                <div className="absolute top-8 right-0 w-64 bg-white shadow-xl rounded-xl border border-slate-200 z-50 p-4 animate-in zoom-in-95 duration-100 text-slate-900">
                                    <div className="flex items-center justify-between mb-3"><h4 className="text-sm font-bold text-slate-800">Sidebar Config</h4><button onClick={() => setSidebarSettingsOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button></div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Language</label>
                                            <div className="flex bg-slate-100 rounded p-1">
                                                <button onClick={() => handleUpdateSidebarSettings({ sidebarLanguage: 'en' })} className={`flex-1 text-xs py-1 rounded ${settings.sidebarLanguage === 'en' ? 'bg-white shadow text-indigo-600 font-bold' : 'text-slate-500'}`}>English</button>
                                                <button onClick={() => handleUpdateSidebarSettings({ sidebarLanguage: 'pt' })} className={`flex-1 text-xs py-1 rounded ${settings.sidebarLanguage === 'pt' ? 'bg-white shadow text-indigo-600 font-bold' : 'text-slate-500'}`}>Português</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Font Size</label>
                                            <div className="flex items-center gap-2"><Type className="w-3 h-3 text-slate-400" /><input type="range" min="10" max="20" value={settings.sidebarFontSize || 14} onChange={(e) => handleUpdateSidebarSettings({ sidebarFontSize: parseInt(e.target.value) })} className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" /></div>
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-2 cursor-pointer mb-2 mt-2"><input type="checkbox" checked={settings.showGlossaryDefinitions ?? true} onChange={(e) => handleUpdateSidebarSettings({ showGlossaryDefinitions: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded" /><span className="text-xs text-slate-700">Show Definition Text</span></label>
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-2 cursor-pointer mb-2"><input type="checkbox" checked={settings.pauseAudioOnGlossary ?? true} onChange={(e) => handleUpdateSidebarSettings({ pauseAudioOnGlossary: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded" /><span className="text-xs text-slate-700">Pause Audio on Card</span></label>
                                        </div>
                                        {settings.pauseAudioOnGlossary && (
                                            <div>
                                                <label className="flex items-center gap-2 cursor-pointer mb-2 ml-4"><input type="checkbox" checked={settings.resumeFromSentenceStart ?? true} onChange={(e) => handleUpdateSidebarSettings({ resumeFromSentenceStart: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded" /><span className="text-xs text-slate-700">Resume from Sentence Start</span></label>
                                            </div>
                                        )}
                                        <div>
                                            <label className="flex items-center gap-2 cursor-pointer mb-2"><input type="checkbox" checked={settings.sidebarShowAllDefinitions ?? false} onChange={(e) => handleUpdateSidebarSettings({ sidebarShowAllDefinitions: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded" /><span className="text-xs text-slate-700">Show All Highlights</span></label>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Style</label>
                                            <label className="flex items-center gap-2 cursor-pointer mb-2"><input type="checkbox" checked={settings.sidebarMatchTextStyle} onChange={(e) => handleUpdateSidebarSettings({ sidebarMatchTextStyle: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded" /><span className="text-xs text-slate-700">Match Text Highlight</span></label>
                                            {!settings.sidebarMatchTextStyle && (<div className="flex gap-1 mt-2">{['none', 'yellow', 'green', 'blue', 'pink', 'purple'].map(color => (<button key={color} onClick={() => handleUpdateSidebarSettings({ sidebarCustomColor: color as any })} className={`w-5 h-5 rounded-full border ${color === 'none' ? 'bg-slate-200' : `bg-${color}-400`} ${settings.sidebarCustomColor === color ? 'ring-2 ring-indigo-500 ring-offset-1' : 'hover:scale-110'}`} title={color} />))}</div>)}
                                        </div>
                                    </div>
                                </div>
                            )}
                       </div>
                  </div>
                  <div className="p-3 space-y-3">
                      {visibleSidebarItems.length === 0 && settings.sidebarAlwaysOpen && (<div className={`text-center py-8 opacity-40 text-sm ${theme.text}`}><p>No glossary items visible on this page.</p></div>)}
                      {visibleSidebarItems.map(item => (
                          <div key={item.word} className={`relative group p-3 rounded-lg border bg-opacity-50 hover:bg-opacity-100 transition-all ${theme.bg} ${getHighlightClass(item, settings.theme, settings, true)}`}>
                              <div className="flex items-start justify-between mb-1">
                                  <div className="flex flex-col"><span className={`font-bold capitalize ${theme.text}`} style={{ fontSize: `${(settings.sidebarFontSize || 14) + 2}px` }}>{item.word} {item.translation && <span className={`opacity-80 font-normal ml-1 text-sm ${theme.theme === 'light' ? 'text-slate-800' : 'text-white'}`}>- {item.translation}</span>}</span><span className="text-[10px] opacity-70 uppercase border border-current px-1 rounded inline-block self-start mt-1">{item.partOfSpeech}</span></div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => onUpdateGlossary(item.word, 'remove')} className="p-1 bg-black/10 rounded-full hover:bg-black/20 transition-all text-current" title="Remove highlight"><Highlighter className="w-3 h-3" /></button>
                                      <button onClick={() => openDictionaryForWord(item.word, undefined, true)} className="p-1 bg-black/10 rounded-full hover:bg-black/20 transition-all" title="Edit definition or style"><Edit3 className="w-3 h-3" /></button>
                                  </div>
                              </div>
                              {settings.showGlossaryDefinitions && (
                                <p className={`opacity-90 leading-relaxed ${theme.text} line-clamp-3 font-sans not-italic no-underline font-normal mt-2`} style={{ fontSize: `${settings.sidebarFontSize || 14}px` }}>{item.definition}</p>
                              )}
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>

      {/* Table of Contents Modal */}
      {tocOpen && book.chapters && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex justify-center items-start pt-20" onClick={() => setTocOpen(false)}>
            <div 
                className={`w-full max-w-3xl max-h-[70vh] rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 border ${theme.uiBg} ${theme.uiBorder}`}
                onClick={e => e.stopPropagation()}
            >
                <div className={`p-4 border-b flex items-center justify-between ${theme.uiBorder} ${theme.bg}`}>
                    <h3 className={`font-bold text-lg flex items-center gap-2 ${theme.text}`}>
                        <List className="w-5 h-5" /> Table of Contents
                    </h3>
                    <div className="flex items-center gap-3">
                        <label className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${theme.text} opacity-80 hover:opacity-100`}>
                            <input 
                                type="checkbox" 
                                checked={tocAutoPlay} 
                                onChange={(e) => setTocAutoPlay(e.target.checked)}
                                className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer accent-indigo-600"
                            />
                            Auto-play
                        </label>
                        <div className={`h-4 w-px bg-current opacity-20 mx-2`}></div>
                        <button onClick={() => setTocOpen(false)} className={`p-1 rounded-full hover:bg-black/5 ${theme.icon}`}>
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto p-4 flex-1">
                    {renderTocItems(book.chapters)}
                </div>
            </div>
        </div>
      )}

      {dictionaryOpen && selectedWord && (
          <>
            <div 
                className="fixed inset-0 z-[75] bg-black/20 backdrop-blur-[1px]" 
                onClick={handleDictionaryClose} 
            />
            <DictionaryCard 
                word={selectedWord} 
                data={dictionaryData} 
                isLoading={isDictionaryLoading} 
                initialEditMode={dictionaryEditMode} 
                showDefinition={settings.showGlossaryDefinitions ?? true}
                onClose={handleDictionaryClose} 
                theme={theme} 
                glossaryItem={glossary[selectedWord.replace(/[^\w'-]/g, '').toLowerCase()]} 
                onToggleHighlight={handleToggleHighlight} 
                onUpdateDefinition={handleUpdateDefinition} 
                onRegenerate={handleRegenerateDefinition} 
                onToggleShowDefinition={(val) => handleUpdateSidebarSettings({ showGlossaryDefinitions: val })}
            />
          </>
      )}
    </div>
  );
}