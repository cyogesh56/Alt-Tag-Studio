import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Upload, Folder, Check, Zap, RotateCcw, Save, SkipForward, SkipBack, Info, RefreshCcw, RefreshCw, ArrowRight, Sun, Moon, Key, ExternalLink, Settings, ChevronDown, X, Copy } from 'lucide-react';
import { cn } from './lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

type AIProvider = 'gemini' | 'openai' | 'anthropic';

const PROVIDERS: Record<AIProvider, any> = {
  gemini: { id: 'gemini', name: 'Google Gemini', iconSrc: './icons/gemini.svg?v=2', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10', border: 'border-indigo-100 dark:border-indigo-500/20', apiLink: 'https://aistudio.google.com/app/apikey' },
  openai: { id: 'openai', name: 'OpenAI ChatGPT', iconSrc: './icons/openai.svg?v=2', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-100 dark:border-emerald-500/20', apiLink: 'https://platform.openai.com/api-keys' },
  anthropic: { id: 'anthropic', name: 'Anthropic Claude', iconSrc: './icons/anthropic.svg?v=2', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-100 dark:border-amber-500/20', apiLink: 'https://console.anthropic.com/settings/keys' },
};

interface ImgTag {
  id: string;
  startIndex: number;
  endIndex: number;
  fullTag: string;
  originalSrc: string | null;
  alt: string | null;
}

// Remove global AI instance since we'll recreate it per-request with the user's key
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function searchFileInDirectory(dirHandle: any, fileName: string): Promise<File | null> {
  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name === fileName) {
        return await entry.getFile();
      } else if (entry.kind === 'directory') {
        const found = await searchFileInDirectory(entry, fileName);
        if (found) return found;
      }
    }
  } catch (error) {
    console.error('Error searching directory', error);
  }
  return null;
}

function parseImages(html: string): ImgTag[] {
  const imgRegex = /<img([^>]+)>/gi;
  const matches: ImgTag[] = [];
  let match;
  let idCounter = 0;
  while ((match = imgRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const srcMatch = fullTag.match(/src\s*=\s*(['"])(.*?)\1/i);
    const altMatch = fullTag.match(/alt\s*=\s*(['"])(.*?)\1/i);

    matches.push({
      id: `img_${idCounter++}`,
      startIndex: match.index,
      endIndex: match.index + fullTag.length,
      fullTag: fullTag,
      originalSrc: srcMatch ? srcMatch[2] : null,
      alt: altMatch ? altMatch[2] : null,
    });
  }
  return matches;
}

function updateHtmlWithAlt(html: string, img: ImgTag, newAlt: string): string {
  let newTag = img.fullTag;
  const escapedAlt = newAlt.replace(/"/g, '&quot;');
  
  if (newTag.match(/alt\s*=\s*(['"]).*?\1/i)) {
    newTag = newTag.replace(/(alt\s*=\s*(['"])).*?(\2)/i, `$1${escapedAlt}$3`);
  } else {
    newTag = newTag.replace(/\s*\/?>$/, ` alt="${escapedAlt}">`);
  }
  
  return html.substring(0, img.startIndex) + newTag + html.substring(img.endIndex);
}

const toBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const mimeType = result.split(';')[0].split(':')[1];
      let data = result.replace(/^data:(.*,)?/, '');
      if ((data.length % 4) > 0) {
        data += '='.repeat(4 - (data.length % 4));
      }
      resolve({ data, mimeType });
    };
    reader.onerror = error => reject(error);
  });
};

const ScreenOverlay = () => (
  <div className="fixed inset-0 z-[999] bg-[#F8FAFC] dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center md:hidden">
      <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 mb-6 shadow-sm p-2 flex-shrink-0">
         <img src="./logo.png" alt="Alt-Tag Studio" className="w-full h-full object-contain" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-2">Screen Too Small</h2>
      <p className="text-slate-500 dark:text-slate-400 max-w-sm">
         Alt-Tag Studio requires a tablet or desktop size screen to provide the best editing experience. Please resize your browser window or open the app on a larger device.
      </p>
  </div>
);

export default function App() {
  const [isLanding, setIsLanding] = useState(true);
  const [isStarted, setIsStarted] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>('gemini');
  const [apiKeys, setApiKeys] = useState<Record<AIProvider, string>>({
    gemini: process.env.GEMINI_API_KEY || '',
    openai: '',
    anthropic: ''
  });
  const currentKey = apiKeys[aiProvider];
  const setKey = (val: string) => setApiKeys(prev => ({ ...prev, [aiProvider]: val }));

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempApiKeys, setTempApiKeys] = useState(apiKeys);
  const [saveStatus, setSaveStatus] = useState<Record<AIProvider, string>>({ gemini: '', openai: '', anthropic: '' });
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(false);
  const [quotaExceededProvider, setQuotaExceededProvider] = useState<AIProvider | null>(null);
  const [hasConfirmedOverwrite, setHasConfirmedOverwrite] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
  };

  const validKeysCount = Object.values(apiKeys).filter(k => k.length > 0).length;

  useEffect(() => {
     if (isSettingsOpen) setTempApiKeys(apiKeys);
  }, [isSettingsOpen, apiKeys]);

  const handleSaveKey = (provider: AIProvider) => {
      setApiKeys(prev => ({ ...prev, [provider]: tempApiKeys[provider] }));
      setSaveStatus(prev => ({ ...prev, [provider]: 'Saved!' }));
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [provider]: '' })), 2000);
      
      const newKeysCount = Object.values({ ...apiKeys, [provider]: tempApiKeys[provider] }).filter(k => k.length > 0).length;
      if (newKeysCount < 2) setAutoSwitchEnabled(false);
  }
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });
  
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(() => {
    const saved = localStorage.getItem('autoSave');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('autoSave', isAutoSaveEnabled.toString());
  }, [isAutoSaveEnabled]);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isHeaderDropdownOpen, setIsHeaderDropdownOpen] = useState(false);
  const headerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (headerDropdownRef.current && !headerDropdownRef.current.contains(event.target as Node)) {
        setIsHeaderDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);
  
  // File Handles & Fallbacks
  const [htmlFileHandle, setHtmlFileHandle] = useState<any>(null);
  const [htmlFileName, setHtmlFileName] = useState('');
  const [imagesDirHandle, setImagesDirHandle] = useState<any>(null);
  const [fallbackImageFiles, setFallbackImageFiles] = useState<File[]>([]);
  
  // State
  const [originalHtmlContent, setOriginalHtmlContent] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [imagesArr, setImagesArr] = useState<ImgTag[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Workspace UI
  const [currentImageFile, setCurrentImageFile] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState('');
  const [generatedAlt, setGeneratedAlt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorStatus, setErrorStatus] = useState('');
  
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  // Parse HTML when it changes to update tags, but maintain index
  useEffect(() => {
    if (htmlContent) {
      setImagesArr(parseImages(htmlContent));
    }
  }, [htmlContent]);

  useEffect(() => {
    if (isStarted && imagesArr.length > 0 && imagesArr[currentIndex]) {
      loadCurrentImage();
    }
  }, [currentIndex, isStarted, imagesArr]); // eslint-disable-line

  // Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (!isStarted) return;
          
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              if (generatedAlt && !isGenerating && currentImageFile) {
                  saveAlt();
              }
          } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
              e.preventDefault();
              nextImage();
          } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
              e.preventDefault();
              prevImage();
          } else if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
              e.preventDefault();
              if (!isGenerating && currentImageFile) {
                  generateAltText();
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStarted, generatedAlt, isGenerating, currentImageFile, currentIndex, imagesArr]); // dependencies for handlers


  const loadCurrentImage = async () => {
    const imgInfo = imagesArr[currentIndex];
    if (!imgInfo || !imgInfo.originalSrc) {
      setCurrentImageFile(null);
      setCurrentImageUrl('');
      setErrorStatus('No source path in image tag.');
      return;
    }
    
    setGeneratedAlt(imgInfo.alt || '');
    setErrorStatus('');
    let file = null;
    const fileName = imgInfo.originalSrc.split('/').pop() || '';

    if (imagesDirHandle) {
      try {
        const fileHandle = await imagesDirHandle.getFileHandle(fileName);
        file = await fileHandle.getFile();
      } catch (e) {
        file = await searchFileInDirectory(imagesDirHandle, fileName);
      }
    } else {
      file = fallbackImageFiles.find(f => f.name === fileName) || null;
    }

    if (file) {
      setCurrentImageFile(file);
      const objUrl = URL.createObjectURL(file);
      setCurrentImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objUrl;
      });
    } else {
      setCurrentImageFile(null);
      setCurrentImageUrl('');
      setErrorStatus(`Image "${fileName}" not found in folder.`);
    }
  };

  const handleHtmlPick = async () => {
    try {
      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'HTML Files', accept: { 'text/html': ['.html'] } }],
        });
        const file = await handle.getFile();
        const text = await file.text();
        setHtmlFileHandle(handle);
        setHtmlContent(text);
        setOriginalHtmlContent(text);
        setHtmlFileName(file.name);
        return;
      }
    } catch (e) {
      console.warn(e);
    }
    htmlInputRef.current?.click();
  };

  const handleHtmlFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const text = await file.text();
      setHtmlFileHandle(null);
      setHtmlContent(text);
      setOriginalHtmlContent(text);
      setHtmlFileName(file.name);
    }
  };

  const handleDirPick = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
        setImagesDirHandle(handle);
        setFallbackImageFiles([]);
        return;
      }
    } catch (e) {
      console.warn(e);
    }
    dirInputRef.current?.click();
  };

  const handleDirFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImagesDirHandle(null);
      setFallbackImageFiles(Array.from(e.target.files));
    }
  };

  const saveHtmlFile = async (isAutoSave = false) => {
    if (!htmlFileHandle || !('createWritable' in htmlFileHandle)) {
        if (!isAutoSave) showToast("Your browser does not support saving files directly. Please use 'Save Copy' instead.", 'error');
        return;
    }

    if (!hasConfirmedOverwrite && !isAutoSave) {
        const confirmed = confirm("Are you sure you want to overwrite the original HTML file? This will permanently append your alt text changes.");
        if (!confirmed) return;
        setHasConfirmedOverwrite(true);
    }

    try {
        const writable = await htmlFileHandle.createWritable();
        await writable.write(htmlContent);
        await writable.close();
    } catch (e) {
        console.error('API Save failed', e);
        if (!isAutoSave) showToast("Failed to overwrite the file. You may need to grant file permissions.", 'error');
    }
  };

  useEffect(() => {
    if (!isAutoSaveEnabled || !isStarted || !htmlFileHandle) return;
    
    const interval = setInterval(() => {
      saveHtmlFile(true);
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [isAutoSaveEnabled, isStarted, htmlFileHandle, htmlContent]);

  const saveCopyHtmlFile = () => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = htmlFileName ? `${htmlFileName.replace('.html', '')}-copy.html` : 'updated_images.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const startProcessing = () => {
    if (!htmlContent || (!imagesDirHandle && fallbackImageFiles.length === 0)) {
      showToast("Please select both HTML file and Image Folder", 'error');
      return;
    }
    const parsed = parseImages(htmlContent);
    if (parsed.length === 0) {
      showToast("No <img> tags found in the provided HTML file.", 'error');
      return;
    }

    setIsStarted(true);
    setCurrentIndex(0);
  };

  const restoreOriginal = () => {
    if(confirm("Are you sure you want to discard all changes and restore original HTML?")) {
      setHtmlContent(originalHtmlContent);
      setCurrentIndex(0);
    }
  };

  const generateAltText = async (overrideProvider?: AIProvider | any) => {
    const activeProvider = (typeof overrideProvider === 'string' ? overrideProvider : aiProvider) as AIProvider;
    const activeKey = apiKeys[activeProvider];

    if (!currentImageFile) return;
    
    if (!activeKey) {
      showToast(`Please provide a ${PROVIDERS[activeProvider].name} API Key in the Workspace settings before generating.`, 'error');
      return;
    }

    setIsGenerating(true);
    setErrorStatus('');
    try {
      const { data, mimeType } = await toBase64(currentImageFile);
      
      if (activeProvider === 'gemini') {
          const ai = new GoogleGenAI({ apiKey: activeKey });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ parts: [{ inlineData: { data, mimeType } }, { text: "Generate a short, concise, WCAG compliant alt text for this image. Output only the alt text." }] }],
          });
          setGeneratedAlt(response.text.trim());
      } else if (activeProvider === 'openai') {
          const openaiUrl = (import.meta as any).env.DEV ? '/api/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
          const response = await fetch(openaiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeKey}` },
              body: JSON.stringify({
                  model: 'gpt-4o-mini',
                  messages: [{ role: 'user', content: [{ type: 'text', text: 'Generate a short, concise, WCAG compliant alt text for this image. Output only the alt text.' }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } }] }],
                  max_tokens: 100
              })
          });
          const resData = await response.json();
          if (resData.error) throw new Error(resData.error.message);
          setGeneratedAlt(resData.choices[0].message.content.trim());
      } else if (activeProvider === 'anthropic') {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': activeKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
              body: JSON.stringify({
                  model: 'claude-3-haiku-20240307',
                  max_tokens: 100,
                  messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: data } }, { type: 'text', text: 'Generate a short, concise, WCAG compliant alt text for this image. Output only the alt text.' }] }]
              })
          });
          const resData = await response.json();
          if (resData.error) throw new Error(resData.error.message);
          setGeneratedAlt(resData.content[0].text.trim());
      }
    } catch (e: any) {
      console.error(e);
      const msg = (e.message || "Failed to connect to AI provider.").toLowerCase();
      if (msg.includes('quota') || msg.includes('429') || msg.includes('too many') || msg.includes('rate limit')) {
          if (autoSwitchEnabled) {
              setQuotaExceededProvider(activeProvider);
              setIsGenerating(false);
              return;
          }
      }
      setErrorStatus(msg);
    }
    setIsGenerating(false);
  };

  const nextImage = () => {
    if (currentIndex < imagesArr.length - 1) {
      setCurrentIndex(curr => curr + 1);
    } else {
      alert("You have reached the end of the images!");
    }
  };

  const prevImage = () => {
    if (currentIndex > 0) {
      setCurrentIndex(curr => curr - 1);
    }
  };

  const saveAlt = () => {
    if (!generatedAlt) {
      showToast("Please provide the alt text first.", 'error');
      return;
    }
    const currentImg = imagesArr[currentIndex];
    const newHtml = updateHtmlWithAlt(htmlContent, currentImg, generatedAlt);
    setHtmlContent(newHtml);
    setTimeout(() => {
        nextImage();
    }, 100);
  };

  // Render left column HTML with highlighting. 
  // Custom SyntaxHighlighter that lets us inject highlights
  const renderCodeView = () => {
      const currentImg = imagesArr[currentIndex];
      if (!currentImg || !htmlContent) return null;
      
      const beforeStr = htmlContent.substring(0, currentImg.startIndex);
      const highlightStr = htmlContent.substring(currentImg.startIndex, currentImg.endIndex);
      const afterStr = htmlContent.substring(currentImg.endIndex);
      
      const combinedLines = `${beforeStr}%%%HIGHLIGHT_START%%%${highlightStr}%%%HIGHLIGHT_END%%%${afterStr}`;
      
      return (
        <div className="flex-1 overflow-y-auto text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 font-mono p-6">
           {combinedLines.split('\n').map((line, i) => {
               if(line.includes('%%%HIGHLIGHT_START%%%')) {
                   const parts1 = line.split('%%%HIGHLIGHT_START%%%');
                   const parts2 = parts1[1].split('%%%HIGHLIGHT_END%%%');
                   return (
                       <div key={i} className="bg-indigo-50 dark:bg-indigo-900/40 border-l-4 border-indigo-500 text-slate-900 dark:text-slate-100 -mx-6 px-6 py-2 my-1" style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                           <span className="text-slate-500 dark:text-slate-400 opacity-70 dark:opacity-60">{parts1[0]}</span>
                           <span className="font-bold text-indigo-700 dark:text-indigo-300" id="highlighted-tag" ref={el => el?.scrollIntoView({ behavior: 'smooth', block: 'center'})}>{parts2[0]}</span>
                           <span className="text-slate-500 dark:text-slate-400 opacity-70 dark:opacity-60">{parts2[1]}</span>
                           <span className="text-indigo-400 dark:text-indigo-500 font-bold ml-4 underline text-[11px] uppercase tracking-wider whitespace-nowrap">← Currently editing</span>
                       </div>
                   );
               } else {
                   return <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
               }
           })}
        </div>
      );
  }

  const completedCount = imagesArr.filter(i => !!i.alt).length;

  if (isLanding) {
    return (
        <div className="relative min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] flex flex-col items-center justify-center p-6 text-slate-900 dark:text-slate-100 font-sans animate-fade-in">
          <ScreenOverlay />
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="absolute top-6 right-6 p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-800"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="max-w-4xl w-full flex flex-col items-center text-center gap-6">
              <div className="flex items-center justify-center gap-4 mb-2">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm p-1.5 flex-shrink-0">
                    <img src="./logo.png" alt="Alt-Tag Studio" className="w-full h-full object-contain" />
                  </div>
                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                      Alt-Tag Studio
                  </h1>
              </div>
              <p className="text-lg text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
                  Automate the tedious process of writing WCAG-compliant alt texts. 
                  Local file processing keeps your assets private, only sending required images to Gemini AI.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-8 text-left">
                   <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-start hover:shadow-md transition-shadow duration-300">
                       <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 font-bold border border-emerald-100 dark:border-emerald-500/20">1</div>
                       <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Select your HTML</h3>
                       <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">Pick a local HTML file with missing alt tags. We'll parse it instantly.</p>
                   </div>
                   <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-start hover:shadow-md transition-shadow duration-300">
                       <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 font-bold border border-blue-100 dark:border-blue-500/20">2</div>
                       <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Pick Image Folder</h3>
                       <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">Select the local folder containing your images. Files stay safely on disk.</p>
                   </div>
                   <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-start hover:shadow-md transition-shadow duration-300">
                       <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 font-bold border border-indigo-100 dark:border-indigo-500/20">3</div>
                       <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Generate & Save</h3>
                       <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">AI writes the alt text for each image. Click Update to inject it back into your HTML.</p>
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

  if (!isStarted) {
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
               <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-1">Alt-Tag Studio</h1>
               <p className="text-slate-500 dark:text-slate-400 text-sm">Automate WCAG-compliant alt texts with AI.</p>
             </div>
          </div>

          <div className="flex flex-col gap-4">
            <button 
                onClick={handleHtmlPick}
                className={cn(
                    "flex flex-col items-center p-6 border-2 border-dashed rounded-xl transition-colors", 
                    htmlContent ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100/50 dark:hover:bg-emerald-500/20" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                )}
            >
              <Upload className={cn("w-8 h-8 mb-3", htmlContent ? "text-emerald-500 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500")} />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{htmlContent ? htmlFileName : "Select HTML File"}</span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{htmlContent ? `${parseImages(htmlContent).length} images detected` : "HTML file containing <img> tags"}</p>
            </button>
            <input type="file" ref={htmlInputRef} accept=".html" className="hidden" onChange={handleHtmlFallback} />

            <button 
                onClick={handleDirPick}
                className={cn(
                    "flex flex-col items-center p-6 border-2 border-dashed rounded-xl transition-colors", 
                    (imagesDirHandle || fallbackImageFiles.length > 0) ? "border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100/50 dark:hover:bg-indigo-500/20" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                )}
            >
              <Folder className={cn("w-8 h-8 mb-3", (imagesDirHandle || fallbackImageFiles.length > 0) ? "text-indigo-500 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500")} />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{(imagesDirHandle || fallbackImageFiles.length > 0) ? "Images Folder Selected" : "Select Images Folder"}</span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{(fallbackImageFiles.length > 0) ? `${fallbackImageFiles.length} files loaded` : "Directory containing local image files"}</p>
            </button>
            {/* Standard webkitdirectory input */}
            <input type="file" ref={dirInputRef} {...{webkitdirectory: "true", directory: "true"} as any} className="hidden" onChange={handleDirFallback} />

            <div className="flex flex-col gap-4 mt-2">
                <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       AI Provider
                   </label>
                   <div className="relative w-full" ref={dropdownRef}>
                      <button 
                         onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                         className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 text-sm flex items-center justify-between transition-all dark:text-slate-200"
                      >
                         <span className="flex items-center gap-3 font-medium">
                            <img src={PROVIDERS[aiProvider].iconSrc} alt={PROVIDERS[aiProvider].name} className={cn("w-5 h-5 object-contain", aiProvider === 'anthropic' && "dark:invert")} />
                            {PROVIDERS[aiProvider].name}
                         </span>
                         <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", isDropdownOpen && "rotate-180")} />
                      </button>
                      
                      {isDropdownOpen && (
                         <div className="absolute z-50 top-full left-0 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                            {Object.values(PROVIDERS).map((provider) => (
                               <button 
                                  key={provider.id}
                                  onClick={() => { setAiProvider(provider.id as AIProvider); setIsDropdownOpen(false); }}
                                  className={cn("w-full text-left p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm dark:text-slate-200", aiProvider === provider.id && "bg-slate-50 dark:bg-slate-700 font-semibold")}
                               >
                                  <img src={provider.iconSrc} alt={provider.name} className={cn("w-5 h-5 object-contain", provider.id === 'anthropic' && "dark:invert")} />
                                  {provider.name}
                                  {aiProvider === provider.id && <Check className="w-4 h-4 ml-auto text-indigo-500" />}
                               </button>
                            ))}
                         </div>
                      )}
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       {PROVIDERS[aiProvider].name} API Key
                   </label>
                   <input 
                       type="password" 
                       value={currentKey}
                       onChange={(e) => setKey(e.target.value)}
                       placeholder={`Enter your ${PROVIDERS[aiProvider].name} API Key...`}
                       className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-slate-200"
                   />
                   <a 
                      href={
                         aiProvider === 'gemini' ? "https://aistudio.google.com/app/apikey" :
                         aiProvider === 'openai' ? "https://platform.openai.com/api-keys" :
                         "https://console.anthropic.com/settings/keys"
                      }
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 mt-1 w-fit"
                   >
                       Get an API Key here <ExternalLink className="w-3 h-3" />
                   </a>
                </div>
            </div>

            <button 
                disabled={!htmlContent || (!imagesDirHandle && fallbackImageFiles.length === 0) || !currentKey}
                onClick={startProcessing}
                className="mt-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white py-4 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
                <Zap className="w-4 h-4" /> Start Studio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] dark:bg-[#0B0F19] font-sans text-slate-900 dark:text-slate-100 overflow-hidden animate-fade-in">
       <ScreenOverlay />
       {/* Left Sidebar */}
       <aside className="w-16 flex flex-col items-center py-4 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 z-20">
           
           <nav className="flex-1 flex flex-col items-center gap-4 w-full mt-2">
               <button onClick={restoreOriginal} title="Restore Backup" aria-label="Restore Backup" className="p-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all group relative">
                   <RotateCcw className="w-5 h-5" />
                   <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Restore Backup</span>
               </button>
               <button onClick={() => saveHtmlFile(false)} title="Save HTML File" aria-label="Save HTML File" className="p-3 text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-all group relative">
                   <Save className="w-5 h-5" />
                   <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Overwrite HTML</span>
               </button>
               <button onClick={saveCopyHtmlFile} title="Save Copy" aria-label="Save Copy" className="p-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all group relative">
                   <Copy className="w-5 h-5" />
                   <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Save Copy</span>
               </button>
           </nav>
           
           <div className="flex flex-col gap-4">
               <button onClick={() => setIsDarkMode(!isDarkMode)} title="Toggle Theme" aria-label="Toggle Theme" className="p-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all group relative">
                   {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                   <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Toggle Theme</span>
               </button>
               <button onClick={() => setIsSettingsOpen(true)} title="Settings" aria-label="Settings" className="p-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all group relative">
                   <Settings className="w-5 h-5" />
                   <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Settings</span>
               </button>
           </div>
       </aside>

       {/* Main Content Container */}
       <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <header className="relative h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between shadow-sm z-50 shrink-0">
              <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm border border-slate-200 dark:border-slate-700 p-1 flex-shrink-0">
                      <img src="./logo.png" alt="Logo" className="w-full h-full object-contain" />
                  </div>
                  <div>
                      <h1 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100 leading-none mb-0.5">Alt-Tag Studio</h1>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Editing: <span className="font-mono">{htmlFileName || 'Current File'}</span> • Folder: <span className="font-mono">Images</span></p>
                  </div>
              </div>
              <div className="flex items-center gap-3">
                 <button onClick={() => { if(confirm("Are you sure you want to start over? All unsaved progress will be lost.")) { setIsStarted(false); setIsLanding(true); } }} className="px-4 py-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-sm font-semibold transition-colors bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md" aria-label="Start over">
                     Start Over
                 </button>
                 <div className="flex items-center gap-2 pr-2">
                     <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-xs font-medium shrink-0 shadow-sm">
                         <div className={cn("w-2 h-2 rounded-full shadow-sm", apiKeys[aiProvider]?.length > 0 ? "bg-emerald-500 shadow-emerald-500/50" : "bg-red-500 shadow-red-500/50")} />
                         <span className={apiKeys[aiProvider]?.length > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                             {apiKeys[aiProvider]?.length > 0 ? "Connected" : "Disconnected"}
                         </span>
                     </div>
                     <div className="relative" ref={headerDropdownRef}>
                         <button onClick={() => setIsHeaderDropdownOpen(!isHeaderDropdownOpen)} className="flex items-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium transition-colors shadow-sm" aria-live="polite">
                             <img src={PROVIDERS[aiProvider].iconSrc} alt="" className={cn("w-4 h-4 mr-2 object-contain", aiProvider === 'anthropic' && "dark:invert")} /> 
                             {PROVIDERS[aiProvider].name}
                             <ChevronDown className={cn("w-3 h-3 ml-2 text-slate-400 transition-transform", isHeaderDropdownOpen && "rotate-180")} />
                         </button>
                         {isHeaderDropdownOpen && (
                             <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden py-1">
                                 {Object.entries(apiKeys).filter(([_, key]) => key.length > 0).map(([id]) => {
                                     const provider = PROVIDERS[id as AIProvider];
                                     return (
                                         <button
                                             key={id}
                                             onClick={() => { setAiProvider(id as AIProvider); setIsHeaderDropdownOpen(false); }}
                                             className={cn("w-full px-4 py-2 text-left flex items-center text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors", aiProvider === id ? "bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold" : "text-slate-600 dark:text-slate-300 font-medium")}
                                         >
                                             <img src={provider.iconSrc} alt="" className={cn("w-4 h-4 mr-3 object-contain", id === 'anthropic' && "dark:invert")} />
                                             {provider.name}
                                         </button>
                                     );
                                 })}
                                 {Object.values(apiKeys).filter(k => k.length > 0).length === 0 && (
                                     <div className="px-4 py-3 text-xs text-slate-500 text-center">No API Keys saved.<br/>Go to Settings to add one.</div>
                                 )}
                             </div>
                         )}
                     </div>
                 </div>
              </div>
          </header>
          
          {/* Main Grid Content */}
          <main className="flex-1 grid grid-cols-12 overflow-hidden min-h-0">
          
          {/* Left Col: HTML View */}
          <aside className="col-span-5 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col pt-0 min-h-0">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                       HTML Source Code
                  </span>
                  <span className="text-[10px] bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded">
                      Auto-scrolling to current
                  </span>
              </div>
              
              {renderCodeView()}
          </aside>

          {/* Right Col: Editor */}
          <section className="col-span-7 flex flex-col bg-white dark:bg-slate-900 overflow-hidden shadow-inner h-full min-h-0">
              {imagesArr[currentIndex] && (
                  <header className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
                      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                         Image Preview <span className="text-slate-400 dark:text-slate-500 font-normal ml-2 text-sm" aria-live="polite">({currentIndex + 1} of {imagesArr.length})</span>
                      </h2>
                      <div className="flex items-center gap-4 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                          <div>IMAGES PROCESSED: <span className="text-slate-700 dark:text-slate-300">{completedCount} / {imagesArr.length}</span></div>
                          <div className="w-32 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 dark:bg-indigo-400 transition-all duration-300" style={{ width: `${imagesArr.length > 0 ? (completedCount / imagesArr.length) * 100 : 0}%`}}></div>
                          </div>
                      </div>
                  </header>
              )}

              <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto w-full">
                  
              {imagesArr[currentIndex] && (
                  <>
                      {/* Image Viewer */}
                      <div className="w-full h-64 md:h-80 xl:h-96 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden group relative flex-shrink-0">
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 pointer-events-none"></div>

                          {currentImageUrl ? (
                              <img src={currentImageUrl} alt="Preview" className="w-full h-full object-contain relative z-10" />
                          ) : (
                              <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-500 relative z-10">
                                  <Info className="w-8 h-8" />
                                  <span className="text-sm font-medium">{errorStatus || 'Loading Image...'}</span>
                              </div>
                          )}

                          {currentImageUrl && (
                              <div className="absolute bottom-4 left-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded font-mono z-10">
                                  {imagesArr[currentIndex].originalSrc}
                              </div>
                          )}
                      </div>

                      {/* AI Controls */}
                      {currentImageUrl && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                               <label htmlFor="alt-text-input" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  Alt Text Definition
                               </label>
                               <button 
                                   onClick={generateAltText}
                                   disabled={isGenerating || !currentImageFile}
                                   className="px-4 py-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 rounded-lg text-sm font-bold flex items-center disabled:opacity-50 transition-colors border border-indigo-200 dark:border-indigo-500/30"
                                   title="Shortcut: Cmd/Ctrl + G"
                                   aria-label="Generate alt text with AI"
                               >
                                  <RefreshCw className={cn("w-4 h-4 mr-2", isGenerating && "animate-spin")} aria-hidden="true" /> {generatedAlt ? 'Regenerate with AI' : 'Generate with AI'}
                                  <span className="ml-3 text-xs font-mono bg-white dark:bg-indigo-900/50 text-indigo-500 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-500/20 hidden md:inline-block" aria-hidden="true">⌘G</span>
                               </button>
                            </div>
                            
                            <textarea
                               id="alt-text-input"
                               value={generatedAlt}
                               onChange={e => setGeneratedAlt(e.target.value)}
                               placeholder={isGenerating ? "Generating concise description..." : "Type or generate alt text here..."}
                               className="w-full h-24 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-all outline-none leading-relaxed resize-none"
                               aria-label="Generated Alt Text"
                            />
                            {errorStatus && (
                                <div className="text-red-500 dark:text-red-400 text-xs font-medium bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 p-3 rounded-lg flex items-start gap-2">
                                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{errorStatus}</span>
                                </div>
                            )}
                        </div>
                      )}
                      
                      {!currentImageUrl && (
                           <div className="flex items-center justify-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-6 mt-4">
                              <span className="text-sm text-slate-500 dark:text-slate-400">
                                  Image not found. <button onClick={nextImage} className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Skip to next</button>
                              </span>
                           </div>
                      )}
                  </>
              )}
              </div>
              
              {/* Right Col Footer */}
              {imagesArr[currentIndex] && (
                  <footer className="flex items-center justify-between p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                      <button onClick={nextImage} title="Shortcut: Cmd/Ctrl + K" aria-label="Skip to next image" className="flex items-center gap-2 px-6 py-3 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-semibold text-sm transition-colors">
                          <SkipForward className="w-4 h-4" aria-hidden="true" /> Skip Image
                          <span className="ml-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hidden md:inline-block" aria-hidden="true">⌘K</span>
                      </button>
                      <div className="flex gap-3">
                          <button onClick={prevImage} title="Shortcut: Cmd/Ctrl + Left Arrow" aria-label="Go to previous image" disabled={currentIndex === 0} className="px-8 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm hover:border-slate-300 dark:hover:border-slate-600 transition-all disabled:opacity-50 flex items-center gap-2">
                              Back
                              <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hidden md:inline-block" aria-hidden="true">⌘←</span>
                          </button>
                          <button onClick={saveAlt} title="Shortcut: Cmd/Ctrl + S" aria-label="Update HTML and go to next image" disabled={!generatedAlt || isGenerating || !currentImageFile} className="px-10 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 dark:hover:bg-indigo-400 transition-all disabled:opacity-50 flex items-center gap-2">
                              Update & Next
                              <span className="text-xs font-mono bg-indigo-500 dark:bg-indigo-600 text-indigo-100 px-1.5 py-0.5 rounded border border-indigo-400 dark:border-indigo-500 hidden md:inline-block" aria-hidden="true">⌘S</span>
                          </button>
                      </div>
                  </footer>
              )}
          </section>
      </main>

      {/* Global Footer */}
      <footer className="h-12 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between text-[11px] font-medium text-slate-400 dark:text-slate-500 shrink-0">
         <div></div>
         <div className="flex items-center gap-4">
             <span>API QUOTA: <span className="text-emerald-600 dark:text-emerald-400 underline">Available</span></span>
             <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>
             <span className="flex items-center"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-2"></span>Backup Saved upon start</span>
         </div>
      </footer>
      
      {/* Modals */}
      {isSettingsOpen && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-fade-in">
             <div className="glass-panel rounded-2xl p-6 w-full max-w-xl shadow-float flex flex-col max-h-[90vh] animate-slide-up">
                 <header className="flex justify-between items-center mb-6">
                     <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                         <Settings className="w-5 h-5" /> Settings
                     </h2>
                     <button onClick={() => setIsSettingsOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                         <X className="w-5 h-5" />
                     </button>
                 </header>
                 
                 <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6">
                     <section className="flex flex-col gap-4">
                         <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">AI Providers</h3>
                         {(Object.keys(PROVIDERS) as AIProvider[]).map(provider => (
                             <div key={provider} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-3">
                                 <div className="flex items-center justify-between mb-1">
                                     <div className="flex items-center gap-2">
                                         <img src={PROVIDERS[provider].iconSrc} alt={PROVIDERS[provider].name} className={cn("w-5 h-5 object-contain", provider === 'anthropic' && "dark:invert")} />
                                         <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{PROVIDERS[provider].name}</h4>
                                     </div>
                                     {apiKeys[provider] && (
                                         <div className="flex items-center gap-2">
                                             <span className="flex items-center text-[10px] font-bold tracking-wider uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
                                                 <Zap className="w-3 h-3 mr-1" /> Connected
                                             </span>
                                             {quotaExceededProvider === provider ? (
                                                 <span className="flex items-center text-[10px] font-bold tracking-wider uppercase text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-full">
                                                     Quota: Exceeded
                                                 </span>
                                             ) : (
                                                 <span className="flex items-center text-[10px] font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                                                     Quota: Available
                                                 </span>
                                             )}
                                         </div>
                                     )}
                                 </div>
                                 <div className="flex items-center gap-3">
                                     <input 
                                         type="password" 
                                         value={tempApiKeys[provider]}
                                         onChange={(e) => setTempApiKeys(prev => ({ ...prev, [provider]: e.target.value }))}
                                         placeholder={`API Key...`}
                                         className="flex-1 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-slate-200"
                                     />
                                     <button 
                                         onClick={() => handleSaveKey(provider)}
                                         className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2 min-w-[90px] justify-center"
                                     >
                                         {saveStatus[provider] ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
                                     </button>
                                 </div>
                                 <a href={PROVIDERS[provider].apiLink} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-indigo-500 dark:text-indigo-400 hover:underline flex items-center gap-1 w-fit mt-1">
                                     Get a {PROVIDERS[provider].name} API key <ExternalLink className="w-3 h-3" />
                                 </a>
                             </div>
                         ))}
                     </section>
                     
                     <section className="flex flex-col gap-4 mb-4">
                         <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Advanced</h3>
                         <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                             <div className="flex flex-col mr-4">
                                 <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">Auto-Switch on Quota Exceeded</span>
                                 <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">Prompt to switch providers if one runs out of API quota. Requires 2+ API keys.</span>
                             </div>
                             <button 
                                 onClick={() => setAutoSwitchEnabled(!autoSwitchEnabled)}
                                 disabled={validKeysCount < 2}
                                 className={cn("w-12 h-6 rounded-full transition-colors relative flex-shrink-0", autoSwitchEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600", validKeysCount < 2 && "opacity-50 cursor-not-allowed")}
                             >
                                 <div className={cn("w-4 h-4 bg-white rounded-full absolute top-1 transition-all", autoSwitchEnabled ? "left-7" : "left-1")}></div>
                             </button>
                         </div>
                         <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between mt-4">
                             <div className="flex flex-col mr-4">
                                 <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">Auto-Save every 5 minutes</span>
                                 <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">Automatically save the HTML file in the background to prevent data loss.</span>
                             </div>
                             <button 
                                 onClick={() => setIsAutoSaveEnabled(!isAutoSaveEnabled)}
                                 className={cn("w-12 h-6 rounded-full transition-colors relative flex-shrink-0", isAutoSaveEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")}
                             >
                                 <div className={cn("w-4 h-4 bg-white rounded-full absolute top-1 transition-all", isAutoSaveEnabled ? "left-7" : "left-1")}></div>
                             </button>
                         </div>
                     </section>
                 </div>
             </div>
         </div>
      )}

      {quotaExceededProvider && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-fade-in">
             <div className="glass-panel rounded-2xl p-6 w-full max-w-md shadow-float animate-slide-up">
                 <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                     <Zap className="text-amber-500 w-5 h-5" /> Quota Exceeded
                 </h2>
                 <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                     Your API quota for <strong>{PROVIDERS[quotaExceededProvider].name}</strong> has been reached. Please select another provider to continue.
                 </p>
                 
                 <div className="flex flex-col gap-3">
                     {(Object.keys(PROVIDERS) as AIProvider[]).map(provider => {
                         if (provider === quotaExceededProvider) return null;
                         const hasKey = !!apiKeys[provider];
                         return (
                             <button 
                                 key={provider}
                                 disabled={!hasKey}
                                 onClick={() => {
                                     setAiProvider(provider);
                                     setQuotaExceededProvider(null);
                                     setTimeout(() => generateAltText(provider), 100); 
                                 }}
                                 className={cn("w-full p-4 rounded-xl border flex items-center gap-4 transition-all text-left", hasKey ? "border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 bg-slate-50 dark:bg-slate-800" : "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 opacity-50 cursor-not-allowed")}
                             >
                                 <img src={PROVIDERS[provider].iconSrc} alt={PROVIDERS[provider].name} className={cn("w-6 h-6 object-contain", provider === 'anthropic' && "dark:invert")} />
                                 <div className="flex-1">
                                     <div className="font-bold text-sm text-slate-800 dark:text-slate-200">{PROVIDERS[provider].name}</div>
                                     <div className="text-xs text-slate-500 dark:text-slate-400">{hasKey ? "Ready to use" : "No API key configured"}</div>
                                 </div>
                                 {hasKey && <ArrowRight className="w-4 h-4 text-slate-400" />}
                             </button>
                         )
                     })}
                 </div>
                 
                 <button onClick={() => setQuotaExceededProvider(null)} className="mt-6 w-full py-3 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                     Cancel
                 </button>
             </div>
         </div>
      )}
      {toast && (
          <div className={cn("fixed bottom-6 right-6 z-[9999] animate-toast-in glass-panel px-6 py-4 rounded-xl shadow-float flex items-center gap-3", toast.type === 'error' && "border-red-200 dark:border-red-900/50", toast.type === 'success' && "border-emerald-200 dark:border-emerald-900/50")}>
              {toast.type === 'error' ? <Zap className="w-5 h-5 text-red-500" /> : toast.type === 'success' ? <Check className="w-5 h-5 text-emerald-500" /> : <Info className="w-5 h-5 text-indigo-500" />}
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{toast.message}</p>
          </div>
      )}
      </div>
    </div>
  );
}
