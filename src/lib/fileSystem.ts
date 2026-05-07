import { get, set } from 'idb-keyval';

export interface FileNode {
  name: string;
  kind: 'file' | 'directory';
  path: string;
  handle: any; // FileSystemFileHandle | FileSystemDirectoryHandle
  children?: FileNode[];
  isOpen?: boolean; // For directory tree UI
}

export const saveProjectHandle = async (handle: any) => {
  await set('projectDirHandle', handle);
};

export const getProjectHandle = async (): Promise<any | null> => {
  return await get('projectDirHandle');
};

export const verifyPermission = async (fileHandle: any, readWrite: boolean = false) => {
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
};

export const buildFileTree = async (dirHandle: any, currentPath = ''): Promise<FileNode[]> => {
  const nodes: FileNode[] = [];
  for await (const entry of dirHandle.values()) {
    const nodePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    
    // Skip node_modules, .git, .next, dist to avoid hanging
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'dist') {
        continue;
    }

    if (entry.kind === 'file') {
      nodes.push({ name: entry.name, kind: 'file', path: nodePath, handle: entry });
    } else if (entry.kind === 'directory') {
      // We don't recursively load all children to save performance, 
      // but for a small project we could. 
      // Instead, we just mark it as a directory, and UI can lazy-load or we just load it.
      // Let's load 1 level deep or just load all for small static projects.
      const children = await buildFileTree(entry, nodePath);
      nodes.push({ name: entry.name, kind: 'directory', path: nodePath, handle: entry, children, isOpen: false });
    }
  }
  
  // Sort directories first, then files
  nodes.sort((a, b) => {
      if (a.kind === b.kind) return a.name.localeCompare(b.name);
      return a.kind === 'directory' ? -1 : 1;
  });

  return nodes;
};

export const resolveImagePath = async (rootHandle: any, relativePath: string): Promise<File | null> => {
    try {
        let parts = relativePath.split('/').filter(p => p !== '.' && p !== '');
        
        let currentHandle = rootHandle;
        
        // Handle absolute paths by trying to find them from root
        if (relativePath.startsWith('/')) {
             parts = relativePath.substring(1).split('/').filter(p => p !== '.' && p !== '');
        }

        for (let i = 0; i < parts.length; i++) {
            const part = decodeURIComponent(parts[i]);
            
            // If it's the last part, it's a file
            if (i === parts.length - 1) {
                const fileHandle = await currentHandle.getFileHandle(part);
                return await fileHandle.getFile();
            } else {
                // Ignore ".." by just continuing from root for now (a robust resolve is tricky, 
                // but usually web paths match the dev server root which is the project root)
                if (part === '..') {
                    // For simplicity, we just reset to root if they go up, or ignore.
                    // A proper implementation would need the current file's directory handle.
                    currentHandle = rootHandle; 
                } else {
                    currentHandle = await currentHandle.getDirectoryHandle(part);
                }
            }
        }
    } catch (e) {
        console.warn(`Could not resolve image path: ${relativePath}`, e);
    }
    return null;
}
