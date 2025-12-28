import { useState, useEffect, useMemo } from 'react';
import { AnalyticsBarChart } from './AnalyticsBarChart';
import { Plus, FileText, Users, BookOpen, CheckCircle2, ListOrdered, Type, Hash, Image as ImageIcon, MousePointer2, Code, Edit2, Eye, Upload } from 'lucide-react';
import { AssessmentPreviewModal } from './AssessmentPreviewModal';
import type { Item, ItemKind, Assessment, Cohort } from '../utils/api';
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
  // State for view modal (readonly assessment view)
  const [viewAssessment, setViewAssessment] = useState<Assessment | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewReadonly, setViewReadonly] = useState(true);
  const [loadingViewUpdate, setLoadingViewUpdate] = useState(false);
  const [recentItems, setRecentItems] = useState<Item[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'DRAFT' | 'PUBLISHED'>('ALL');
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [previewItem, setPreviewItem] = useState<Item | null>(null);

  // Assessments state
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(true);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loadingCohorts, setLoadingCohorts] = useState(true);

    // Assessment edit modal state
    const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
    // Publish approval modal state
    const [publishAssessment, setPublishAssessment] = useState<Assessment | null>(null);
    const [publishModalOpen, setPublishModalOpen] = useState(false);
    const [loadingPublish, setLoadingPublish] = useState(false);
    const [publishReadonly, setPublishReadonly] = useState(true);
    // Items for assessment preview/publish modal
    const [allItems, setAllItems] = useState<Item[]>([]);

    // Load all items for publish modal
    useEffect(() => {
      if ((!!publishAssessment || !!editingAssessment) && allItems.length === 0) {
        api.fetchItems().then(setAllItems).catch(() => {});
      }
    }, [api, publishAssessment, editingAssessment, allItems.length]);

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

    // Fetch assessments
    useEffect(() => {
      let ignore = false;
      setLoadingAssessments(true);
      setAssessmentError(null);
      api.fetchAssessments()
        .then((data: Assessment[]) => {
          if (!ignore) setAssessments(data);
        })
        .catch((err: Error) => {
          if (!ignore) setAssessmentError(err.message);
        })
        .finally(() => {
          if (!ignore) setLoadingAssessments(false);
        });
      return () => { ignore = true; };
    }, [api]);

    // Fetch cohorts (for cohort count per assessment)
    useEffect(() => {
      let ignore = false;
      setLoadingCohorts(true);
      api.fetchCohorts()
        .then((data: Cohort[]) => {
          if (!ignore) setCohorts(data);
        })
        .catch(() => {})
        .finally(() => {
          if (!ignore) setLoadingCohorts(false);
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

  // Helper: get top cohorts (by learner count)
  const topCohorts = [...cohorts]
    .sort((a, b) => (b.learnerIds?.length || 0) - (a.learnerIds?.length || 0))
    .slice(0, 4);

  // State for cohort details modal
  const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);
  const [cohortModalOpen, setCohortModalOpen] = useState(false);

  const handleCohortClick = (cohort: Cohort) => {
    setSelectedCohort(cohort);
    setCohortModalOpen(true);
  };

  const handleCloseCohortModal = () => {
    setCohortModalOpen(false);
    setSelectedCohort(null);
  };


  // --- Analytics Highlights Section ---
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoadingAnalytics(true);
    setAnalyticsError(null);
    // For now, fetch analytics for the first 3 assessments (or fewer)
    Promise.all(
      assessments.slice(0, 3).map(a =>
        api.fetchAssessmentAnalytics(a.id)
          .then(data => ({ ...data, assessmentTitle: a.title }))
          .catch(() => null)
      )
    )
      .then(results => {
        if (!ignore) setAnalytics(results.filter(Boolean));
      })
      .catch(err => {
        if (!ignore) setAnalyticsError(err.message);
      })
      .finally(() => {
        if (!ignore) setLoadingAnalytics(false);
      });
    return () => { ignore = true; };
  }, [api, assessments]);

  return (
    <div className="space-y-6">
      {/* Analytics Highlights Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Analytics Highlights</h2>
          <button
            className="text-xs px-3 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 transition"
            onClick={() => setShowChart(v => !v)}
          >
            {showChart ? 'Show Cards' : 'Show Chart'}
          </button>
        </div>
        {analyticsError ? (
          <div className="text-red-500">{analyticsError}</div>
        ) : showChart ? (
          <AnalyticsBarChart data={analytics} loading={loadingAnalytics} />
        ) : loadingAnalytics ? (
          <div className="text-slate-500">Loading analytics…</div>
        ) : analytics.length === 0 ? (
          <div className="text-slate-500">No analytics data available.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {analytics.map((a: any) => (
              <div key={a.assessmentId} className="rounded-xl border border-slate-100 bg-slate-50 p-4 flex flex-col gap-2 shadow-sm">
                <div className="font-bold text-slate-900 truncate" title={a.assessmentTitle}>{a.assessmentTitle || a.assessmentId}</div>
                <div className="text-sm text-slate-700">Attempts: <span className="font-semibold">{a.attemptCount ?? a.attempts ?? 0}</span></div>
                <div className="text-sm text-slate-700">Average Score: <span className="font-semibold">{typeof a.averageScore === 'number' ? a.averageScore.toFixed(2) : 'N/A'}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Cohorts Overview Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mt-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-500" /> Cohorts Overview
        </h2>
        {loadingCohorts ? (
          <div className="text-slate-500">Loading cohorts…</div>
        ) : topCohorts.length === 0 ? (
          <div className="text-slate-500">No cohorts found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {topCohorts.map((cohort: Cohort) => (
              <div
                key={cohort.id}
                className="rounded-xl border border-slate-100 bg-slate-50 p-4 flex flex-col gap-2 shadow-sm cursor-pointer hover:bg-slate-100 transition"
                onClick={() => handleCohortClick(cohort)}
                title="View cohort details"
              >
                <div className="font-bold text-slate-900 truncate" title={cohort.name}>{cohort.name}</div>
                {/* <div className="text-xs text-slate-600">{cohort.description}</div> */}
                <div className="flex items-center gap-3 mt-2">
                  <span className="inline-flex items-center gap-1 text-sm text-slate-700"><Users className="h-4 w-4" /> {cohort.learnerIds?.length || 0} Learners</span>
                  <span className="inline-flex items-center gap-1 text-sm text-slate-700"><BookOpen className="h-4 w-4" /> {cohort.assessmentIds?.length || 0} Assessments</span>
                </div>
              </div>
            ))}
                {/* Cohort Details Modal */}
                {cohortModalOpen && selectedCohort && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
                    <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-full">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-slate-900">Cohort Details</h3>
                        <button onClick={handleCloseCohortModal} className="text-slate-500 hover:text-slate-700 text-xl font-bold">×</button>
                      </div>
                      <div className="mb-2">
                        <span className="font-bold text-slate-900">{selectedCohort.name}</span>
                      </div>
                      <div className="mb-2 text-sm text-slate-700">
                        <span className="font-semibold">Learners:</span> {selectedCohort.learnerIds?.length || 0}
                      </div>
                      <div className="mb-2 text-sm text-slate-700">
                        <span className="font-semibold">Assessments:</span> {selectedCohort.assessmentIds?.length || 0}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button onClick={handleCloseCohortModal} className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-800">Close</button>
                      </div>
                    </div>
                  </div>
                )}
          </div>
        )}
      </div>
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


      {/* Assessments Overview Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Assessments Overview</h2>
          <div className="text-xs text-slate-600">Total Assessments: <span className="font-bold text-slate-900">{assessments.length}</span></div>
        </div>
        {loadingAssessments ? (
          <div className="text-slate-500">Loading…</div>
        ) : assessmentError ? (
          <div className="text-red-500">{assessmentError}</div>
        ) : assessments.length === 0 ? (
          <div className="text-slate-500">No assessments found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Title</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Items</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Cohorts</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assessments.slice(0, 8).map(a => {
                  // Count cohorts assigned to this assessment
                  const cohortCount = cohorts.filter(c => c.assessmentIds?.includes(a.id)).length;
                  return (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900 max-w-xs truncate" title={a.title}>{a.title}</td>
                      <td className="px-3 py-2">{a.itemIds.length}</td>
                      <td className="px-3 py-2">{loadingCohorts ? '…' : cohortCount}</td>
                      <td className="px-3 py-2 capitalize">{a.metadata?.status || 'draft'}</td>
                      <td className="px-3 py-2 flex gap-2">
                        <button
                          className="p-1 rounded hover:bg-slate-100 text-blue-600"
                          title="Edit"
                          onClick={() => setEditingAssessment(a)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          className={`p-1 rounded hover:bg-slate-100 text-green-600`}
                          title="Publish"
                          onClick={() => {
                            setPublishAssessment(a);
                            setPublishModalOpen(true);
                            setPublishReadonly(true);
                          }}
                        >
                          <Upload className="h-4 w-4" />
                        </button>
                        <button
                          className="p-1 rounded hover:bg-slate-100 text-slate-600"
                          title="View"
                          onClick={() => {
                            setViewAssessment(a);
                            setViewModalOpen(true);
                            setViewReadonly(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                            {/* View Assessment Modal (readonly, with edit toggle and update) */}
                            <CreateAssessmentModal
                              isOpen={viewModalOpen}
                              onClose={() => {
                                setViewModalOpen(false);
                                setViewAssessment(null);
                                setViewReadonly(true);
                              }}
                              onSave={async (assessmentData) => {
                                if (viewAssessment) {
                                  setLoadingViewUpdate(true);
                                  await api.updateAssessment(viewAssessment.id, assessmentData);
                                  setLoadingViewUpdate(false);
                                  setViewAssessment({ ...viewAssessment, ...assessmentData });
                                  setViewReadonly(true);
                                  setViewModalOpen(false);
                                  setLoadingAssessments(true);
                                  api.fetchAssessments()
                                    .then((data: Assessment[]) => setAssessments(data))
                                    .catch(() => {})
                                    .finally(() => setLoadingAssessments(false));
                                }
                              }}
                              api={api}
                              brandPrimary={brandPrimary}
                              initialAssessment={viewAssessment}
                              readonlyMode={viewReadonly}
                              loadingPublish={loadingViewUpdate}
                              onSwitchToEdit={() => setViewReadonly(false)}
                            />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
        isOpen={isCreateAssessmentModalOpen || !!editingAssessment}
        onClose={() => {
          setIsCreateAssessmentModalOpen(false);
          setEditingAssessment(null);
        }}
        onSave={async (assessmentData) => {
          if (editingAssessment) {
            await api.updateAssessment(editingAssessment.id, assessmentData);
            setEditingAssessment(null);
          } else {
            await api.createAssessment(assessmentData);
            setIsCreateAssessmentModalOpen(false);
          }
          // Refresh assessment list
          setLoadingAssessments(true);
          api.fetchAssessments()
            .then((data: Assessment[]) => setAssessments(data))
            .catch(() => {})
            .finally(() => setLoadingAssessments(false));
        }}
        api={api}
        brandPrimary={brandPrimary}
        initialAssessment={editingAssessment}
      />

      {/* Assessment Preview Modal for publish approval and view */}
      {/* Only show CreateAssessmentModal for publish approval, with readonly/edit toggle */}
      <CreateAssessmentModal
        isOpen={publishModalOpen}
        onClose={() => {
          setPublishModalOpen(false);
          setPublishAssessment(null);
          setPublishReadonly(true);
        }}
        onSave={async (assessmentData) => {
          if (publishAssessment) {
            setLoadingPublish(true);
            await api.updateAssessment(publishAssessment.id, assessmentData);
            setLoadingPublish(false);
            setPublishAssessment({ ...publishAssessment, ...assessmentData });
            setPublishReadonly(true);
            setPublishModalOpen(false);
            setLoadingAssessments(true);
            api.fetchAssessments()
              .then((data: Assessment[]) => setAssessments(data))
              .catch(() => {})
              .finally(() => setLoadingAssessments(false));
          }
        }}
        api={api}
        brandPrimary={brandPrimary}
        initialAssessment={publishAssessment}
        readonlyMode={publishReadonly}
        onPublish={async () => {
          if (!publishAssessment) return;
          setLoadingPublish(true);
          await api.updateAssessment(publishAssessment.id, { ...publishAssessment, metadata: { ...publishAssessment.metadata, status: 'published' } });
          setLoadingPublish(false);
          setPublishModalOpen(false);
          setPublishAssessment(null);
          setPublishReadonly(true);
          setLoadingAssessments(true);
          api.fetchAssessments()
            .then((data: Assessment[]) => setAssessments(data))
            .catch(() => {})
            .finally(() => setLoadingAssessments(false));
        }}
        loadingPublish={loadingPublish}
        onSwitchToEdit={() => setPublishReadonly(false)}
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