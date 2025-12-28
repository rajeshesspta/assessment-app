import { useState } from 'react';
import { Plus, FileText, Users, BookOpen } from 'lucide-react';
import { CreateItemModal } from './CreateItemModal';
import { CreateAssessmentModal } from './CreateAssessmentModal';
import { CreateCohortModal } from './CreateCohortModal';

interface ContentAuthorDashboardProps {
  api: any;
  brandPrimary?: string;
}

export function ContentAuthorDashboard({ api, brandPrimary }: ContentAuthorDashboardProps) {
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
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
        <p className="text-slate-600">Dashboard content coming in future iterations.</p>
      </div>

      <CreateItemModal
        isOpen={isCreateItemModalOpen}
        onClose={() => setIsCreateItemModalOpen(false)}
        api={api}
        onItemCreated={() => {
          setIsCreateItemModalOpen(false);
          // Optionally refresh data
        }}
      />

      <CreateAssessmentModal
        isOpen={isCreateAssessmentModalOpen}
        onClose={() => setIsCreateAssessmentModalOpen(false)}
        api={api}
        onAssessmentCreated={() => {
          setIsCreateAssessmentModalOpen(false);
          // Optionally refresh data
        }}
      />

      <CreateCohortModal
        isOpen={isCreateCohortModalOpen}
        onClose={() => setIsCreateCohortModalOpen(false)}
        api={api}
        onCohortCreated={() => {
          setIsCreateCohortModalOpen(false);
          // Optionally refresh data
        }}
      />
    </div>
  );
}