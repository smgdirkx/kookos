import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/lib/api";

type Tag = { id: string; name: string };

export function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: () => api("/api/tags"),
  });

  const suggestions = allTags
    .filter((t) => !value.includes(t.name))
    .filter((t) => !input || t.name.toLowerCase().includes(input.toLowerCase()));

  function addTag(name: string) {
    const trimmed = name.trim().toLowerCase();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeTag(name: string) {
    onChange(value.filter((t) => t !== name));
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 items-center">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-danger transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <div className="relative flex-1 min-w-[120px]">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                e.preventDefault();
                addTag(input);
              }
              if (e.key === "Backspace" && !input && value.length) {
                removeTag(value[value.length - 1]);
              }
            }}
            placeholder={value.length ? "Tag toevoegen..." : "Voeg tags toe..."}
            className="w-full text-sm py-1 px-2 bg-transparent outline-none placeholder:text-gray-400"
          />
          {open && (suggestions.length > 0 || input.trim()) && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
              {suggestions.slice(0, 8).map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(tag.name)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
                >
                  {tag.name}
                </button>
              ))}
              {input.trim() &&
                !allTags.some((t) => t.name.toLowerCase() === input.toLowerCase()) && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(input)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors text-primary"
                  >
                    <Plus size={12} className="inline mr-1" />"{input}" aanmaken
                  </button>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
