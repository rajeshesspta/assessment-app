import { X } from 'lucide-react';
import type { Assessment, Item } from '../utils/api';
import { AssessmentSnapshots } from './AssessmentSnapshots';

interface AssessmentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: Assessment | null;
  items: Item[];
  onEdit: () => void;
  onPublish: () => void;
  loadingPublish?: boolean;
  brandPrimary?: string;
}

export function AssessmentPreviewModal({ isOpen, onClose, assessment, items, onEdit, onPublish, loadingPublish, brandPrimary }: AssessmentPreviewModalProps) {
  if (!isOpen || !assessment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-xl font-bold text-slate-900">Assessment Preview</h3>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">{assessment.title}</div>
            <div className="text-slate-600 text-sm mb-2">{assessment.description}</div>
            <div className="text-xs text-slate-500 mb-2">Allowed Attempts: {assessment.allowedAttempts}</div>
            <div className="text-xs text-slate-500 mb-2">Items: {(assessment.itemSnapshotIds ?? assessment.itemIds ?? []).length}</div>
          </div>
          <div>
            <h4 className="font-semibold text-slate-800 mb-2">Items</h4>
            <ul className="space-y-2">
              {(assessment.itemSnapshotIds ?? assessment.itemIds ?? []).map((id, idx) => {
                const item = items.find(i => i.id === id);
                return (
                  <li key={id} className="border rounded p-3 bg-slate-50">
                    <div className="font-medium text-slate-900">{item?.prompt || 'Unknown Item'}</div>
                    <div className="text-xs text-slate-500">Type: {item?.kind}</div>
                  </li>
                );
              })}
            </ul>
          </div>
          <AssessmentSnapshots assessment={assessment} />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4 bg-slate-50">
          <button
            onClick={onEdit}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            style={{ backgroundColor: brandPrimary }}
          >
            Edit
          </button>
          <button
            onClick={onPublish}
            className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            style={{ backgroundColor: brandPrimary }}
            disabled={loadingPublish}
          >
            {loadingPublish ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
