import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';

interface TagInputProps {
  predefinedTags: string[];
  allowCustom: boolean;
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  brandPrimary?: string;
}

export function TagInput({ predefinedTags, allowCustom, selectedTags, onChange, brandPrimary }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const availableTags = predefinedTags.filter(tag => !selectedTags.includes(tag));
  const filteredSuggestions = availableTags.filter(tag =>
    tag.toLowerCase().includes(inputValue.toLowerCase())
  );

  const addTag = (tag: string) => {
    if (tag.trim() && !selectedTags.includes(tag.trim())) {
      onChange([...selectedTags, tag.trim()]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(selectedTags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue.trim());
      }
    } else if (e.key === 'Backspace' && !inputValue && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowSuggestions(true);
  };

  const handleSuggestionClick = (tag: string) => {
    addTag(tag);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 min-h-[2.5rem] p-2 border border-slate-200 rounded-xl bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200/40">
        {selectedTags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-brand-100 text-brand-800 rounded-full"
            style={{ backgroundColor: `${brandPrimary}20`, color: brandPrimary }}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:bg-brand-200 rounded-full p-0.5"
              style={{ backgroundColor: 'transparent' }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={selectedTags.length === 0 ? "Add tags..." : ""}
          className="flex-1 min-w-[120px] border-none outline-none bg-transparent text-sm"
        />
      </div>

      {showSuggestions && (filteredSuggestions.length > 0 || (allowCustom && inputValue.trim())) && (
        <div className="relative">
          <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
            {filteredSuggestions.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => handleSuggestionClick(tag)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                <span className="font-medium text-brand-600" style={{ color: brandPrimary }}>{tag}</span>
                <span className="text-slate-500 ml-2">(predefined)</span>
              </button>
            ))}
            {allowCustom && inputValue.trim() && !predefinedTags.includes(inputValue.trim()) && (
              <button
                type="button"
                onClick={() => addTag(inputValue.trim())}
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none border-t border-slate-100"
              >
                <span className="font-medium text-slate-600">"{inputValue.trim()}"</span>
                <span className="text-slate-500 ml-2">(custom tag)</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {predefinedTags.length > 0 && `${predefinedTags.length} predefined tags available`}
          {predefinedTags.length > 0 && allowCustom && ' • '}
          {allowCustom && 'Custom tags allowed'}
        </span>
        <span>Press Enter to add</span>
      </div>
    </div>
  );
}