import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Zap, RotateCcw, Save, SkipForward, SkipBack } from 'lucide-react';
import { cn } from '../lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { resolveImagePath } from '../lib/fileSystem';
import { ProviderDropdown } from './ProviderDropdown';

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

function parseImages(html: string) {
  const imgRegex = /<img([^>]+)>/gi;
  const matches = [];
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

function updateHtmlWithAlt(html: string, img: any, newAlt: string): string {
  let newTag = img.fullTag;
  const escapedAlt = newAlt.replace(/"/g, '&quot;');
  if (newTag.match(/alt\s*=\s*(['"]).*?\1/i)) {
    newTag = newTag.replace(/(alt\s*=\s*(['"])).*?(\2)/i, `$1${escapedAlt}$3`);
  } else {
    newTag = newTag.replace(/\s*\/?>$/, ` alt="${escapedAlt}">`);
  }
  return html.substring(0, img.startIndex) + newTag + html.substring(img.endIndex);
}

const PROVIDERS: Record<string, any> = {
  gemini: { id: 'gemini', name: 'Google Gemini', iconSrc: './icons/gemini.svg?v=2' },
  openai: { id: 'openai', name: 'OpenAI ChatGPT', iconSrc: './icons/openai.svg?v=2' },
  anthropic: { id: 'anthropic', name: 'Anthropic Claude', iconSrc: './icons/anthropic.svg?v=2' }
};

interface EditorProps {
  fileHandle: any;
  projectDirHandle: any;
  apiKeys: any;
  aiProvider: string;
  showToast: (msg: string, type: 'info'|'success'|'error') => void;
  isAutoSaveEnabled: boolean;
  autoSwitchEnabled: boolean;
  onContentChange?: () => void;
}

export interface EditorRef {
  saveFile: () => Promise<void>;
  saveCopy: () => Promise<void>;
  restoreOriginal: () => void;
}

export const Editor = forwardRef<EditorRef, EditorProps>(({ fileHandle, projectDirHandle, apiKeys, aiProvider: defaultAiProvider, showToast, isAutoSaveEnabled, autoSwitchEnabled, onContentChange }, ref) => {
  const [htmlContent, setHtmlContent] = useState('');
  const [originalHtmlContent, setOriginalHtmlContent] = useState('');
  const [imagesArr, setImagesArr] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentImageFile, setCurrentImageFile] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState('');
  const [generatedAlt, setGeneratedAlt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorStatus, setErrorStatus] = useState('');
  const [localProvider, setLocalProvider] = useState(defaultAiProvider);

  useImperativeHandle(ref, () => ({
    saveFile: () => saveHtmlFile(false),
    saveCopy: async () => {
        try {
            const newHandle = await (window as any).showSaveFilePicker({
                suggestedName: fileHandle.name.replace('.html', '-copy.html'),
                types: [{ description: 'HTML Files', accept: { 'text/html': ['.html', '.htm'] } }]
            });
            const writable = await newHandle.createWritable();
            await writable.write(htmlContent);
            await writable.close();
            showToast("Copy saved successfully!", 'success');
        } catch (e) {
            showToast("Failed to save copy.", 'error');
        }
    },
    restoreOriginal: () => {
        setHtmlContent(originalHtmlContent);
        showToast("Restored file to its original state.", 'info');
    }
  }));

  useEffect(() => {
    const loadFile = async () => {
      const file = await fileHandle.getFile();
      const text = await file.text();
      setHtmlContent(text);
      setOriginalHtmlContent(text);
      setCurrentIndex(0);
    };
    loadFile();
  }, [fileHandle]);

  useEffect(() => {
    if (htmlContent) {
      setImagesArr(parseImages(htmlContent));
    }
  }, [htmlContent]);

  useEffect(() => {
    if (imagesArr.length > 0 && imagesArr[currentIndex]) {
      loadCurrentImage();
    }
  }, [currentIndex, imagesArr]); // eslint-disable-line

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
    
    let fileName = imgInfo.originalSrc;
    const file = await resolveImagePath(projectDirHandle, fileName);

    if (file) {
      setCurrentImageFile(file);
      const objUrl = URL.createObjectURL(file);
      setCurrentImageUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return objUrl;
      });
    } else {
      setCurrentImageFile(null);
      setCurrentImageUrl('');
      setErrorStatus('Image file not found in project directory.');
    }
  };

  const getNextAvailableProvider = (currentProvider: string) => {
      const providerIds = Object.keys(PROVIDERS);
      const currentIndex = providerIds.indexOf(currentProvider);
      
      for (let i = 1; i < providerIds.length; i++) {
          const nextIndex = (currentIndex + i) % providerIds.length;
          const nextProviderId = providerIds[nextIndex];
          if (apiKeys[nextProviderId]) {
              return nextProviderId;
          }
      }
      return null;
  };

  const attemptGenerationWithAutoSwitch = async (currentProvider: string, retryCount = 0) => {
      if (retryCount >= Object.keys(PROVIDERS).length) {
          showToast("All available AI providers failed or have exceeded quota.", 'error');
          setIsGenerating(false);
          return;
      }

      const activeKey = apiKeys[currentProvider];
      if (!currentImageFile) return;
      
      if (!activeKey) {
          // If no key for this provider, try auto-switching immediately if enabled
          if (autoSwitchEnabled) {
              const nextProvider = getNextAvailableProvider(currentProvider);
              if (nextProvider) {
                  setLocalProvider(nextProvider);
                  showToast(`Switched to ${PROVIDERS[nextProvider].name} automatically.`, 'info');
                  return attemptGenerationWithAutoSwitch(nextProvider, retryCount + 1);
              }
          }
          showToast(`Please provide a ${PROVIDERS[currentProvider].name} API Key in Settings`, 'error');
          setIsGenerating(false);
          return;
      }

      setIsGenerating(true);
      setErrorStatus('');
      
      try {
        const { data, mimeType } = await toBase64(currentImageFile);
        if (currentProvider === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: activeKey });
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [{ parts: [{ inlineData: { data, mimeType } }, { text: "Generate a short, concise, WCAG compliant alt text for this image. Output only the alt text." }] }],
            });
            setGeneratedAlt(response.text.trim());
        } else if (currentProvider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: [{ type: 'text', text: 'Generate a short, concise, WCAG compliant alt text for this image. Output only the alt text.' }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } }] }],
                    max_tokens: 100
                })
            });
            if (response.status === 429) {
                throw new Error("429");
            }
            const resData = await response.json();
            if (resData.error) throw new Error(resData.error.message);
            setGeneratedAlt(resData.choices[0].message.content.trim());
        } else if (currentProvider === 'anthropic') {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': activeKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 100,
                    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: data } }, { type: 'text', text: 'Generate a short, concise, WCAG compliant alt text for this image. Output only the alt text.' }] }]
                })
            });
            if (response.status === 429) {
                throw new Error("429");
            }
            const resData = await response.json();
            if (resData.error) throw new Error(resData.error.message);
            setGeneratedAlt(resData.content[0].text.trim());
        }
        setIsGenerating(false);
      } catch (e: any) {
        if (e.message?.includes('429') || e.status === 429 || e.message?.toLowerCase().includes('quota') || e.message?.toLowerCase().includes('rate limit')) {
            if (autoSwitchEnabled) {
                const nextProvider = getNextAvailableProvider(currentProvider);
                if (nextProvider) {
                    showToast(`${PROVIDERS[currentProvider].name} quota exceeded. Auto-switching to ${PROVIDERS[nextProvider].name}.`, 'info');
                    setLocalProvider(nextProvider);
                    return attemptGenerationWithAutoSwitch(nextProvider, retryCount + 1);
                } else {
                    showToast(`${PROVIDERS[currentProvider].name} quota exceeded. No other providers configured.`, 'error');
                }
            } else {
                showToast(`${PROVIDERS[currentProvider].name} quota exceeded. Enable Auto-Switch in Settings or change provider manually.`, 'error');
            }
        } else {
            showToast(e.message || "Failed to connect to AI provider.", 'error');
        }
        setIsGenerating(false);
      }
  };

  const generateAltText = () => {
      attemptGenerationWithAutoSwitch(localProvider, 0);
  };

  const configuredProviders = Object.entries(PROVIDERS).reduce((acc, [key, provider]) => {
      if (apiKeys[key] && apiKeys[key].trim() !== '') {
          acc[key] = provider;
      }
      return acc;
  }, {} as Record<string, any>);

  // Ensure localProvider is always valid if possible
  useEffect(() => {
      if (Object.keys(configuredProviders).length > 0 && !configuredProviders[localProvider]) {
          setLocalProvider(Object.keys(configuredProviders)[0]);
      }
  }, [apiKeys, localProvider, configuredProviders]);

  const saveHtmlFile = async (isAutoSave = false) => {
    try {
        const writable = await fileHandle.createWritable();
        await writable.write(htmlContent);
        await writable.close();
        if (!isAutoSave) showToast("File saved successfully!", 'success');
    } catch (e) {
        if (!isAutoSave) showToast("Failed to overwrite the file. You may need to grant file permissions.", 'error');
    }
  };

  useEffect(() => {
    if (!isAutoSaveEnabled || !fileHandle) return;
    const interval = setInterval(() => {
      saveHtmlFile(true);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAutoSaveEnabled, fileHandle, htmlContent]);

  const saveAlt = () => {
    if (!generatedAlt) {
      showToast("Please provide the alt text first.", 'error');
      return;
    }
    const currentImg = imagesArr[currentIndex];
    const newHtml = updateHtmlWithAlt(htmlContent, currentImg, generatedAlt);
    setHtmlContent(newHtml);
    if (onContentChange) onContentChange();
    setTimeout(() => {
        if (currentIndex < imagesArr.length - 1) setCurrentIndex(curr => curr + 1);
        else showToast("You have reached the end of the images!", 'info');
    }, 100);
  };
  
  const skipImage = () => {
      if (currentIndex < imagesArr.length - 1) setCurrentIndex(curr => curr + 1);
      else showToast("You have reached the end of the images!", 'info');
  };
  
  const backImage = () => {
      if (currentIndex > 0) setCurrentIndex(curr => curr - 1);
  };

  const renderCodeView = () => {
      const currentImg = imagesArr[currentIndex];
      if (!currentImg || !htmlContent) return null;
      const beforeStr = htmlContent.substring(0, currentImg.startIndex);
      const highlightStr = htmlContent.substring(currentImg.startIndex, currentImg.endIndex);
      const afterStr = htmlContent.substring(currentImg.endIndex);
      
      return (
          <div className="text-sm font-mono leading-relaxed p-4 h-full overflow-y-auto">
              <SyntaxHighlighter language="html" style={tomorrow} customStyle={{ margin: 0, padding: 0, background: 'transparent' }} wrapLines={true} wrapLongLines={true}>
                  {beforeStr}
              </SyntaxHighlighter>
              <div id="active-image-tag" className="bg-indigo-500/20 border-l-4 border-indigo-500 my-1 -mx-4 px-4 py-2 rounded-r animate-fade-in shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]">
                  <SyntaxHighlighter language="html" style={tomorrow} customStyle={{ margin: 0, padding: 0, background: 'transparent' }} wrapLines={true} wrapLongLines={true}>
                      {highlightStr}
                  </SyntaxHighlighter>
              </div>
              <SyntaxHighlighter language="html" style={tomorrow} customStyle={{ margin: 0, padding: 0, background: 'transparent' }} wrapLines={true} wrapLongLines={true}>
                  {afterStr}
              </SyntaxHighlighter>
          </div>
      );
  };

  useEffect(() => {
      const el = document.getElementById('active-image-tag');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentIndex]);

  return (
    <div className="flex-1 overflow-hidden bg-white dark:bg-slate-900 grid grid-cols-12 h-full">
      <section className="col-span-5 border-r border-slate-200 dark:border-slate-800 bg-[#1d1f21] overflow-hidden flex flex-col relative h-full">
          <div className="h-10 bg-[#151619] border-b border-black/20 flex items-center px-4 shrink-0 justify-between">
              <span className="text-xs font-medium text-slate-400 font-mono">{fileHandle.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{imagesArr.length} Images</span>
              </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
              {imagesArr.length > 0 ? renderCodeView() : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">No images found.</div>
              )}
          </div>
      </section>

      <aside className="col-span-7 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-900/50 p-6 relative h-full overflow-y-auto">
          {imagesArr.length > 0 ? (
              <>
                  <div className="flex-1 min-h-[250px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm mb-6 flex items-center justify-center p-4 relative overflow-hidden group">
                      {currentImageUrl ? (
                          <img src={currentImageUrl} alt="Preview" className="w-full h-full object-contain relative z-10" />
                      ) : (
                          <div className="text-center">
                              <p className="text-slate-500 text-sm mb-2">Image not found</p>
                              <p className="text-xs text-slate-400 font-mono">{imagesArr[currentIndex]?.originalSrc}</p>
                          </div>
                      )}
                  </div>
                  
                  <div className="shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                      <div className="flex justify-between items-end mb-4">
                          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Alt Text <span className="font-normal text-slate-500">(Edit manually or Generate with AI)</span></label>
                          <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2 w-48">
                                 <span className="text-xs font-medium text-slate-500">AI:</span>
                                 {Object.keys(configuredProviders).length > 0 ? (
                                     <ProviderDropdown 
                                         value={localProvider} 
                                         onChange={(val) => setLocalProvider(val)} 
                                         providers={configuredProviders} 
                                         className="w-full"
                                     />
                                 ) : (
                                     <span className="text-xs text-red-500 font-medium">No API Keys Configured</span>
                                 )}
                              </div>
                              <span className="text-xs font-mono text-slate-400">Image {currentIndex + 1} of {imagesArr.length}</span>
                          </div>
                      </div>
                      
                      <div className="flex gap-3 mb-4">
                          <textarea 
                              value={generatedAlt}
                              onChange={(e) => setGeneratedAlt(e.target.value)}
                              placeholder="Describe the image or generate with AI..."
                              className="flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none h-24"
                          />
                          <div className="flex flex-col gap-2">
                              <button onClick={generateAltText} disabled={isGenerating || !currentImageFile} className="btn-premium flex-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 px-4">
                                  {isGenerating ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                  Generate with AI
                              </button>
                              <button onClick={saveAlt} disabled={!generatedAlt || isGenerating} className="btn-premium flex-1 bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-400 px-4">
                                  <Save className="w-4 h-4" /> Update & Next
                              </button>
                          </div>
                      </div>
                      
                      <div className="flex gap-2">
                          <button onClick={backImage} disabled={currentIndex === 0} className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors flex items-center justify-center gap-2">
                              <SkipBack className="w-4 h-4" /> Back
                          </button>
                          <button onClick={skipImage} disabled={currentIndex === imagesArr.length - 1} className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors flex items-center justify-center gap-2">
                              Skip Image <SkipForward className="w-4 h-4" />
                          </button>
                      </div>
                  </div>
              </>
          ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">No images to process.</div>
          )}
      </aside>
    </div>
  );
});

export default Editor;
