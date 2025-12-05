import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Upload, Trash2, FileText, BookOpen, Sparkles, Zap, AlertTriangle, Folder, Move, CheckSquare, SortAsc, SortDesc, Calendar, Grid, List, Plus, FolderPlus, X, Sun, Moon, Cloud, Scroll, Book, Disc, Activity, Crosshair, Search, ChevronDown, Percent, Clock, ArrowLeft } from 'lucide-react';
import { Book as BookType, ReadingMode, Folder as FolderType, SortField, SortOrder, LibraryLayout, AppSettings } from '../types';
import { parseFile } from '../services/parser';
import { saveBook, saveFolder, getFolders, moveItems, deleteItems } from '../services/storage';
import { summarizeText } from '../services/geminiService';
import { THEMES } from '../constants';

interface LibraryProps {
  books: BookType[];
  onBookSelect: (book: BookType, mode: ReadingMode) => void;
  onRefresh: () => void;
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

export const Library: React.FC<LibraryProps> = ({ 
  books, 
  onBookSelect, 
  onRefresh, 
  currentFolderId, 
  setCurrentFolderId,
  settings,
  onSettingsChange
}) => {
  const [folders, setFolders] = useState<FolderType[]>([]);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Sort Menu State
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  // Drag Selection State
  const [isDraggingSelect, setIsDraggingSelect] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, itemId: string, itemType: 'book' | 'folder' } | null>(null);

  // Modals
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{id: string, type: 'book'|'folder'} | null>(null);

  // Async States
  const [isUploading, setIsUploading] = useState(false);
  const [summary, setSummary] = useState<{ id: string, text: string } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<string | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Derived State
  const activeTheme = THEMES[settings.theme] || THEMES.dark;
  const layout = settings.libraryLayout;
  const sortField = settings.librarySortField;
  const sortOrder = settings.librarySortOrder;

  // Load Folders
  useEffect(() => {
    const init = async () => {
        const f = await getFolders();
        setFolders(f);
    };
    init();
  }, [books]); // Re-fetch folders when books change (triggered by onRefresh)

  // Clear selection when changing folders
  useEffect(() => {
      setSelectedIds(new Set());
      setLastSelectedId(null);
  }, [currentFolderId]);

  // Global click listener to close context menu
  useEffect(() => {
      const handleClick = () => {
          setContextMenu(null);
          setIsSortMenuOpen(false);
      };
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleLayoutChange = (l: LibraryLayout) => {
      onSettingsChange({ ...settings, libraryLayout: l });
  };

  const handleSortChange = (field: SortField) => {
      if (sortField === field) {
          const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
          onSettingsChange({ ...settings, librarySortOrder: newOrder });
      } else {
          onSettingsChange({ ...settings, librarySortField: field, librarySortOrder: field === 'title' ? 'asc' : 'desc' });
      }
      setIsSortMenuOpen(false);
  };

  const toggleTheme = () => {
      const order: ('light' | 'dark' | 'sepia')[] = ['light', 'dark', 'sepia'];
      const currentIdx = order.indexOf(settings.theme);
      const nextIdx = (currentIdx + 1) % order.length;
      onSettingsChange({ ...settings, theme: order[nextIdx] });
  };

  const getThemeIcon = () => {
      switch(settings.theme) {
          case 'light': return <Sun className="w-5 h-5" />;
          case 'dark': return <Moon className="w-5 h-5" />;
          case 'sepia': return <Cloud className="w-5 h-5" />;
      }
  };

  // --- Grid Class Logic ---
  const getGridClasses = () => {
      const size = settings.libraryCardSize || 'medium';
      
      switch(size) {
          case 'small':
              return 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3';
          case 'large':
              return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6';
          case 'medium':
          default:
              return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4';
      }
  }

  // --- Filtering & Sorting ---

  const currentItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    // 1. Filter by Folder and Search Query
    const folderItems = folders.filter(f => 
        f.parentId === currentFolderId && 
        (query === '' || f.name.toLowerCase().includes(query))
    );
    const bookItems = books.filter(b => 
        (b.parentId || null) === currentFolderId && 
        (query === '' || b.title.toLowerCase().includes(query))
    );

    // 2. Sort
    const sortFn = (a: any, b: any) => {
        let valA, valB;
        if (sortField === 'title') {
            valA = (a.title || a.name || '').toLowerCase();
            valB = (b.title || b.name || '').toLowerCase();
        } else if (sortField === 'lastRead') {
            // Priority: Last Read timestamp > Last Position > CreatedAt
            valA = (a.lastRead || 0) || (a.lastPosition ? a.createdAt : 0);
            valB = (b.lastRead || 0) || (b.lastPosition ? b.createdAt : 0);
        } else if (sortField === 'progress') {
             const progA = a.totalWords ? ((a.lastPosition || 0) / a.totalWords) : 0;
             const progB = b.totalWords ? ((b.lastPosition || 0) / b.totalWords) : 0;
             valA = progA;
             valB = progB;
        } else { // createdAt
            valA = a.createdAt;
            valB = b.createdAt;
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    };

    folderItems.sort(sortFn);
    bookItems.sort(sortFn);

    return { folders: folderItems, books: bookItems };
  }, [folders, books, currentFolderId, sortField, sortOrder, searchQuery]);

  // --- Actions ---

  const processFiles = async (files: FileList) => {
    setIsUploading(true);
    try {
        for (let i = 0; i < files.length; i++) {
            const newBook = await parseFile(files[i]);
            newBook.parentId = currentFolderId;
            await saveBook(newBook);
        }
        onRefresh();
    } catch (error) {
      console.error('Failed to parse file:', error);
      alert('Error parsing file(s).');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    await processFiles(e.target.files);
    e.target.value = '';
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await processFiles(e.dataTransfer.files);
    }
  };

  const handleCreateFolder = async () => {
      if (!newFolderName.trim()) return;
      const folder: FolderType = {
          id: `folder-${Date.now()}`,
          name: newFolderName,
          parentId: currentFolderId,
          createdAt: Date.now()
      };
      await saveFolder(folder);
      setNewFolderName('');
      setIsCreateFolderOpen(false);
      onRefresh();
  };

  const handleSelection = (id: string, ctrlKey: boolean, shiftKey: boolean) => {
      setSelectedIds(prev => {
          let next = new Set(prev);
          
          if (shiftKey && lastSelectedId) {
             const allItems = [...currentItems.folders, ...currentItems.books];
             const lastIdx = allItems.findIndex(i => i.id === lastSelectedId);
             const currIdx = allItems.findIndex(i => i.id === id);
             
             if (lastIdx !== -1 && currIdx !== -1) {
                 const start = Math.min(lastIdx, currIdx);
                 const end = Math.max(lastIdx, currIdx);
                 
                 if (!ctrlKey) next = new Set(); 

                 for(let i=start; i<=end; i++) {
                     next.add(allItems[i].id);
                 }
                 return next;
             }
          }

          if (ctrlKey) {
              if (next.has(id)) next.delete(id);
              else next.add(id);
          } else {
              // Standard click (no keys) -> select only this
              next = new Set([id]);
          }
          
          setLastSelectedId(id);
          return next;
      });
  };

  const toggleSelectAll = () => {
      const allIds = [...currentItems.folders.map(f => f.id), ...currentItems.books.map(b => b.id)];
      if (selectedIds.size === allIds.length && allIds.length > 0) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(allIds));
      }
  };

  const handleBatchDelete = async () => {
      setIsProcessingAction(true);
      try {
          const bookIds: string[] = itemToDelete 
            ? (itemToDelete.type === 'book' ? [itemToDelete.id] : [])
            : (Array.from(selectedIds) as string[]).filter(id => books.find(b => b.id === id));
            
          const folderIds: string[] = itemToDelete
            ? (itemToDelete.type === 'folder' ? [itemToDelete.id] : [])
            : (Array.from(selectedIds) as string[]).filter(id => folders.find(f => f.id === id));
          
          await deleteItems(bookIds, folderIds);
          setSelectedIds(new Set());
          setIsDeleteModalOpen(false);
          setItemToDelete(null);
          onRefresh();
      } catch (err) {
          console.error(err);
          alert('Failed to delete items');
      } finally {
          setIsProcessingAction(false);
      }
  };

  const handleBatchMove = async () => {
      setIsProcessingAction(true);
      try {
          const bookIds: string[] = (Array.from(selectedIds) as string[]).filter(id => books.find(b => b.id === id));
          const folderIds: string[] = (Array.from(selectedIds) as string[]).filter(id => folders.find(f => f.id === id));
          
          await moveItems(bookIds, folderIds, moveTargetFolderId);
          setSelectedIds(new Set());
          setIsMoveModalOpen(false);
          onRefresh();
      } catch (err) {
          console.error(err);
          alert('Failed to move items');
      } finally {
          setIsProcessingAction(false);
      }
  };

  // --- Drag Selection Logic ---
  
  const handleMouseDown = (e: React.MouseEvent) => {
      // 1. Ignore right clicks
      if (e.button !== 0) return;

      // 2. Identify Target
      const target = e.target as HTMLElement;
      
      // Ignore interactive elements
      if (target.closest('button') || target.closest('input')) return;

      // 3. Check if we clicked an Item (Folder/Book)
      if (target.closest('[data-item-id]')) {
          return;
      }

      // 4. Handle Background Click
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          if (target === containerRef.current || target.id === 'library-container') {
               setSelectedIds(new Set());
          }
          return;
      }

      // 5. Start Marquee (Only if modifiers pressed)
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      setIsDraggingSelect(true);
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top + (containerRef.current?.scrollTop || 0);

      setSelectionBox({ startX, startY, currentX: startX, currentY: startY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDraggingSelect || !selectionBox || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top + containerRef.current.scrollTop;
      
      setSelectionBox({ ...selectionBox, currentX, currentY });
  };

  const handleMouseUp = () => {
      if (!isDraggingSelect || !selectionBox) {
          setIsDraggingSelect(false);
          setSelectionBox(null);
          return;
      }

      const dist = Math.hypot(selectionBox.currentX - selectionBox.startX, selectionBox.currentY - selectionBox.startY);
      if (dist < 5) {
          setIsDraggingSelect(false);
          setSelectionBox(null);
          return;
      }

      const boxRect = {
          left: Math.min(selectionBox.startX, selectionBox.currentX),
          top: Math.min(selectionBox.startY, selectionBox.currentY),
          right: Math.max(selectionBox.startX, selectionBox.currentX),
          bottom: Math.max(selectionBox.startY, selectionBox.currentY)
      };

      const newSelected = new Set(selectedIds);

      const checkOverlap = (id: string) => {
          const el = itemRefs.current.get(id);
          if (el && containerRef.current) {
               const containerRect = containerRef.current.getBoundingClientRect();
               const elRect = el.getBoundingClientRect();
               
               const elRelative = {
                   left: elRect.left - containerRect.left,
                   top: elRect.top - containerRect.top + containerRef.current.scrollTop,
                   width: elRect.width,
                   height: elRect.height
               };
               
               if (
                   boxRect.left < elRelative.left + elRelative.width &&
                   boxRect.right > elRelative.left &&
                   boxRect.top < elRelative.top + elRelative.height &&
                   boxRect.bottom > elRelative.top
               ) {
                   newSelected.add(id);
               }
          }
      };

      currentItems.folders.forEach(f => checkOverlap(f.id));
      currentItems.books.forEach(b => checkOverlap(b.id));

      setSelectedIds(newSelected);
      setIsDraggingSelect(false);
      setSelectionBox(null);
  };

  // --- Context Menu Logic ---

  const handleContextMenu = (e: React.MouseEvent, id: string, type: 'book' | 'folder') => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!selectedIds.has(id)) {
           if (e.ctrlKey || e.metaKey) {
               handleSelection(id, true, false);
           } else {
               setSelectedIds(new Set([id]));
           }
      }

      setContextMenu({ x: e.clientX, y: e.clientY, itemId: id, itemType: type });
  };

  // --- Drag and Drop (Items) ---

  const handleDragStart = (e: React.DragEvent, id: string, type: 'book' | 'folder') => {
      e.stopPropagation();
      e.dataTransfer.setData('application/json', JSON.stringify({ id, type }));
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
           await handleFileDrop(e);
           return;
      }

      try {
          const data = JSON.parse(e.dataTransfer.getData('application/json'));
          if (data && data.id && data.type) {
              if (data.id === targetFolderId) return; 
              
              const bookIds: string[] = data.type === 'book' ? [String(data.id)] : [];
              const folderIds: string[] = data.type === 'folder' ? [String(data.id)] : [];
              
              await moveItems(bookIds, folderIds, targetFolderId);
              onRefresh();
          }
      } catch (err) {
      }
  };

  const handleSummarize = async (e: React.MouseEvent, book: BookType) => {
      e.preventDefault();
      e.stopPropagation();
      setLoadingSummary(book.id);
      setSummary(null);
      try {
          const text = await summarizeText(book.content);
          setSummary({ id: book.id, text });
      } catch (error) {
          alert("Failed to generate summary. Check API Key.");
      } finally {
          setLoadingSummary(null);
      }
  };

  // --- Render Helpers ---

  const getBreadcrumbs = () => {
      const crumbs = [];
      let curr = folders.find(f => f.id === currentFolderId);
      while (curr) {
          crumbs.unshift(curr);
          curr = folders.find(f => f.id === curr?.parentId);
      }
      return (
          <div className="flex items-center gap-2 text-sm overflow-x-auto whitespace-nowrap pb-2 text-inherit opacity-70">
              <button 
                onClick={() => setCurrentFolderId(null)}
                className={`hover:opacity-100 transition-opacity ${!currentFolderId ? 'font-bold' : ''}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, null)} 
              >
                  Home
              </button>
              {crumbs.map((f, i) => (
                  <React.Fragment key={f.id}>
                      <span className="opacity-40">/</span>
                      <button 
                        onClick={() => setCurrentFolderId(f.id)}
                        className={`hover:opacity-100 transition-opacity ${i === crumbs.length - 1 ? 'font-bold' : ''}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, f.id)}
                      >
                          {f.name}
                      </button>
                  </React.Fragment>
              ))}
          </div>
      );
  };

  const renderItem = (item: BookType | FolderType, type: 'book' | 'folder') => {
      const isSelected = selectedIds.has(item.id);
      
      const commonClickProps = {
          onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              if (e.ctrlKey || e.metaKey) {
                  handleSelection(item.id, true, false);
              } else if (e.shiftKey) {
                  handleSelection(item.id, false, true);
              } else {
                  if (type === 'folder') setCurrentFolderId(item.id);
                  else onBookSelect(item as BookType, 'scroll'); 
              }
          }
      };

      const Content = () => {
        // Folder in Grid Mode
        if (type === 'folder' && layout === 'grid') {
            return (
                <div 
                    ref={el => { if (el) itemRefs.current.set(item.id, el); else itemRefs.current.delete(item.id); }}
                    data-item-id={item.id}
                    {...commonClickProps}
                    onContextMenu={(e) => handleContextMenu(e, item.id, 'folder')}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, item.id)}
                    className={`
                        group relative flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer select-none h-full
                        ${isSelected 
                            ? 'bg-indigo-600 border-indigo-500 shadow-md ring-2 ring-indigo-300 ring-offset-1 text-white' 
                            : `${activeTheme.folderBg} ${activeTheme.folderText} hover:border-indigo-400 hover:shadow-sm`
                        }
                    `}
                >
                    <Folder className={`w-6 h-6 shrink-0 ${isSelected ? 'text-white' : 'text-blue-500'}`} />
                    <span className={`text-sm font-medium truncate w-full`}>
                        {(item as FolderType).name}
                    </span>
                    {isSelected && <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full shadow"></div>}
                </div>
            );
        }

        if (type === 'folder') {
             // List view folder
             return (
                <div 
                    ref={el => { if (el) itemRefs.current.set(item.id, el); else itemRefs.current.delete(item.id); }}
                    data-item-id={item.id}
                    {...commonClickProps}
                    onContextMenu={(e) => handleContextMenu(e, item.id, 'folder')}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, item.id)}
                    className={`
                        group relative flex flex-col items-center p-3 rounded-lg border-2 transition-all cursor-pointer h-full select-none
                        ${isSelected ? 'bg-indigo-100 border-indigo-400 shadow-sm' : `${activeTheme.bg} border-transparent hover:bg-slate-100`}
                    `}
                >
                    <Folder className={`w-10 h-10 mb-2 ${isSelected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-blue-400'}`} />
                    <span className={`text-xs text-center font-medium line-clamp-2 leading-tight ${isSelected ? 'text-indigo-900' : activeTheme.text}`}>
                        {(item as FolderType).name}
                    </span>
                    {isSelected && <div className="absolute top-1 right-1 bg-indigo-600 rounded-full p-0.5"><CheckSquare className="w-3 h-3 text-white"/></div>}
                </div>
            );
        }
        
        // Render Book
        const isSmall = settings.libraryCardSize === 'small';

        // Progress Calculation
        const progressPercent = (item as BookType).totalWords > 0 
            ? Math.round(((item as BookType).lastPosition / (item as BookType).totalWords) * 100) 
            : 0;

        return (
            <div 
                ref={el => { if (el) itemRefs.current.set(item.id, el); else itemRefs.current.delete(item.id); }}
                data-item-id={item.id}
                {...commonClickProps}
                onContextMenu={(e) => handleContextMenu(e, item.id, 'book')}
                className={`
                    group relative ${activeTheme.uiBg} ${activeTheme.uiBorder} border rounded-xl hover:shadow-xl transition-all cursor-pointer h-full flex flex-col overflow-hidden select-none
                    ${isSelected ? 'ring-2 ring-indigo-500 border-transparent shadow-lg' : ''}
                `}
            >
                {/* Cover Area */}
                <div className={`relative aspect-[3/4] ${activeTheme.bg === 'bg-black' ? 'bg-zinc-950' : 'bg-slate-100'} w-full overflow-hidden border-b ${activeTheme.uiBorder}`}>
                    {(item as BookType).cover ? (
                        <img src={(item as BookType).cover} alt="Cover" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                        <div className={`w-full h-full flex items-center justify-center ${(item as BookType).type === 'epub' ? 'text-orange-300 bg-orange-900/20' : 'text-blue-300 bg-blue-900/20'}`}>
                            {(item as BookType).type === 'epub' ? <BookOpen className="w-12 h-12 opacity-50" /> : <FileText className="w-12 h-12 opacity-50" />}
                        </div>
                    )}
                    
                    {/* Summary Overlay */}
                    {summary && summary.id === item.id && (
                        <div className="absolute inset-0 bg-zinc-900/95 p-4 overflow-y-auto text-sm text-gray-300 animate-in fade-in z-10">
                            <div className="flex items-center gap-2 mb-2 text-indigo-400 font-bold text-xs uppercase">
                                <Sparkles className="w-3 h-3" /> Summary
                            </div>
                            {summary.text}
                        </div>
                    )}

                    {/* Checkmark for selection */}
                    {isSelected && (
                         <div className="absolute top-2 right-2 bg-indigo-600 rounded-full p-1 shadow">
                             <CheckSquare className="w-4 h-4 text-white" />
                         </div>
                    )}

                    {/* Quick Action Buttons (Visible on Hover) - Grid Refactored */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-4">
                        <div className="grid grid-cols-2 gap-3 mb-2 w-full max-w-[160px]">
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onBookSelect(item as BookType, 'scroll');
                                }}
                                className="aspect-square rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center shadow-lg hover:scale-105 transition-all"
                                title="Continuous Mode"
                            >
                                <Scroll className="w-6 h-6" />
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onBookSelect(item as BookType, 'paginated');
                                }}
                                className="aspect-square rounded-lg bg-white text-indigo-600 hover:bg-indigo-50 flex items-center justify-center shadow-lg hover:scale-105 transition-all"
                                title="Paginated Mode"
                            >
                                <Book className="w-6 h-6" />
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onBookSelect(item as BookType, 'wheel');
                                }}
                                className="aspect-square rounded-lg bg-white text-fuchsia-600 hover:bg-fuchsia-50 flex items-center justify-center shadow-lg hover:scale-105 transition-all"
                                title="Wheel Mode"
                            >
                                <Disc className="w-6 h-6" />
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onBookSelect(item as BookType, 'tiktok');
                                }}
                                className="aspect-square rounded-lg bg-white text-red-600 hover:bg-red-50 flex items-center justify-center shadow-lg hover:scale-105 transition-all"
                                title="Viral Mode"
                            >
                                <Activity className="w-6 h-6" />
                            </button>
                        </div>
                        <button 
                            onClick={(e) => handleSummarize(e, item as BookType)}
                            className="px-4 py-1.5 rounded-full bg-zinc-800 text-white text-xs font-bold hover:bg-zinc-700 shadow-lg flex items-center gap-2 transition-all hover:scale-105 backdrop-blur-md"
                        >
                            <Sparkles className="w-3 h-3 text-purple-400" /> Summary
                        </button>
                    </div>
                </div>

                {/* Info Area */}
                <div className={`p-3 flex-1 flex flex-col ${activeTheme.uiBg}`}>
                    <h3 className={`font-bold line-clamp-2 text-sm mb-2 leading-snug ${activeTheme.text}`}>{(item as BookType).title}</h3>
                    <div className="mt-auto flex items-center gap-2">
                        {/* Thin Blue Progress Bar */}
                        <div className="flex-1 h-1 bg-gray-200/20 rounded-full overflow-hidden">
                             <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                        </div>
                        {progressPercent > 0 && (
                            <span className="text-[10px] font-bold text-indigo-400 shrink-0">
                                {progressPercent}%
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
      }

      // LIST VIEW LOGIC
      if (layout === 'list') {
         return (
             <div 
                ref={el => { if (el) itemRefs.current.set(item.id, el); else itemRefs.current.delete(item.id); }}
                data-item-id={item.id}
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item.id, type)}
                onDragOver={type === 'folder' ? handleDragOver : undefined}
                onDrop={type === 'folder' ? (e) => handleDrop(e, item.id) : undefined}
                onContextMenu={(e) => handleContextMenu(e, item.id, type)}
                className={`group relative flex items-center p-3 rounded-lg border hover:shadow-md transition-all cursor-pointer gap-4 select-none ${isSelected ? 'bg-indigo-900/30 border-indigo-500' : `${activeTheme.uiBg} ${activeTheme.uiBorder} hover:border-gray-400`}`}
                {...commonClickProps}
             >
                <div 
                    className={`shrink-0 w-12 h-12 flex items-center justify-center rounded-lg overflow-hidden relative ${isSelected ? 'bg-indigo-900 text-indigo-400' : 'bg-black/10 text-gray-500'}`}
                >
                     {type === 'folder' ? (
                        <Folder className="w-6 h-6" />
                     ) : (
                        (item as BookType).cover ? <img src={(item as BookType).cover} className="w-full h-full object-cover" /> : <FileText className="w-6 h-6" />
                     )}
                     {isSelected && <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center"><CheckSquare className="w-6 h-6 text-indigo-400"/></div>}
                </div>
                
                <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold truncate ${activeTheme.text}`}>{(item as any).title || (item as any).name}</h3>
                    <div className={`flex gap-3 text-xs opacity-50 mt-0.5 ${activeTheme.text}`}>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        {type === 'book' && (
                             <span>{Math.ceil((item as BookType).totalWords / 250)} min</span>
                        )}
                    </div>
                </div>

                {type === 'book' && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onBookSelect(item as BookType, 'scroll'); }}
                            className="p-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white" title="Continuous Mode"
                        >
                            <Scroll className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onBookSelect(item as BookType, 'paginated'); }}
                            className="p-2 rounded bg-white hover:bg-gray-100 text-indigo-600 border border-indigo-200" title="Paginated Mode"
                        >
                            <Book className="w-4 h-4" />
                        </button>
                         <button 
                            onClick={(e) => { e.stopPropagation(); onBookSelect(item as BookType, 'wheel'); }}
                            className="p-2 rounded bg-white hover:bg-gray-100 text-fuchsia-600 border border-fuchsia-200" title="Wheel Mode"
                        >
                            <Disc className="w-4 h-4" />
                        </button>
                         <button 
                            onClick={(e) => { e.stopPropagation(); onBookSelect(item as BookType, 'tiktok'); }}
                            className="p-2 rounded bg-white hover:bg-gray-100 text-red-600 border border-red-200" title="Viral Mode"
                        >
                            <Activity className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onBookSelect(item as BookType, 'spritz'); }}
                            className="p-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-700" title="Spritz Mode"
                        >
                            <Zap className="w-4 h-4" />
                        </button>
                    </div>
                )}
             </div>
         )
      }

      // GRID VIEW WRAPPER
      return (
          <div 
            key={item.id} 
            className={`${type === 'folder' && layout === 'grid' ? 'col-span-1 h-14' : 'aspect-[3/4] sm:h-auto'}`}
            draggable
            onDragStart={(e) => handleDragStart(e, item.id, type)}
          >
             <Content />
          </div>
      );
  };

  return (
    <div 
        id="library-container"
        ref={containerRef}
        className={`w-full h-full p-4 sm:p-6 overflow-y-auto relative ${activeTheme.bg} ${activeTheme.text}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, null)}
    >
      
      {/* Selection Box */}
      {isDraggingSelect && selectionBox && (
          <div 
              className="absolute bg-indigo-500/20 border border-indigo-500 z-50 pointer-events-none"
              style={{
                  left: Math.min(selectionBox.startX, selectionBox.currentX),
                  top: Math.min(selectionBox.startY, selectionBox.currentY),
                  width: Math.abs(selectionBox.currentX - selectionBox.startX),
                  height: Math.abs(selectionBox.currentY - selectionBox.startY),
              }}
          />
      )}

      {/* Header Toolbar */}
      <div className={`sticky top-0 z-40 py-4 mb-4 border-b ${activeTheme.bg} ${activeTheme.uiBorder} bg-opacity-95 backdrop-blur`} onMouseDown={e => e.stopPropagation()}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               {currentFolderId && (
                   <button 
                        onClick={() => {
                            const parentId = folders.find(f => f.id === currentFolderId)?.parentId || null;
                            setCurrentFolderId(parentId);
                        }}
                        className={`p-2 rounded-full hover:bg-black/5 ${activeTheme.icon}`}
                        title="Back"
                   >
                       <ArrowLeft className="w-5 h-5" />
                   </button>
               )}
               <div>
                 <h1 className="text-2xl font-bold">Library</h1>
                 {getBreadcrumbs()}
               </div>
            </div>

            {/* Changed from overflow-x-auto to flex-wrap to prevent clipping of dropdowns */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {selectedIds.size > 0 ? (
                    <div className={`flex items-center gap-2 animate-in slide-in-from-right-4 p-1 rounded-xl shadow-sm border border-indigo-900/50 ${activeTheme.uiBg}`}>
                        <span className="text-sm font-bold text-indigo-400 px-3">{selectedIds.size} selected</span>
                        <div className={`h-4 w-px ${activeTheme.uiBorder} border-r`}></div>
                        <button 
                            onClick={() => setIsMoveModalOpen(true)}
                            className="p-2.5 opacity-60 hover:opacity-100 hover:text-indigo-400 rounded-lg flex items-center gap-2 text-sm font-medium"
                        >
                            <Move className="w-5 h-5" /> <span className="hidden sm:inline">Move</span>
                        </button>
                        <button 
                            onClick={() => { setItemToDelete(null); setIsDeleteModalOpen(true); }}
                            className="p-2.5 opacity-60 hover:opacity-100 hover:text-red-400 rounded-lg flex items-center gap-2 text-sm font-medium"
                        >
                            <Trash2 className="w-5 h-5" /> <span className="hidden sm:inline">Delete</span>
                        </button>
                        <div className={`h-4 w-px ${activeTheme.uiBorder} border-r`}></div>
                        <button onClick={() => setSelectedIds(new Set())} className="p-2.5 opacity-50 hover:opacity-100"><X className="w-5 h-5"/></button>
                    </div>
                ) : (
                    <>
                        {/* Search Input */}
                        <div className="relative group w-full sm:w-64">
                            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${activeTheme.icon} opacity-50`} />
                            <input 
                                type="text" 
                                placeholder="Search..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={`w-full pl-9 pr-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${activeTheme.bg} ${activeTheme.uiBorder} ${activeTheme.text} placeholder-opacity-50`}
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5 rounded-full">
                                    <X className="w-3 h-3 opacity-50" />
                                </button>
                            )}
                        </div>

                         <button 
                            onClick={toggleTheme}
                            className={`p-3 border rounded-lg hover:opacity-80 transition-all ${activeTheme.uiBg} ${activeTheme.uiBorder} ${activeTheme.text}`}
                            title="Toggle Theme"
                        >
                             {getThemeIcon()}
                        </button>

                        <button 
                            onClick={toggleSelectAll}
                            className={`p-3 border rounded-lg hover:opacity-80 transition-all ${activeTheme.uiBg} ${activeTheme.uiBorder} ${selectedIds.size > 0 ? 'text-indigo-400' : activeTheme.icon}`}
                            title="Select All"
                        >
                             <CheckSquare className="w-5 h-5" />
                        </button>

                        <div className={`flex items-center rounded-lg border p-1 ${activeTheme.uiBg} ${activeTheme.uiBorder}`}>
                            <button onClick={() => handleLayoutChange('grid')} className={`p-2.5 rounded ${layout === 'grid' ? 'bg-black/10 text-indigo-400' : 'opacity-50'}`}><Grid className="w-5 h-5"/></button>
                            <button onClick={() => handleLayoutChange('list')} className={`p-2.5 rounded ${layout === 'list' ? 'bg-black/10 text-indigo-400' : 'opacity-50'}`}><List className="w-5 h-5"/></button>
                        </div>
                        
                        {/* Sort Dropdown */}
                        <div className="relative z-50">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsSortMenuOpen(!isSortMenuOpen); }}
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${activeTheme.uiBg} ${activeTheme.uiBorder} ${activeTheme.text} hover:opacity-80`}
                            >
                                <span className="text-xs font-medium">
                                    {sortField === 'lastRead' ? 'Last Read' : sortField === 'createdAt' ? 'Date Added' : sortField === 'title' ? 'A-Z' : 'Most Read'}
                                </span>
                                <ChevronDown className="w-4 h-4 opacity-50" />
                            </button>
                            {isSortMenuOpen && (
                                <div className={`absolute right-0 top-full mt-2 w-40 z-[60] rounded-xl shadow-xl border overflow-hidden ${activeTheme.uiBg} ${activeTheme.uiBorder} animate-in fade-in zoom-in-95`}>
                                    <button onClick={() => handleSortChange('lastRead')} className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 hover:bg-black/5 ${sortField === 'lastRead' ? 'font-bold text-indigo-500' : activeTheme.text}`}>
                                        <Clock className="w-3.5 h-3.5" /> Last Read
                                    </button>
                                    <button onClick={() => handleSortChange('progress')} className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 hover:bg-black/5 ${sortField === 'progress' ? 'font-bold text-indigo-500' : activeTheme.text}`}>
                                        <Percent className="w-3.5 h-3.5" /> Most Read
                                    </button>
                                    <button onClick={() => handleSortChange('title')} className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 hover:bg-black/5 ${sortField === 'title' ? 'font-bold text-indigo-500' : activeTheme.text}`}>
                                        <SortAsc className="w-3.5 h-3.5" /> A - Z
                                    </button>
                                     <button onClick={() => handleSortChange('createdAt')} className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 hover:bg-black/5 ${sortField === 'createdAt' ? 'font-bold text-indigo-500' : activeTheme.text}`}>
                                        <Calendar className="w-3.5 h-3.5" /> Date Added
                                    </button>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={() => setIsCreateFolderOpen(true)}
                            className={`p-3 border rounded-lg hover:text-indigo-400 transition-all ${activeTheme.uiBg} ${activeTheme.uiBorder} ${activeTheme.icon}`}
                            title="New Folder"
                        >
                            <FolderPlus className="w-5 h-5" />
                        </button>

                        <label className={`flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700 transition-colors shadow-sm hover:shadow-md active:scale-95 transform duration-150 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                            <Upload className="w-5 h-5" />
                            <span className="hidden sm:inline font-medium">{isUploading ? '...' : 'Upload'}</span>
                            <input 
                                type="file" 
                                multiple
                                accept=".epub,.txt" 
                                className="hidden" 
                                onChange={handleFileUpload}
                                disabled={isUploading}
                            />
                        </label>
                    </>
                )}
            </div>
        </div>
      </div>

      {/* Render Content */}
      <div className="pb-20">
        {layout === 'grid' ? (
            <div className="space-y-8">
                {currentItems.folders.length > 0 && (
                    <div className={`grid ${getGridClasses()}`}>
                        {currentItems.folders.map(f => renderItem(f, 'folder'))}
                    </div>
                )}
                
                {currentItems.books.length > 0 && (
                     <div className={`grid ${getGridClasses()}`}>
                        {currentItems.books.map(b => renderItem(b, 'book'))}
                    </div>
                )}
            </div>
        ) : (
            <div className="flex flex-col gap-2">
                 {currentItems.folders.map(f => renderItem(f, 'folder'))}
                 {currentItems.books.map(b => renderItem(b, 'book'))}
            </div>
        )}

        {currentItems.folders.length === 0 && currentItems.books.length === 0 && (
             <div className="flex flex-col items-center justify-center py-24 opacity-50 pointer-events-none">
                 {searchQuery ? (
                     <>
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 border ${activeTheme.uiBg} ${activeTheme.uiBorder}`}>
                            <Search className="w-8 h-8 opacity-50" />
                        </div>
                        <p>No items found for "{searchQuery}".</p>
                     </>
                 ) : (
                     <>
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 border ${activeTheme.uiBg} ${activeTheme.uiBorder}`}>
                            <Folder className="w-8 h-8 opacity-50" />
                        </div>
                        <p>This folder is empty. Drag files here or upload.</p>
                     </>
                 )}
             </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
          <div 
            className={`fixed z-[60] rounded-lg shadow-xl border py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100 ${activeTheme.uiBg} ${activeTheme.uiBorder}`}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={e => e.stopPropagation()} 
          >
              <button 
                onClick={() => { setIsMoveModalOpen(true); setContextMenu(null); }}
                className={`w-full text-left px-4 py-2 hover:bg-black/5 text-sm flex items-center gap-2 ${activeTheme.text}`}
              >
                  <Move className="w-4 h-4" /> Move
              </button>
              <div className={`my-1 border-t ${activeTheme.uiBorder}`} />
              <button 
                onClick={() => { setItemToDelete({ id: contextMenu.itemId, type: contextMenu.itemType }); setIsDeleteModalOpen(true); setContextMenu(null); }}
                className="w-full text-left px-4 py-2 hover:bg-red-900/20 text-sm flex items-center gap-2 text-red-500"
              >
                  <Trash2 className="w-4 h-4" /> Delete
              </button>
          </div>
      )}

      {/* --- MODALS --- */}

      {/* Create Folder Modal */}
      {isCreateFolderOpen && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => e.stopPropagation()}>
              <div className={`rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 border ${activeTheme.uiBg} ${activeTheme.uiBorder}`}>
                  <h3 className={`text-lg font-bold mb-4 ${activeTheme.text}`}>Create New Folder</h3>
                  <input 
                    autoFocus
                    type="text"
                    placeholder="Folder Name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className={`w-full p-2 border rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500 outline-none ${activeTheme.bg} ${activeTheme.uiBorder} ${activeTheme.text}`}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  />
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setIsCreateFolderOpen(false)} className={`px-4 py-2 rounded-lg ${activeTheme.text} opacity-70 hover:opacity-100`}>Cancel</button>
                      <button onClick={handleCreateFolder} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Create</button>
                  </div>
              </div>
          </div>
      )}

      {/* Move Items Modal */}
      {isMoveModalOpen && (
           <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => e.stopPropagation()}>
              <div className={`rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 flex flex-col max-h-[80vh] border ${activeTheme.uiBg} ${activeTheme.uiBorder}`}>
                  <h3 className={`text-lg font-bold mb-4 ${activeTheme.text}`}>Move {selectedIds.size} Items to...</h3>
                  <div className={`flex-1 overflow-y-auto border rounded-lg mb-4 ${activeTheme.bg} ${activeTheme.uiBorder}`}>
                       <button 
                            onClick={() => setMoveTargetFolderId(null)}
                            className={`w-full text-left p-3 hover:bg-black/5 flex items-center gap-2 border-b ${activeTheme.uiBorder} ${activeTheme.text} ${moveTargetFolderId === null ? 'bg-indigo-900/10 text-indigo-500 font-bold' : ''}`}
                       >
                           <Folder className="w-4 h-4" /> Home (Root)
                       </button>
                       {folders.filter(f => !selectedIds.has(f.id)).map(f => (
                           <button 
                                key={f.id}
                                onClick={() => setMoveTargetFolderId(f.id)}
                                className={`w-full text-left p-3 hover:bg-black/5 flex items-center gap-2 ${activeTheme.text} ${moveTargetFolderId === f.id ? 'bg-indigo-900/10 text-indigo-500 font-bold' : ''}`}
                           >
                               <Folder className="w-4 h-4" /> {f.name}
                           </button>
                       ))}
                  </div>
                  <div className="flex justify-end gap-2 shrink-0">
                      <button onClick={() => setIsMoveModalOpen(false)} className={`px-4 py-2 rounded-lg ${activeTheme.text} opacity-70 hover:opacity-100`}>Cancel</button>
                      <button onClick={handleBatchMove} disabled={isProcessingAction} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Move</button>
                  </div>
              </div>
          </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => e.stopPropagation()}>
            <div className={`rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border ${activeTheme.uiBg} ${activeTheme.uiBorder}`}>
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-red-900/20 text-red-500 rounded-full">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <h3 className={`text-xl font-bold ${activeTheme.text}`}>Delete {itemToDelete ? '1 Item' : `${selectedIds.size} Items`}?</h3>
                    </div>
                    <p className="opacity-70 mb-8 leading-relaxed">
                        Are you sure? This will permanently delete the selected books and folders (including their contents).
                    </p>
                    <div className="flex items-center gap-3 justify-end">
                        <button 
                            onClick={() => { setIsDeleteModalOpen(false); setItemToDelete(null); }}
                            className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors ${activeTheme.text} opacity-70 hover:opacity-100 hover:bg-black/5`}
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => handleBatchDelete()}
                            disabled={isProcessingAction}
                            className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-red-900/20"
                        >
                            {isProcessingAction ? 'Deleting...' : 'Delete'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};