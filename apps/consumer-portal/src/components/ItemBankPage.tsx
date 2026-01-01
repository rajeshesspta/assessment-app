import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Filter, FileText, CheckCircle2, ListOrdered, Type, Hash, Image as ImageIcon, MousePointer2, Code, RefreshCw } from 'lucide-react';
import type { Item, ItemKind } from '../utils/api';
import { LoadingState } from './LoadingState';
import { CreateItemModal } from './CreateItemModal';
import { ItemPreview } from './ItemPreview';

interface ItemBankPageProps {
  api: any;
  brandPrimary?: string;
  brandLabelStyle?: React.CSSProperties;
}

const KIND_ICONS: Record<ItemKind, React.ReactNode> = {
  MCQ: <CheckCircle2 className="h-4 w-4" />,
  TRUE_FALSE: <CheckCircle2 className="h-4 w-4" />,
  FILL_IN_THE_BLANK: <Type className="h-4 w-4" />,
  MATCHING: <MousePointer2 className="h-4 w-4" />,
  ORDERING: <ListOrdered className="h-4 w-4" />,
  SHORT_ANSWER: <FileText className="h-4 w-4" />,
  ESSAY: <FileText className="h-4 w-4" />,
  NUMERIC_ENTRY: <Hash className="h-4 w-4" />,
  HOTSPOT: <ImageIcon className="h-4 w-4" />,
  DRAG_AND_DROP: <MousePointer2 className="h-4 w-4" />,
  SCENARIO_TASK: <Code className="h-4 w-4" />,
};

export function ItemBankPage({ api, brandPrimary, brandLabelStyle }: ItemBankPageProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterTag, setFilterTag] = useState<string>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [refreshAfterClose, setRefreshAfterClose] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchItems();
      setItems(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [api]);

  const handleSaveItem = async (itemData: any) => {
    if (editingItem) {
      await api.updateItem(editingItem.id, itemData);
    } else {
      await api.createItem(itemData);
    }
    setRefreshAfterClose(true);
  };

  const handleEditClick = (item: Item) => {
    setEditingItem(item);
    setIsCreateModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setEditingItem(null);
    if (refreshAfterClose) {
      void loadItems();
      setRefreshAfterClose(false);
    }
  };

  const allCategories = useMemo(() => {
    const categories = new Set<string>();
    items.forEach(item => {
      item.categories?.forEach(cat => categories.add(cat));
    });
    return Array.from(categories).sort();
  }, [items]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    items.forEach(item => {
      item.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Search filter
      if (search && !item.prompt.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      // Kind filter
      if (filterKind !== 'ALL' && item.kind !== filterKind) {
        return false;
      }
      // Category filter
      if (filterCategory !== 'ALL' && !item.categories?.includes(filterCategory)) {
        return false;
      }
      // Tag filter
      if (filterTag !== 'ALL' && !item.tags?.includes(filterTag)) {
        return false;
      }
      return true;
    });
  }, [items, search, filterKind, filterCategory, filterTag]);

  if (loading) {
    return <LoadingState label="Loading item bank..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Item Bank</h2>
          <p className="text-sm text-slate-500">Manage and reuse assessment content across your tenant.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void loadItems(); }}
            aria-label="Refresh items"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            style={{ backgroundColor: brandPrimary }}
          >
            <Plus className="h-4 w-4" />
            Create Item
          </button>
        </div>
      </div>

      <CreateItemModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveItem}
        initialItem={editingItem}
        brandPrimary={brandPrimary}
      />

      <ItemPreview
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        item={previewItem}
        brandPrimary={brandPrimary}
      />

      <div className="flex flex-col gap-4 rounded-2xl border border-brand-50 bg-white p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search items by prompt..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
            value={filterKind}
            onChange={e => setFilterKind(e.target.value as any)}
          >
            <option value="ALL">All Types</option>
            <option value="MCQ">Multiple Choice</option>
            <option value="TRUE_FALSE">True/False</option>
            <option value="FILL_IN_THE_BLANK">Fill in the Blank</option>
            <option value="MATCHING">Matching</option>
            <option value="ORDERING">Ordering</option>
            <option value="SHORT_ANSWER">Short Answer</option>
            <option value="ESSAY">Essay</option>
            <option value="NUMERIC_ENTRY">Numeric Entry</option>
            <option value="HOTSPOT">Hotspot</option>
            <option value="DRAG_AND_DROP">Drag & Drop</option>
            <option value="SCENARIO_TASK">Scenario Task</option>
          </select>
          {allCategories.length > 0 && (
            <select
              className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {allCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
          {allTags.length > 0 && (
            <select
              className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
              value={filterTag}
              onChange={e => setFilterTag(e.target.value)}
            >
              <option value="ALL">All Tags</option>
              {allTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <p className="text-sm font-semibold">Failed to load items</p>
          <p className="text-xs">{error}</p>
        </div>
      )}

      <div className="grid gap-4">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 py-12 text-center">
            <div className="rounded-full bg-slate-50 p-4 text-slate-400">
              <FileText className="h-8 w-8" />
            </div>
            <p className="mt-4 font-semibold text-slate-900">No items found</p>
            <p className="text-sm text-slate-500">Try adjusting your search or filters, or create a new item.</p>
          </div>
        ) : (
          filteredItems.map(item => (
            <div
              key={item.id}
              className="group flex items-center justify-between rounded-2xl border border-brand-50 bg-white p-4 transition hover:border-brand-200 hover:shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600" style={{ backgroundColor: `${brandPrimary}15`, color: brandPrimary }}>
                  {KIND_ICONS[item.kind]}
                </div>
                <div>
                  <p className="font-medium text-slate-900 line-clamp-1">{item.prompt}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold uppercase tracking-wider" style={brandLabelStyle}>{item.kind}</span>
                    {item.categories && item.categories.length > 0 && (
                      <>
                        <span>•</span>
                        <span>Categories: {item.categories.join(', ')}</span>
                      </>
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <>
                        <span>•</span>
                        <span>Tags: {item.tags.join(', ')}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>Updated {new Date(item.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewItem(item)}
                  className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => handleEditClick(item)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-600"
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
