import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Upload, Folder, Check, Zap, RotateCcw, Save, SkipForward, SkipBack, Info, RefreshCcw, RefreshCw, ArrowRight, Sun, Moon, Key, ExternalLink } from 'lucide-react';
import { cn } from './lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

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

export default function App() {
  const [isLanding, setIsLanding] = useState(true);
  const [isStarted, setIsStarted] = useState(false);
  const [apiKey, setApiKey] = useState(process.env.GEMINI_API_KEY || '');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

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
                  generateAltFromGemini();
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

  const saveHtmlFile = async () => {
    if (htmlFileHandle && ('createWritable' in htmlFileHandle)) {
      try {
        const writable = await htmlFileHandle.createWritable();
        await writable.write(htmlContent);
        await writable.close();
        alert('File saved to disk successfully!');
        return;
      } catch (e) {
        console.error('API Save failed', e);
      }
    }
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = htmlFileName || 'updated_images.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const startProcessing = () => {
    if (!htmlContent || (!imagesDirHandle && fallbackImageFiles.length === 0)) {
      alert("Please select both HTML file and Image Folder");
      return;
    }
    const parsed = parseImages(htmlContent);
    if (parsed.length === 0) {
      alert("No <img> tags found in the provided HTML file.");
      return;
    }
    
    // Auto-create physical backup file as requested
    try {
        const blob = new Blob([originalHtmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = htmlFileName ? `${htmlFileName.replace('.html', '')}-backup.html` : 'backup.html';
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Backup download failed", e);
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

  const generateAltFromGemini = async () => {
    if (!currentImageFile) return;
    
    if (!apiKey) {
      alert("Please provide a Gemini API Key in the Workspace settings before generating.");
      return;
    }

    setIsGenerating(true);
    setErrorStatus('');
    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const { data, mimeType } = await toBase64(currentImageFile);
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { inlineData: { data, mimeType } },
              { text: "Generate a short, concise, WCAG compliant alt text for this image. Output only the alt text." }
            ]
          }
        ],
      });
      setGeneratedAlt(response.text.trim());
    } catch (e: any) {
      console.error(e);
      setErrorStatus(e.message || "Failed to connect to Gemini.");
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
      alert("Please provide the alt text first.");
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
        <div className="relative min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-900 dark:text-slate-100 font-sans">
          
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="absolute top-6 right-6 p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-800"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="max-w-4xl w-full flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 mb-4 shadow-sm">
                <Zap className="text-indigo-600 dark:text-indigo-400 w-8 h-8" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                  Alt-Tag Studio
              </h1>
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
      <div className="relative h-screen w-full bg-[#F8FAFC] dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-900 dark:text-slate-100 font-sans">
        
        <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="absolute top-6 right-6 p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-800"
            title="Toggle theme"
        >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm flex flex-col gap-8">
          <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
             <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20">
               <Zap className="text-indigo-600 dark:text-indigo-400 w-6 h-6" />
             </div>
             <div>
               <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-1">Alt-Tag Studio</h1>
               <p className="text-slate-500 dark:text-slate-400 text-sm">Automate WCAG-compliant alt texts with Gemini AI.</p>
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

            <div className="flex flex-col gap-2 mt-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Key className="w-4 h-4" /> Gemini API Key
                </label>
                <input 
                    type="password" 
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your Gemini API Key..."
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-slate-200"
                />
                <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 mt-1 transition-colors w-fit"
                >
                    Get a Gemini API Key here <ExternalLink className="w-3 h-3" />
                </a>
            </div>

            <button 
                disabled={!htmlContent || (!imagesDirHandle && fallbackImageFiles.length === 0) || !apiKey}
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
    <div className="flex flex-col h-screen w-full bg-[#F8FAFC] dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Header navbar */}
      <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between shadow-sm z-10 shrink-0">
         <div className="flex items-center gap-4">
             <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center">
               <Zap className="text-white w-5 h-5" />
             </div>
             <div>
                 <h1 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">Alt-Tag Studio</h1>
                 <p className="text-xs text-slate-500 dark:text-slate-400">Editing: <span className="font-mono">{htmlFileName || 'Current File'}</span> • Folder: <span className="font-mono">Images</span></p>
             </div>
         </div>
         
         <div className="flex items-center gap-3">
            <div className="flex items-center bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full border border-emerald-100 dark:border-emerald-500/20 text-xs font-medium mr-4">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>Gemini API Connected
            </div>

            <button onClick={restoreOriginal} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md text-sm font-semibold transition-colors">
                 Restore Backup
            </button>

            <button onClick={() => { setIsStarted(false); setIsLanding(true); setHtmlContent(''); setHtmlFileHandle(null); setImagesDirHandle(null); setFallbackImageFiles([]); }} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md text-sm font-semibold transition-colors">
                Workspace
            </button>

            <button onClick={saveHtmlFile} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white rounded-md text-sm font-semibold shadow-sm transition-all ml-1">
                 Save HTML File
            </button>

             <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 ml-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Toggle theme"
             >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
             </button>
         </div>
      </header>

      {/* Main Content Split */}
      <main className="flex-1 grid grid-cols-12 overflow-hidden">
          
          {/* Left Col: HTML View */}
          <aside className="col-span-5 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col pt-0">
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
          <section className="col-span-7 flex flex-col bg-white dark:bg-slate-900 overflow-hidden shadow-inner h-full">
              <div className="p-8 flex-1 flex flex-col gap-6 overflow-y-auto w-full">
                  
              {imagesArr[currentIndex] && (
                  <>
                      {/* Top Header logic for Right Col */}
                      <div className="flex items-center justify-between">
                          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                             Image Preview <span className="text-slate-400 dark:text-slate-500 font-normal ml-2 text-sm">({currentIndex + 1} of {imagesArr.length})</span>
                          </h2>
                          <div className="flex gap-2">
                             <button onClick={prevImage} disabled={currentIndex === 0} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                 <SkipBack className="w-5 h-5" />
                             </button>
                             <button onClick={nextImage} disabled={currentIndex === imagesArr.length - 1} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                 <SkipForward className="w-5 h-5" />
                             </button>
                          </div>
                      </div>

                      {/* Image Viewer */}
                      <div className="aspect-video w-full rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden group relative min-h-[300px]">
                          {currentImageUrl ? (
                              <img src={currentImageUrl} alt="Preview" className="w-full h-full object-contain" />
                          ) : (
                              <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-500">
                                  <Info className="w-8 h-8" />
                                  <span className="text-sm font-medium">{errorStatus || 'Loading Image...'}</span>
                              </div>
                          )}
                          
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 pointer-events-none"></div>

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
                               <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  Alt Text Definition
                                  {isGenerating && <RefreshCcw className="w-3 h-3 animate-spin text-indigo-500 dark:text-indigo-400" />}
                               </label>
                               <button 
                                   onClick={generateAltFromGemini}
                                   disabled={isGenerating || !currentImageFile}
                                   className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center disabled:opacity-50"
                                   title="Shortcut: Cmd/Ctrl + G"
                               >
                                  <RefreshCw className="w-3 h-3 mr-1" /> {generatedAlt ? 'Regenerate with AI' : 'Generate with AI'}
                                  <span className="ml-2 text-[10px] font-mono bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-500/20 hidden md:inline-block">⌘G</span>
                               </button>
                            </div>
                            
                            <textarea
                               value={generatedAlt}
                               onChange={e => setGeneratedAlt(e.target.value)}
                               placeholder={isGenerating ? "Generating concise description..." : "Type or generate alt text here..."}
                               className="w-full h-24 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-all outline-none leading-relaxed resize-none"
                            />
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
                      <button onClick={nextImage} title="Shortcut: Cmd/Ctrl + K" className="flex items-center gap-2 px-6 py-3 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-semibold text-sm transition-colors">
                          <SkipForward className="w-4 h-4" /> Skip Image
                          <span className="ml-1 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hidden md:inline-block">⌘K</span>
                      </button>
                      <div className="flex gap-3">
                          <button onClick={prevImage} title="Shortcut: Cmd/Ctrl + Left Arrow" disabled={currentIndex === 0} className="px-8 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm hover:border-slate-300 dark:hover:border-slate-600 transition-all disabled:opacity-50 flex items-center gap-2">
                              Back
                              <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hidden md:inline-block">⌘←</span>
                          </button>
                          <button onClick={saveAlt} title="Shortcut: Cmd/Ctrl + S" disabled={!generatedAlt || isGenerating || !currentImageFile} className="px-10 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 dark:hover:bg-indigo-400 transition-all disabled:opacity-50 flex items-center gap-2">
                              Update & Next
                              <span className="text-[10px] font-mono bg-indigo-500 dark:bg-indigo-600 text-indigo-100 px-1.5 py-0.5 rounded border border-indigo-400 dark:border-indigo-500 hidden md:inline-block">⌘S</span>
                          </button>
                      </div>
                  </footer>
              )}
          </section>
      </main>

      {/* Global Footer */}
      <footer className="h-12 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between text-[11px] font-medium text-slate-400 dark:text-slate-500 shrink-0">
         <div className="flex items-center gap-6">
            <div>IMAGES PROCESSED: <span className="text-slate-700 dark:text-slate-300">{completedCount} / {imagesArr.length}</span></div>
            <div className="w-48 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 dark:bg-indigo-400 transition-all duration-300" style={{ width: `${imagesArr.length > 0 ? (completedCount / imagesArr.length) * 100 : 0}%`}}></div>
            </div>
         </div>
         <div className="flex items-center gap-4">
             <span>API QUOTA: <span className="text-emerald-600 dark:text-emerald-400 underline">Available</span></span>
             <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>
             <span className="flex items-center"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-2"></span>Backup Saved upon start</span>
         </div>
      </footer>
    </div>
  );
}
