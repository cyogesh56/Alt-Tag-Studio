import React from 'react';
import { ChevronRight, ChevronDown, FileCode, Folder as FolderIcon, Image as ImageIcon } from 'lucide-react';
import { FileNode } from '../lib/fileSystem';
import { cn } from '../lib/utils';

interface FileExplorerProps {
  tree: FileNode[];
  onToggleDir: (path: string) => void;
  onFileClick: (node: FileNode) => void;
  activePath: string | null;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ tree, onToggleDir, onFileClick, activePath }) => {
  const renderTree = (nodes: FileNode[], level = 0) => {
    return nodes.map(node => {
      if (node.kind === 'directory') {
        return (
          <div key={node.path}>
            <div 
              className="flex items-center gap-1.5 py-1 px-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm transition-colors"
              style={{ paddingLeft: `${level * 12 + 8}px` }}
              onClick={() => onToggleDir(node.path)}
            >
              {node.isOpen ? <ChevronDown className="w-3.5 h-3.5 opacity-70" /> : <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
              <FolderIcon className="w-4 h-4 text-indigo-400" />
              <span className="truncate select-none">{node.name}</span>
            </div>
            {node.isOpen && node.children && (
              <div>{renderTree(node.children, level + 1)}</div>
            )}
          </div>
        );
      } else {
        const isHtml = node.name.endsWith('.html') || node.name.endsWith('.htm');
        const isImage = /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(node.name);
        
        return (
          <div 
            key={node.path}
            className={cn(
              "flex items-center gap-2 py-1 px-2 cursor-pointer text-sm transition-colors select-none",
              activePath === node.path 
                ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300" 
                : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
            )}
            style={{ paddingLeft: `${level * 12 + 24}px` }}
            onClick={() => onFileClick(node)}
          >
            {isHtml ? (
                <FileCode className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            ) : isImage ? (
                <ImageIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            ) : (
                <div className="w-4 h-4 opacity-0 flex-shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
          </div>
        );
      }
    });
  };

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {renderTree(tree)}
    </div>
  );
};
