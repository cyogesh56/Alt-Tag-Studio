import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface Provider {
    id: string;
    name: string;
    iconSrc: string;
}

interface ProviderDropdownProps {
    value: string;
    onChange: (id: string) => void;
    providers: Record<string, Provider>;
    className?: string;
}

export const ProviderDropdown: React.FC<ProviderDropdownProps> = ({ value, onChange, providers, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selected = providers[value];

    if (!selected) return null;

    return (
        <div ref={ref} className={cn("relative w-full", className)}>
            <div 
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-900 cursor-pointer flex items-center justify-between text-sm font-bold transition-colors shadow-sm"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2">
                    <img src={selected.iconSrc} alt={selected.name} className={cn("w-4 h-4", selected.id === 'anthropic' && "dark:invert")} />
                    <span>{selected.name}</span>
                </div>
                <ChevronDown className="w-4 h-4 opacity-50" />
            </div>
            {isOpen && (
                <div className="absolute z-[99] w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden py-1 animate-fade-in">
                    {Object.values(providers).map((p: any) => (
                        <div 
                            key={p.id}
                            className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium transition-colors"
                            onClick={() => { onChange(p.id); setIsOpen(false); }}
                        >
                            <img src={p.iconSrc} alt={p.name} className={cn("w-4 h-4", p.id === 'anthropic' && "dark:invert")} />
                            <span>{p.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
