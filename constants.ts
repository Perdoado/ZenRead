

















import { AppSettings, VoiceSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontFamily: 'Inter',
  uiScale: 1.1, // Default larger UI
  
  // Library Defaults
  libraryLayout: 'grid',
  librarySortField: 'lastRead', // Default sort by Last Read
  librarySortOrder: 'desc',
  libraryCardSize: 'small', // Default card size small

  // Spritz Defaults
  spritzWpm: 300,
  spritzFontSize: 32,
  showGhostWords: false,
  spritzGhostLayout: 'vertical',
  spritzGhostOpacity: 0.5,
  
  // Wheel Defaults
  wheelContinuousMode: false,

  // TikTok Defaults
  tiktokBuildUp: true,
  tiktokNoOverlap: false,
  tiktokWordCount: 3,
  tiktokCountMode: 'range', // Smart range by default
  tiktokAlign: 'center',
  tiktokLayout: 'row',
  tiktokWordsPerLine: 0, // Auto
  tiktokShowWholeChunk: false,
  tiktokVerticalAlign: 'center',
  tiktokCustomPosition: null,
  tiktokAllCaps: false,

  // Normal Defaults
  normalWpm: 200,
  normalFontSize: 18,
  normalFontFamily: 'Source Code Pro', // Updated default
  normalViewMode: 'scroll',
  normalMaxWidth: 650, // Updated default width constraint
  wordsPerPage: 150,
  textAlignment: 'justify',
  fontWeight: 'bold', // Updated default
  fontStyle: 'normal',
  lineHeight: 1.6, // Updated default from 2 to 1.6
  
  // Paginated Defaults
  paginatedColumns: 1,

  autoScrollDuration: 250, // ms
  autoScrollMode: 'continuous', // Ensure default is continuous
  autoScrollTriggerMargin: 2, // Default: scroll after the 2nd word (index 2 in 1-based count)
  continuousScrollSpeed: 1.0, // Default continuous speed
  
  // Audio Sync Defaults
  audioTextDelay: 0, // 0 ms delay by default
  highlightScope: 'word',
  highlightWindowSize: 1,

  // Floating Bar Defaults
  floatingBarOpacity: 0.9,
  floatingBarScale: 1,
  floatingBarBg: 'opaque', // Default to opaque
  floatingBarColor: 'dark', // Updated default to dark
  floatingBarShowTimeRemaining: true,
  floatingBarShowTotalTime: false,

  // Sidebar Defaults
  sidebarLanguage: 'pt', // Default to Portuguese
  sidebarFontSize: 14,
  sidebarMatchTextStyle: true,
  sidebarCustomColor: 'none',
  sidebarAlwaysOpen: false,
  showGlossaryDefinitions: true,
  pauseAudioOnGlossary: true, // Default to true
  resumeFromSentenceStart: true, // Default to true
  sidebarShowAllDefinitions: false, // Default to showing only visible
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  normalEnabled: true,
  spritzEnabled: true,
  wheelEnabled: true,
  tiktokEnabled: true,
  voiceURI: null,
  pitch: 1,
  rate: 2, // 2 is fast speed
  favorites: ['EmmaMultiLingual', 'Microsoft Emma Multilingual Online (Natural)'], // Added default favorites
  repeatMode: 'off',
};

export const THEMES = {
  light: {
    bg: 'bg-white',
    text: 'text-slate-900',
    uiBg: 'bg-white',
    uiBorder: 'border-slate-100',
    highlight: 'bg-indigo-100 text-indigo-900',
    sentenceHighlight: 'bg-slate-100 rounded', // Subtle grey for sentence
    glossaryHighlight: 'bg-yellow-200 text-slate-900',
    icon: 'text-slate-600',
    folderBg: 'bg-white border-slate-200',
    folderText: 'text-slate-700',
  },
  dark: {
    bg: 'bg-black', // Pitch black as per screenshot
    text: 'text-gray-300',
    uiBg: 'bg-zinc-900',
    uiBorder: 'border-zinc-800',
    highlight: 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30', // Highlight style
    sentenceHighlight: 'bg-zinc-800/80 rounded', // Subtle dark grey for sentence
    glossaryHighlight: 'bg-yellow-900/40 text-yellow-200 border-b border-yellow-700/50',
    icon: 'text-gray-400',
    folderBg: 'bg-zinc-800 border-zinc-700',
    folderText: 'text-gray-300',
  },
  sepia: {
    bg: 'bg-[#f4ecd8]',
    text: 'text-[#5b4636]',
    uiBg: 'bg-[#e9dec0]',
    uiBorder: 'border-[#d3c4a5]',
    highlight: 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30', // Changed to same as dark for better contrast
    sentenceHighlight: 'bg-[#e9dec0] rounded', // Subtle sepia for sentence
    glossaryHighlight: 'bg-yellow-200/50 text-[#4a3b2a]',
    icon: 'text-8c7b66',
    folderBg: 'bg-[#e9dec0] border-[#d3c4a5]',
    folderText: 'text-[#5b4636]',
  },
};