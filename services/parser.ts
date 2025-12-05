

import { Book, Chapter } from '../types';

// Helper to count tokens exactly as Reader.tsx does (words + newlines)
const countTokens = (text: string): number => {
    const rawSegments = text.split(/(\n)/);
    let count = 0;
    rawSegments.forEach(seg => {
        if (seg === '\n') {
            count++;
        } else {
            const words = seg.trim().split(/[ ]+/);
            words.forEach(w => { if (w.length > 0) count++; });
        }
    });
    return count;
};

// DOM Walker to extract tokens and map IDs to token indices
const extractTokensAndAnchors = (node: Node, currentTokens: string[]): { anchors: Record<string, number> } => {
    const anchors: Record<string, number> = {};

    const process = (n: Node) => {
        if (n.nodeType === Node.ELEMENT_NODE) {
            const el = n as Element;
            if (el.id) {
                // Map ID to the current token count (start of this element)
                anchors[el.id] = currentTokens.length;
            }
            
            const tagName = el.tagName.toUpperCase();
            const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'HR'].includes(tagName);
            const isBreak = tagName === 'BR';

            if (isBreak) {
                currentTokens.push('\n');
            }

            for (let i = 0; i < n.childNodes.length; i++) {
                process(n.childNodes[i]);
            }

            if (isBlock) {
                currentTokens.push('\n');
            }
        } else if (n.nodeType === Node.TEXT_NODE) {
            const text = n.textContent || '';
            // Standardize spaces: replace newlines/tabs with space, collapse multiple spaces
            const clean = text.replace(/[\n\r\t]+/g, ' ').replace(/[ ]+/g, ' ');
            if (clean.trim()) {
                const words = clean.split(' ');
                words.forEach(w => {
                    if (w) currentTokens.push(w);
                });
            }
        }
    };

    process(node);
    return { anchors };
};

export const parseFile = async (file: File): Promise<Book> => {
  const timestamp = Date.now();
  const id = `${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
  let content = '';
  let cover: string | undefined = undefined;
  let type: 'txt' | 'epub' = 'txt';
  let title = file.name.replace(/\.(epub|txt)$/i, '');
  let chapters: Chapter[] | undefined = undefined;

  if (file.name.endsWith('.epub')) {
    type = 'epub';
    const result = await parseEpub(file);
    content = result.text;
    cover = result.cover;
    chapters = result.chapters;
    if (result.title) {
        title = result.title;
    }
  } else {
    content = await file.text();
    // TXT Specific Normalization:
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    content = content.replace(/\n\s*\n/g, '___PARAGRAPH___');
    content = content.replace(/\n/g, ' ');
    content = content.replace(/___PARAGRAPH___/g, '\n');
    
    // General Normalization for TXT only
    content = content.replace(/[ \t]+/g, ' ');
    content = content.replace(/\n+/g, '\n');
    content = content.trim();
  }

  // NOTE: For EPUB, we skip the global normalization here because parseEpub
  // now constructs the text token-by-token, ensuring exact match with indices.

  return {
    id,
    title,
    type,
    content,
    cover,
    parentId: null, // Default to root
    createdAt: timestamp,
    lastPosition: 0,
    lastRead: 0,
    totalWords: countTokens(content),
    chapters
  };
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const parseEpub = async (file: File): Promise<{ text: string, cover?: string, title?: string, chapters?: Chapter[] }> => {
  return new Promise((resolve, reject) => {
    if (!window.ePub) {
      reject(new Error('ePub.js not loaded'));
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const bookData = e.target?.result;
        const book = window.ePub(bookData);
        await book.ready;
        
        // --- Extract Metadata ---
        let title: string | undefined = undefined;
        try {
            const metadata = await book.loaded.metadata;
            if (metadata && metadata.title) {
                title = metadata.title;
            }
        } catch (metaErr) {
            console.warn("Could not extract metadata", metaErr);
        }

        // --- Extract Cover ---
        let coverBase64: string | undefined = undefined;
        try {
            const coverUrl = await book.coverUrl();
            if (coverUrl) {
                const response = await fetch(coverUrl);
                const blob = await response.blob();
                coverBase64 = await blobToBase64(blob);
            }
        } catch (coverErr) {
            console.warn("Could not extract cover", coverErr);
        }

        // --- Extract Text and Map Chapters ---
        const spine = book.spine;
        const items = spine && spine.items ? spine.items : [];
        
        // Maps "filename.html" -> start index
        // Maps "filename.html#anchor" -> start index + offset
        const hrefToIndexMap: Record<string, number> = {};
        
        const allTokens: string[] = [];
        
        for (const item of items) {
           const chunkStartIndex = allTokens.length;

           if (item.href) {
             hrefToIndexMap[item.href] = chunkStartIndex;
             try { hrefToIndexMap[decodeURI(item.href)] = chunkStartIndex; } catch(e) {}
           }

           let doc = null;
           try {
               if (item && typeof item.load === 'function') {
                   doc = await item.load(book.load.bind(book));
               } else if (item && item.href) {
                   doc = await book.load(item.href);
               }

               if (doc) {
                   // Parse tokens from this chunk
                   const chunkTokens: string[] = [];
                   let anchors: Record<string, number> = {};

                   if (doc instanceof Document) {
                       const res = extractTokensAndAnchors(doc.body, chunkTokens);
                       anchors = res.anchors;
                   } else if (typeof doc === 'string') {
                       const parser = new DOMParser();
                       const parsed = parser.parseFromString(doc, 'text/html');
                       const res = extractTokensAndAnchors(parsed.body, chunkTokens);
                       anchors = res.anchors;
                   } else if (doc && typeof (doc as any).body === 'object') {
                       // Fallback for weird objects (rare)
                       const res = extractTokensAndAnchors((doc as any).body, chunkTokens);
                       anchors = res.anchors;
                   }

                   // Store anchors relative to global index
                   Object.keys(anchors).forEach(id => {
                       const fullHref = `${item.href}#${id}`;
                       hrefToIndexMap[fullHref] = chunkStartIndex + anchors[id];
                   });

                   // Append tokens
                   // Force a newline between spine items if not present
                   if (chunkTokens.length > 0) {
                        // Avoid double newlines if last was newline
                        if (allTokens.length > 0 && 
                            allTokens[allTokens.length - 1] !== '\n' && 
                            chunkTokens[0] !== '\n') {
                             allTokens.push('\n');
                        }
                        
                        chunkTokens.forEach(t => allTokens.push(t));
                   }
               }
           } catch (loadError) {
               console.warn(`Failed to load spine item ${item?.href}:`, loadError);
               continue;
           }
        }
        
        // Reconstruct full text from tokens to ensure Reader sees exactly what we counted
        // Logic: join with space, but don't add space around newlines if possible 
        // (Reader splits by space, so space is delimiter)
        let fullText = '';
        for (let i = 0; i < allTokens.length; i++) {
            const t = allTokens[i];
            if (t === '\n') {
                fullText += '\n';
            } else {
                fullText += t;
                // Add space if next is not newline and not end
                if (i < allTokens.length - 1 && allTokens[i+1] !== '\n') {
                    fullText += ' ';
                }
            }
        }

        // --- Extract and Map TOC ---
        let chapters: Chapter[] = [];
        try {
            const toc = await book.loaded.navigation;
            const mapTocItem = (item: any): Chapter => {
                const cleanHref = item.href; // Keep full href including hash
                const decodedHref = decodeURI(cleanHref);
                const noHashHref = cleanHref.split('#')[0];
                
                // Priority: Exact Match (with hash) -> Decoded Match -> File Match -> 0
                const position = 
                    hrefToIndexMap[cleanHref] ?? 
                    hrefToIndexMap[decodedHref] ?? 
                    hrefToIndexMap[noHashHref] ?? 
                    0;

                return {
                    title: item.label.trim(),
                    position: position,
                    subchapters: item.subitems ? item.subitems.map(mapTocItem) : []
                };
            };
            
            if (toc && toc.toc) {
                chapters = toc.toc.map(mapTocItem);
            }
        } catch (tocErr) {
            console.warn("Could not extract TOC", tocErr);
        }
        
        resolve({ text: fullText, cover: coverBase64, title, chapters });
      } catch (err) {
        console.error("EPUB parsing error:", err);
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};