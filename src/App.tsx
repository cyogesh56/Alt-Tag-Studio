import React, { useState, useEffect, useRef } from 'react';
import { Settings, Sun, Moon, Zap, ArrowRight, Folder, FolderOpen, Check, Info, X, ExternalLink, Key, RotateCcw, Save, Copy } from 'lucide-react';
import { cn } from './lib/utils';
import { FileExplorer } from './components/FileExplorer';
import { Editor, EditorRef } from './components/Editor';
import { FileNode, saveProjectHandle, getProjectHandle, verifyPermission, buildFileTree } from './lib/fileSystem';
import { ProviderDropdown } from './components/ProviderDropdown';

type AIProvider = 'gemini' | 'openai' | 'anthropic';

const PROVIDERS: Record<AIProvider, any> = {
  gemini: { id: 'gemini', name: 'Google Gemini', iconSrc: './icons/gemini.svg?v=2', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10', border: 'border-indigo-100 dark:border-indigo-500/20', apiLink: 'https://aistudio.google.com/app/apikey' },
  openai: { id: 'openai', name: 'OpenAI ChatGPT', iconSrc: './icons/openai.svg?v=2', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-100 dark:border-emerald-500/20', apiLink: 'https://platform.openai.com/api-keys' },
  anthropic: { id: 'anthropic', name: 'Anthropic Claude', iconSrc: './icons/anthropic.svg?v=2', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-100 dark:border-amber-500/20', apiLink: 'https://console.anthropic.com/settings/keys' },
};

const ScreenOverlay = () => (
  <div className="fixed inset-0 z-[999] bg-[#F8FAFC] dark:bg-[#0B0F19] flex flex-col items-center justify-center p-6 text-center md:hidden">
      <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 mb-6 shadow-sm p-2 flex-shrink-0">
         <img src="./logo.png" alt="Alt-Tag Studio" className="w-full h-full object-contain" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-2">Screen Too Small</h2>
      <p className="text-slate-500 dark:text-slate-400 max-w-sm">
         Alt-Tag Studio requires a tablet or desktop size screen to provide the best editing experience.
      </p>
  </div>
);

interface Tab {
    path: string;
    handle: any;
}

export default function App() {
  const [isLanding, setIsLanding] = useState(true);
  const [isSetup, setIsSetup] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const [projectDirHandle, setProjectDirHandle] = useState<any>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  const [aiProvider, setAiProvider] = useState<AIProvider>('gemini');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    gemini: process.env.GEMINI_API_KEY || '',
    openai: '',
    anthropic: ''
  });
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempApiKeys, setTempApiKeys] = useState(apiKeys);
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(true);
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [showOpenConfirm, setShowOpenConfirm] = useState(false);
  
  const editorRef = useRef<EditorRef>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
      const loadPersistedState = async () => {
          const handle = await getProjectHandle();
          if (handle) {
             setProjectDirHandle(handle);
          }
      };
      loadPersistedState();
  }, []);

  const openProject = async () => {
      try {
          const dirHandle = await (window as any).showDirectoryPicker();
          await saveProjectHandle(dirHandle);
          setProjectDirHandle(dirHandle);
          await loadFileTree(dirHandle);
          setIsSetup(false);
          setShowOpenConfirm(false);
      } catch (e) {
          console.error(e);
      }
  };

  const loadFileTree = async (handle: any) => {
      try {
          if (await verifyPermission(handle, true)) {
              const tree = await buildFileTree(handle);
              setFileTree(tree);
          }
      } catch (e) {
          console.error(e);
          showToast("Failed to load project files", 'error');
      }
  };

  const handleRestoreSession = async () => {
      await loadFileTree(projectDirHandle);
      setIsSetup(false);
  };

  const handleCloseProject = () => {
      setProjectDirHandle(null);
      setFileTree([]);
      setOpenTabs([]);
      setActiveTabPath(null);
      setIsSetup(true);
  };

  const handleToggleDir = (path: string) => {
      const toggleNode = (nodes: FileNode[]): FileNode[] => {
          return nodes.map(n => {
              if (n.path === path && n.kind === 'directory') {
                  return { ...n, isOpen: !n.isOpen };
              }
              if (n.children) {
                  return { ...n, children: toggleNode(n.children) };
              }
              return n;
          });
      };
      setFileTree(toggleNode(fileTree));
  };

  const handleFileClick = async (node: FileNode) => {
      if (!node.name.endsWith('.html') && !node.name.endsWith('.htm')) {
          return;
      }
      
      const exists = openTabs.find(t => t.path === node.path);
      if (!exists) {
          setOpenTabs([...openTabs, { path: node.path, handle: node.handle }]);
      }
      setActiveTabPath(node.path);
  };

  const closeTab = (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newTabs = openTabs.filter(t => t.path !== path);
      setOpenTabs(newTabs);
      if (activeTabPath === path) {
          setActiveTabPath(newTabs.length > 0 ? newTabs[newTabs.length - 1].path : null);
      }
  };

  const activeTab = openTabs.find(t => t.path === activeTabPath);
  
  const saveApiKey = (providerId: string) => {
      setApiKeys(prev => ({ ...prev, [providerId]: tempApiKeys[providerId] }));
      showToast(`${PROVIDERS[providerId as AIProvider].name} API key saved!`, 'success');
  };

  if (isLanding) {
      return (
          <div className="relative min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] flex flex-col items-center justify-center p-6 text-slate-900 dark:text-slate-100 font-sans animate-fade-in">
              <ScreenOverlay />
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="absolute top-6 right-6 p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-800" title="Toggle theme">
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <div className="max-w-4xl w-full flex flex-col items-center text-center gap-6">
                  <div className="flex items-center justify-center gap-4 mb-2">
                      <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm p-1.5 flex-shrink-0">
                          <img src="./logo.png" alt="Alt-Tag Studio" className="w-full h-full object-contain" />
                      </div>
                      <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Alt-Tag Studio</h1>
                  </div>
                  <p className="text-lg text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
                      Automate the tedious process of writing WCAG-compliant alt texts. 
                      Local file processing keeps your assets private, seamlessly analyzing your entire project directory.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-8 text-left">
                       <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-start hover:shadow-md transition-shadow duration-300">
                           <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 font-bold border border-emerald-100 dark:border-emerald-500/20">1</div>
                           <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Configure Provider</h3>
                           <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">Select your preferred AI provider and enter your API key to power the vision models.</p>
                       </div>
                       <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-start hover:shadow-md transition-shadow duration-300">
                           <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 font-bold border border-blue-100 dark:border-blue-500/20">2</div>
                           <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Open Project Folder</h3>
                           <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">Select your entire website's root directory. Files stay safely on disk.</p>
                       </div>
                       <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-start hover:shadow-md transition-shadow duration-300">
                           <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 font-bold border border-indigo-100 dark:border-indigo-500/20">3</div>
                           <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Generate & Save</h3>
                           <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">AI writes the alt text for each image. Click Update & Next to inject it instantly into your HTML.</p>
                       </div>
                  </div>
                  <button 
                     onClick={() => setIsLanding(false)}
                     className="mt-8 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2 text-lg active:scale-95"
                  >
                     Start Studio <ArrowRight className="w-5 h-5" />
                  </button>
              </div>
          </div>
      );
  }

  if (isSetup) {
      return (
        <div className="relative h-screen w-full bg-[#F8FAFC] dark:bg-[#0B0F19] flex flex-col items-center justify-center p-6 text-slate-900 dark:text-slate-100 font-sans animate-fade-in">
          <ScreenOverlay />
          <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="absolute top-6 right-6 p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-800"
              title="Toggle theme"
          >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm flex flex-col gap-8">
            <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
               <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm p-1.5 flex-shrink-0">
                 <img src="./logo.png" alt="Alt-Tag Studio" className="w-full h-full object-contain" />
               </div>
                <div>
                 <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-1">Alt-Tag Studio Setup</h1>
                 <p className="text-slate-500 dark:text-slate-400 text-sm">Configure your AI provider to begin.</p>
               </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Default AI Provider</label>
                  <ProviderDropdown 
                      value={aiProvider} 
                      onChange={(val) => setAiProvider(val as AIProvider)} 
                      providers={PROVIDERS} 
                  />
              </div>

              <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">API Key</label>
                      <a href={PROVIDERS[aiProvider].apiLink} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline flex items-center gap-1">Get Key <ExternalLink className="w-3 h-3"/></a>
                  </div>
                  <div className="flex gap-2">
                      <input 
                          type="password"
                          value={apiKeys[aiProvider]}
                          onChange={(e) => setApiKeys({ ...apiKeys, [aiProvider]: e.target.value })}
                          placeholder={`Enter your ${PROVIDERS[aiProvider].name} API Key`}
                          className="flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                      />
                  </div>
              </div>

              <div className="h-px bg-slate-200 dark:bg-slate-800 my-2"></div>

              {projectDirHandle ? (
                  <button 
                      onClick={handleRestoreSession}
                      className="btn-premium w-full py-4 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                  >
                      <FolderOpen className="w-5 h-5" /> Restore Previous Project Session
                  </button>
              ) : null}
              <button 
                  onClick={openProject}
                  className="btn-premium w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
              >
                  <Folder className="w-5 h-5" /> Open Project Folder
              </button>
            </div>
          </div>
        </div>
      );
  }

  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] dark:bg-[#0B0F19] font-sans text-slate-900 dark:text-slate-100 overflow-hidden animate-fade-in">
       <ScreenOverlay />
       
       {/* Left Sidebar (Activity Bar) */}
       <aside className="w-16 flex flex-col items-center py-4 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 z-20">
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 mb-6 shadow-sm p-1">
             <img src="./logo.png" alt="Alt-Tag Studio" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 flex flex-col gap-4 w-full px-2">
             <div className="relative group w-full">
                 <button aria-label="Settings" onClick={() => { setTempApiKeys(apiKeys); setIsSettingsOpen(true); }} className="w-full aspect-square flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors focus:ring-2 focus:ring-indigo-500 outline-none">
                    <Settings className="w-5 h-5" aria-hidden="true" />
                 </button>
                 <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity shadow-sm z-50">
                     Settings
                 </div>
             </div>
             
             {/* File Operation Buttons (Target active tab) */}
             <div className="h-px bg-slate-200 dark:bg-slate-800 w-8 mx-auto my-1" role="separator"></div>
             
             <div className="relative group w-full">
                 <button aria-label="Restore Original File" disabled={!activeTab} onClick={() => editorRef.current?.restoreOriginal()} className="w-full aspect-square flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent focus:ring-2 focus:ring-indigo-500 outline-none">
                    <RotateCcw className="w-5 h-5" aria-hidden="true" />
                 </button>
                 <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity shadow-sm z-50">
                     Restore Original File
                 </div>
             </div>
             
             <div className="relative group w-full">
                 <button aria-label="Save File" disabled={!activeTab} onClick={() => editorRef.current?.saveFile()} className="w-full aspect-square flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent focus:ring-2 focus:ring-indigo-500 outline-none">
                    <Save className="w-5 h-5" aria-hidden="true" />
                 </button>
                 <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity shadow-sm z-50">
                     Save File (In Place)
                 </div>
             </div>
             
             <div className="relative group w-full">
                 <button aria-label="Save a Copy" disabled={!activeTab} onClick={() => editorRef.current?.saveCopy()} className="w-full aspect-square flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent focus:ring-2 focus:ring-indigo-500 outline-none">
                    <Copy className="w-5 h-5" aria-hidden="true" />
                 </button>
                 <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity shadow-sm z-50">
                     Save a Copy
                 </div>
             </div>
          </div>
          
          <div className="relative w-full px-2">
              <div className="relative group w-full flex justify-center mt-auto">
                  <button aria-label="Open Project" aria-haspopup="dialog" onClick={() => setShowOpenConfirm(true)} className="w-12 aspect-square flex items-center justify-center rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors focus:ring-2 focus:ring-indigo-500 outline-none">
                     <Folder className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity shadow-sm z-50">
                      Open Project
                  </div>
              </div>
              {showOpenConfirm && (
                  <div role="dialog" aria-modal="true" aria-label="Confirm Open Project" className="absolute left-16 bottom-0 ml-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl p-3 z-[9999] animate-fade-in">
                      <p className="text-sm text-slate-800 dark:text-slate-200 font-bold mb-3">Open a new project?</p>
                      <div className="flex gap-2">
                          <button onClick={() => setShowOpenConfirm(false)} className="flex-1 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none">Cancel</button>
                          <button onClick={openProject} className="flex-1 py-1.5 text-xs font-medium bg-indigo-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 outline-none">Confirm</button>
                      </div>
                  </div>
              )}
          </div>
          <div className="relative group">
              <button aria-label="Toggle Theme" onClick={() => setIsDarkMode(!isDarkMode)} className="w-12 aspect-square flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors mt-2 focus:ring-2 focus:ring-indigo-500 outline-none">
                 {isDarkMode ? <Sun className="w-5 h-5" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
              </button>
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity shadow-sm z-50">
                  Toggle Theme
              </div>
          </div>
       </aside>

       {/* Static Panes for Explorer and Editor */}
       <div className="flex flex-1 min-w-0 overflow-hidden">
           <div className="w-64 flex flex-col bg-slate-50 dark:bg-[#0f1423] z-10 border-r border-slate-200 dark:border-slate-800 shrink-0">
               <div className="h-12 flex items-center px-4 font-bold text-xs tracking-wider text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800 shrink-0">
                   Explorer
               </div>
               <FileExplorer tree={fileTree} onToggleDir={handleToggleDir} onFileClick={handleFileClick} activePath={activeTabPath} />
           </div>

           <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-[#0B0F19]">
               {/* Tab Bar */}
               <div className="h-12 border-b border-slate-200 dark:border-slate-800 flex overflow-x-auto bg-slate-50 dark:bg-slate-900/50">
                   {openTabs.map(tab => (
                       <div 
                           key={tab.path}
                           onClick={() => setActiveTabPath(tab.path)}
                           className={cn(
                               "flex items-center gap-2 px-4 border-r border-slate-200 dark:border-slate-800 cursor-pointer min-w-0 group",
                               activeTabPath === tab.path ? "bg-white dark:bg-[#0B0F19] text-indigo-600 dark:text-indigo-400 border-t-2 border-t-indigo-500" : "text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50 border-t-2 border-t-transparent"
                           )}
                       >
                           <span className="truncate text-sm font-medium">{tab.handle.name}</span>
                           <button 
                               onClick={(e) => closeTab(tab.path, e)}
                               className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                           >
                               <X className="w-3 h-3" />
                           </button>
                       </div>
                   ))}
               </div>

               {/* Editor area */}
               {activeTab ? (
                   <Editor 
                       key={activeTab.path} 
                       ref={editorRef}
                       fileHandle={activeTab.handle} 
                       projectDirHandle={projectDirHandle} 
                       apiKeys={apiKeys} 
                       aiProvider={aiProvider} 
                       showToast={showToast} 
                       isAutoSaveEnabled={isAutoSaveEnabled} 
                       autoSwitchEnabled={autoSwitchEnabled}
                   />
               ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                       <div className="w-24 h-24 mb-6 opacity-20 dark:opacity-10">
                           <img src="./logo.png" alt="Logo" className="w-full h-full grayscale" />
                       </div>
                       <p>Select an HTML file from the explorer to begin.</p>
                   </div>
               )}
           </div>
       </div>

       {/* Settings Modal */}
       {isSettingsOpen && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-fade-in">
             <div className="glass-panel rounded-2xl p-6 w-full max-w-xl shadow-float flex flex-col max-h-[90vh] animate-slide-up">
                 <header className="flex justify-between items-center mb-6">
                     <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                         <Settings className="w-5 h-5" /> Settings
                     </h2>
                 </header>
                 <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8">
                     <section>
                         <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase mb-4 flex items-center gap-2"><Key className="w-4 h-4"/> API Keys</h3>
                         <div className="space-y-4">
                             {(Object.keys(PROVIDERS) as AIProvider[]).map(provider => (
                                 <div key={provider} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                     <div className="flex justify-between items-center mb-2">
                                         <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                             <img src={PROVIDERS[provider].iconSrc} className={cn("w-4 h-4", provider === 'anthropic' && "dark:invert")} alt={PROVIDERS[provider].name} />
                                             {PROVIDERS[provider].name}
                                         </label>
                                         <a href={PROVIDERS[provider].apiLink} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline flex items-center gap-1">Get Key <ExternalLink className="w-3 h-3"/></a>
                                     </div>
                                     <div className="flex gap-2">
                                         <input 
                                             type="password"
                                             value={tempApiKeys[provider] || ''}
                                             onChange={(e) => setTempApiKeys(prev => ({ ...prev, [provider]: e.target.value }))}
                                             placeholder={`Paste your ${PROVIDERS[provider].name} API key`}
                                             className="flex-1 p-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                         />
                                         <button onClick={() => saveApiKey(provider)} className="px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-colors">
                                             Save
                                         </button>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </section>
                     
                     <section>
                         <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase mb-4 flex items-center gap-2"><Settings className="w-4 h-4"/> Preferences</h3>

                         <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                             <div className="flex flex-col mr-4">
                                 <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">Auto-Switch on Quota Error</span>
                                 <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">If your active model runs out of quota (429), automatically switch to the next saved API key and continue generating.</span>
                                 {Object.values(apiKeys).filter(v => v.trim() !== '').length < 2 && (
                                     <span className="text-xs text-amber-500 mt-1 font-medium">Requires at least 2 API keys saved to enable.</span>
                                 )}
                             </div>
                             <button 
                                 disabled={Object.values(apiKeys).filter(v => v.trim() !== '').length < 2}
                                 onClick={() => setAutoSwitchEnabled(!autoSwitchEnabled)} 
                                 className={cn(
                                     "w-12 h-6 rounded-full transition-colors relative flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed", 
                                     autoSwitchEnabled && Object.values(apiKeys).filter(v => v.trim() !== '').length >= 2 ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                                 )}
                             >
                                 <div className={cn("w-4 h-4 bg-white rounded-full absolute top-1 transition-all", autoSwitchEnabled && Object.values(apiKeys).filter(v => v.trim() !== '').length >= 2 ? "left-7" : "left-1")}></div>
                             </button>
                         </div>

                         <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between mt-4">
                             <div className="flex flex-col mr-4">
                                 <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">Auto-Save every 5 minutes</span>
                                 <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">Automatically save the HTML file in the background.</span>
                             </div>
                             <button onClick={() => setIsAutoSaveEnabled(!isAutoSaveEnabled)} className={cn("w-12 h-6 rounded-full transition-colors relative flex-shrink-0", isAutoSaveEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")}>
                                 <div className={cn("w-4 h-4 bg-white rounded-full absolute top-1 transition-all", isAutoSaveEnabled ? "left-7" : "left-1")}></div>
                             </button>
                         </div>
                     </section>
                 </div>
                 <footer className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                     <button onClick={() => setIsSettingsOpen(false)} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Close</button>
                 </footer>
             </div>
         </div>
       )}

       {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-toast-in glass-panel px-6 py-4 rounded-xl shadow-float flex items-center gap-3">
              {toast.type === 'error' ? <Zap className="w-5 h-5 text-red-500" /> : toast.type === 'success' ? <Check className="w-5 h-5 text-emerald-500" /> : <Info className="w-5 h-5 text-indigo-500" />}
              <p className={cn("text-sm font-bold", toast.type === 'error' ? "text-red-500" : "text-slate-800 dark:text-slate-100")}>{toast.message}</p>
          </div>
       )}
    </div>
  );
}
