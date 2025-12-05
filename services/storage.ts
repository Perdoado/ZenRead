
import { Book, AppSettings, VoiceSettings, GlossaryItem, Folder } from '../types';

const DB_NAME = 'ZenReadDB';
const STORE_BOOKS = 'books';
const STORE_FOLDERS = 'folders';
const STORE_SETTINGS = 'settings';
const STORE_GLOSSARY = 'glossary';

// Singleton DB Instance
let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
      }
      if (!db.objectStoreNames.contains(STORE_GLOSSARY)) {
        // Use 'word' as keyPath because it's the normalized unique ID
        db.createObjectStore(STORE_GLOSSARY, { keyPath: 'word' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbPromise = null;

      // Handle connection closing/version changes
      dbInstance.onversionchange = () => {
          dbInstance?.close();
          dbInstance = null;
      };
      dbInstance.onclose = () => {
          dbInstance = null;
      };

      // Attempt to persist storage to prevent browser eviction
      if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persisted().then(persistent => {
              if (!persistent) {
                  navigator.storage.persist().catch(err => console.warn("Storage persistence failed:", err));
              }
          });
      }

      resolve(dbInstance);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    
    request.onblocked = () => {
        console.warn("Database upgrade blocked. Please close other tabs.");
    };
  });

  return dbPromise;
};

// --- Books ---

export const saveBook = async (book: Book): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readwrite');
    const store = tx.objectStore(STORE_BOOKS);
    store.put(book);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getBooks = async (): Promise<Book[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readonly');
    const store = tx.objectStore(STORE_BOOKS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deleteBook = async (id: string): Promise<void> => {
  console.log(`[Storage] Attempting to delete book with ID: ${id}`);
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readwrite');
    const store = tx.objectStore(STORE_BOOKS);
    
    // Perform delete
    const request = store.delete(id);
    
    request.onsuccess = () => {
        console.log(`[Storage] Delete request success for ID: ${id}`);
    };

    tx.oncomplete = () => {
        console.log(`[Storage] Transaction complete. Book ${id} deleted.`);
        resolve();
    };
    
    tx.onerror = (event) => {
        console.error("[Storage] Delete transaction error:", tx.error);
        reject(tx.error);
    };
  });
};

// --- Folders ---

export const saveFolder = async (folder: Folder): Promise<void> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDERS, 'readwrite');
        const store = tx.objectStore(STORE_FOLDERS);
        store.put(folder);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getFolders = async (): Promise<Folder[]> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDERS, 'readonly');
        const store = tx.objectStore(STORE_FOLDERS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const deleteFolder = async (id: string): Promise<void> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDERS, 'readwrite');
        const store = tx.objectStore(STORE_FOLDERS);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

// --- Batch Operations ---

export const deleteItems = async (bookIds: string[], folderIds: string[]): Promise<void> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_BOOKS, STORE_FOLDERS], 'readwrite');
        const bookStore = tx.objectStore(STORE_BOOKS);
        const folderStore = tx.objectStore(STORE_FOLDERS);

        bookIds.forEach(id => bookStore.delete(id));
        folderIds.forEach(id => folderStore.delete(id));

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export const moveItems = async (bookIds: string[], folderIds: string[], targetParentId: string | null): Promise<void> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_BOOKS, STORE_FOLDERS], 'readwrite');
        const bookStore = tx.objectStore(STORE_BOOKS);
        const folderStore = tx.objectStore(STORE_FOLDERS);

        // Move Books
        bookIds.forEach(id => {
            const req = bookStore.get(id);
            req.onsuccess = () => {
                const book = req.result as Book;
                if (book) {
                    book.parentId = targetParentId;
                    bookStore.put(book);
                }
            };
        });

        // Move Folders
        folderIds.forEach(id => {
             const req = folderStore.get(id);
             req.onsuccess = () => {
                 const folder = req.result as Folder;
                 if (folder) {
                     // Prevent moving a folder into itself (basic cycle prevention)
                     if (id !== targetParentId) {
                         folder.parentId = targetParentId;
                         folderStore.put(folder);
                     }
                 }
             };
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// --- Misc ---

export const saveProgress = async (id: string, position: number): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readwrite');
    const store = tx.objectStore(STORE_BOOKS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const book = getReq.result as Book;
      if (book) {
        book.lastPosition = position;
        book.lastRead = Date.now(); // Update last read timestamp
        store.put(book);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
};

export const getSettings = async (): Promise<{ app: AppSettings | undefined, voice: VoiceSettings | undefined }> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, 'readonly');
    const store = tx.objectStore(STORE_SETTINGS);
    const appReq = store.get('app');
    const voiceReq = store.get('voice');
    
    tx.oncomplete = () => {
        resolve({ app: appReq.result, voice: voiceReq.result });
    }
    tx.onerror = () => reject(tx.error);
  });
}

export const saveSettings = async (key: 'app' | 'voice', value: any): Promise<void> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SETTINGS, 'readwrite');
        const store = tx.objectStore(STORE_SETTINGS);
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// --- Global Glossary Methods ---

export const saveGlossaryItem = async (item: GlossaryItem): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GLOSSARY, 'readwrite');
    const store = tx.objectStore(STORE_GLOSSARY);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const deleteGlossaryItem = async (word: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GLOSSARY, 'readwrite');
    const store = tx.objectStore(STORE_GLOSSARY);
    store.delete(word);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getGlossary = async (): Promise<Record<string, GlossaryItem>> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GLOSSARY, 'readonly');
    const store = tx.objectStore(STORE_GLOSSARY);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result as GlossaryItem[];
      const glossaryMap: Record<string, GlossaryItem> = {};
      items.forEach(item => {
        glossaryMap[item.word] = item;
      });
      resolve(glossaryMap);
    };
    request.onerror = () => reject(request.error);
  });
};

// --- Backup & Restore ---

export const exportBackup = async (): Promise<string> => {
  const books = await getBooks();
  const folders = await getFolders();
  const glossaryMap = await getGlossary();
  const glossary = Object.values(glossaryMap);
  const { app, voice } = await getSettings();

  const backup = {
      version: 1,
      timestamp: Date.now(),
      books,
      folders,
      glossary,
      settings: { app, voice }
  };

  return JSON.stringify(backup, null, 2);
};

export const importBackup = async (jsonString: string): Promise<void> => {
  try {
      const data = JSON.parse(jsonString);
      if (!data || !data.version) throw new Error("Invalid backup format");

      const db = await getDB();
      // Use a single transaction for atomicity and speed
      return new Promise((resolve, reject) => {
          const tx = db.transaction([STORE_BOOKS, STORE_FOLDERS, STORE_SETTINGS, STORE_GLOSSARY], 'readwrite');
          
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);

          if (data.books && Array.isArray(data.books)) {
              const store = tx.objectStore(STORE_BOOKS);
              data.books.forEach((b: any) => store.put(b));
          }
          if (data.folders && Array.isArray(data.folders)) {
              const store = tx.objectStore(STORE_FOLDERS);
              data.folders.forEach((f: any) => store.put(f));
          }
          if (data.glossary && Array.isArray(data.glossary)) {
              const store = tx.objectStore(STORE_GLOSSARY);
              data.glossary.forEach((g: any) => store.put(g));
          }
          if (data.settings) {
              const store = tx.objectStore(STORE_SETTINGS);
              if (data.settings.app) store.put(data.settings.app, 'app');
              if (data.settings.voice) store.put(data.settings.voice, 'voice');
          }
      });
  } catch (e) {
      console.error("Import failed", e);
      throw e;
  }
};
