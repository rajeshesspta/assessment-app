import { useState, useEffect, useMemo } from 'react';
import { Plus, FileText, Users, BookOpen, CheckCircle2, ListOrdered, Type, Hash, Image as ImageIcon, MousePointer2, Code } from 'lucide-react';
import type { Item, ItemKind } from '../utils/api';
import { CreateItemModal } from './CreateItemModal';
import { CreateAssessmentModal } from './CreateAssessmentModal';
import { CreateCohortModal } from './CreateCohortModal';

interface ContentAuthorDashboardProps {
  api: any;
  brandPrimary?: string;
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

export function ContentAuthorDashboard({ api, brandPrimary }: ContentAuthorDashboardProps) {
    const [recentItems, setRecentItems] = useState<Item[]>([]);
    const [loadingRecent, setLoadingRecent] = useState(true);
    const [recentError, setRecentError] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'DRAFT' | 'PUBLISHED'>('ALL');
    const [editingItem, setEditingItem] = useState<Item | null>(null);
    const [previewItem, setPreviewItem] = useState<Item | null>(null);

    useEffect(() => {
      let ignore = false;
      setLoadingRecent(true);
      setRecentError(null);
      api.fetchItems({ limit: 20 })
        .then((items: Item[]) => {
          if (!ignore) setRecentItems(items);
        })
        .catch((err: Error) => {
          if (!ignore) setRecentError(err.message);
        })
        .finally(() => {
          if (!ignore) setLoadingRecent(false);
        });
      return () => { ignore = true; };
    }, [api]);
  const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false);
  const [isCreateAssessmentModalOpen, setIsCreateAssessmentModalOpen] = useState(false);
  const [isCreateCohortModalOpen, setIsCreateCohortModalOpen] = useState(false);

  const handleCreateItem = () => {
    setIsCreateItemModalOpen(true);
  };

  const handleBuildAssessment = () => {
    setIsCreateAssessmentModalOpen(true);
  };

  const handleAddCohort = () => {
    setIsCreateCohortModalOpen(true);
  };

  // Filter logic: status is not in Item, so simulate with prompt prefix for demo
  const filteredItems = useMemo(() => {
    if (filterStatus === 'ALL') return recentItems.slice(0, 8);
    // Simulate: treat prompts containing 'draft' or 'published' as status
    return recentItems.filter(item => {
      if (filterStatus === 'DRAFT') return item.prompt.toLowerCase().includes('draft');
      if (filterStatus === 'PUBLISHED') return item.prompt.toLowerCase().includes('published');
      return true;
    }).slice(0, 8);
  }, [recentItems, filterStatus]);

  const handleEditClick = (item: Item) => {
    setEditingItem(item);
    setIsCreateItemModalOpen(true);
  };
  const handlePreviewClick = (item: Item) => {
    setPreviewItem(item);
  };

  const handleCloseModal = () => {
    setIsCreateItemModalOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleCreateItem}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            style={{ backgroundColor: brandPrimary }}
          >
            <Plus className="h-4 w-4" />
            Create New Item
          </button>
          <button
            onClick={handleBuildAssessment}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            style={{ backgroundColor: brandPrimary }}
          >
            <FileText className="h-4 w-4" />
            Build Assessment
          </button>
          <button
            onClick={handleAddCohort}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            style={{ backgroundColor: brandPrimary }}
          >
            <Users className="h-4 w-4" />
            Add Cohort
          </button>
        </div>
      </div>

      {/* Placeholder for other dashboard sections */}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Recent Items</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="recent-items-filter" className="text-xs text-slate-600">Status:</label>
            <select
              id="recent-items-filter"
              className="rounded border border-slate-200 bg-slate-50 py-1 px-2 text-xs focus:border-blue-500 focus:outline-none"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
            >
              <option value="ALL">All</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </div>
        </div>
        {loadingRecent ? (
          <div className="text-slate-500">Loading…</div>
        ) : recentError ? (
          <div className="text-red-500">{recentError}</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-slate-500">No items found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map(item => (
              <div key={item.id} className="border rounded-lg p-4 flex flex-col gap-2 bg-slate-50 hover:shadow transition">
                <div className="flex items-center gap-2 text-slate-700">
                  {KIND_ICONS[item.kind]}
                  <span className="font-medium">{item.kind.replace(/_/g, ' ')}</span>
                </div>
                <div className="font-semibold text-slate-900 truncate" title={item.prompt}>{item.prompt}</div>
                <div className="text-xs text-slate-500">Created: {new Date(item.createdAt).toLocaleDateString()}</div>
                <div className="flex gap-2 mt-2">
                  <button className="text-xs text-blue-600 hover:underline" title="Preview" onClick={() => handlePreviewClick(item)}>Preview</button>
                  <button className="text-xs text-slate-600 hover:underline" title="Edit" onClick={() => handleEditClick(item)}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      <CreateItemModal
        isOpen={isCreateItemModalOpen}
        onClose={handleCloseModal}
        onSave={async (itemData) => {
          if (editingItem) {
            await api.updateItem(editingItem.id, itemData);
          } else {
            await api.createItem(itemData);
          }
          setIsCreateItemModalOpen(false);
          setEditingItem(null);
          // Optionally refresh data
        }}
        initialItem={editingItem}
        brandPrimary={brandPrimary}
      />

      {/* Preview modal placeholder */}
      {/* <ItemPreview isOpen={!!previewItem} onClose={() => setPreviewItem(null)} item={previewItem} /> */}

      <CreateAssessmentModal
        isOpen={isCreateAssessmentModalOpen}
        onClose={() => setIsCreateAssessmentModalOpen(false)}
        onSave={async (assessmentData) => {
          await api.createAssessment(assessmentData);
          setIsCreateAssessmentModalOpen(false);
          // Optionally refresh data
        }}
        api={api}
        brandPrimary={brandPrimary}
      />

      <CreateCohortModal
        isOpen={isCreateCohortModalOpen}
        onClose={() => setIsCreateCohortModalOpen(false)}
        api={api}
        onCohortCreated={() => {
          setIsCreateCohortModalOpen(false);
          // Optionally refresh data
        }}
        brandPrimary={brandPrimary}
      />
    </div>
  );
}