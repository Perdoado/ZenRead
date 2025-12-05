

export interface GlossaryItem {
  word: string;
  definition: string;
  translation?: string; // New field for the translated word
  example?: string;
  phonetic?: string;
  partOfSpeech?: string;
  createdAt: number;
  // Styling
  highlightColor?: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  highlightBold?: boolean;
  highlightItalic?: boolean;
  highlightUnderline?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface Chapter {
  title: string;
  position: number; // Word index
  subchapters?: Chapter[];
}

export interface Book {
  id: string;
  title: string;
  type: 'txt' | 'epub';
  content: string; // The full text content
  cover?: string; // Base64 image data
  parentId: string | null; // Folder ID
  createdAt: number;
  lastPosition: number; // Index of the word
  lastRead: number; // Timestamp of when it was last opened/read
  totalWords: number;
  glossary?: Record<string, GlossaryItem>;
  chapters?: Chapter[];
}

export type SortField = 'createdAt' | 'lastRead' | 'title' | 'progress';
export type SortOrder = 'asc' | 'desc';
export type LibraryLayout = 'grid' | 'list';
export type ReadingMode = 'spritz' | 'scroll' | 'paginated' | 'wheel' | 'tiktok';

export interface AppSettings {
  // Global
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: string;
  uiScale: number; // Global UI Scale
  
  // Library Preferences
  libraryLayout: LibraryLayout;
  librarySortField: SortField;
  librarySortOrder: SortOrder;
  libraryCardSize: 'small' | 'medium' | 'large'; // New Setting

  // Spritz Specific
  spritzWpm: number;
  spritzFontSize: number;
  showGhostWords: boolean;
  spritzGhostLayout: 'vertical' | 'horizontal';
  spritzGhostOpacity: number;

  // Wheel Specific
  wheelContinuousMode: boolean;

  // TikTok / Viral Specific
  tiktokBuildUp: boolean;
  tiktokNoOverlap: boolean;
  tiktokWordCount: number; // Chunk size
  tiktokCountMode: 'exact' | 'range';
  tiktokAlign: 'center' | 'left';
  tiktokLayout: 'row' | 'column';
  tiktokWordsPerLine: number; // 0 for auto
  tiktokShowWholeChunk: boolean;
  tiktokVerticalAlign: 'top' | 'center' | 'bottom';
  tiktokCustomPosition: { x: number, y: number } | null;
  tiktokAllCaps: boolean;

  // Normal/Scroll Specific
  normalWpm: number;
  normalFontSize: number;
  normalFontFamily: string;
  normalViewMode: 'scroll' | 'page'; // Legacy or specific sub-setting
  normalMaxWidth: number; // Max width of text container in pixels
  wordsPerPage: number;
  textAlignment: 'left' | 'justify';
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  lineHeight: number;
  
  // Paginated Specific
  paginatedColumns: number; // 1 or 2

  // Auto-scroll settings
  autoScrollDuration: number; // ms
  autoScrollMode: 'line' | 'sentence' | 'paragraph' | 'page' | 'continuous';
  autoScrollTriggerMargin: number; // Number of words into the line before scrolling
  continuousScrollSpeed: number; // Pixels per frame (approx)

  // Audio Sync Settings
  audioTextDelay: number; // ms, positive means text leads audio
  highlightScope: 'word' | 'sentence'; // What to highlight during TTS
  highlightWindowSize: number; // Number of words to highlight if scope is 'word'

  // Visual Extras
  floatingBarOpacity: number; // 0.1 to 1
  floatingBarScale: number; // 0.5 to 1.5
  floatingBarBg: 'glass' | 'solid' | 'opaque';
  floatingBarColor: 'white' | 'dark' | 'sepia';
  floatingBarShowTimeRemaining: boolean;
  floatingBarShowTotalTime: boolean;

  // Sidebar Settings
  sidebarLanguage: 'en' | 'pt';
  sidebarFontSize: number;
  sidebarMatchTextStyle: boolean; // If true, mirrors the highlight style. If false, uses sidebar specific config
  sidebarCustomColor?: 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'none';
  sidebarAlwaysOpen: boolean;
  showGlossaryDefinitions: boolean; // New: Toggle definition visibility
  pauseAudioOnGlossary: boolean; // New: Pause audio when dictionary opens
  resumeFromSentenceStart: boolean; // New: Resume audio from start of sentence
  sidebarShowAllDefinitions: boolean; // New: Show all highlighted words or only visible ones
}

export interface VoiceSettings {
  normalEnabled: boolean;
  spritzEnabled: boolean;
  wheelEnabled: boolean;
  tiktokEnabled: boolean;
  voiceURI: string | null;
  pitch: number;
  rate: number;
  favorites: string[];
  repeatMode: 'off' | 'word' | 'phrase' | 'sentence';
}

export interface SpritzWord {
  word: string;
  pivot: number; // The index of the character to highlight
}

// Minimal type definition for the global ePub object loaded via CDN
declare global {
  var ePub: any;
}