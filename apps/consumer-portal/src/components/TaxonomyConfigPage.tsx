import { useEffect, useState } from 'react';
import { Settings, Save, AlertCircle } from 'lucide-react';
import { LoadingState } from './LoadingState';

interface TaxonomyConfigPageProps {
  api: any;
  brandPrimary?: string;
}

interface TaxonomyField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  allowedValues?: string[];
  description?: string;
}

interface TaxonomyConfig {
  categories: TaxonomyField;
  tags: TaxonomyField;
  metadata: Record<string, TaxonomyField>;
}

export function TaxonomyConfigPage({ api, brandPrimary }: TaxonomyConfigPageProps) {
  const [config, setConfig] = useState<TaxonomyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchTaxonomyConfig();
      setConfig(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [api]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.updateTaxonomyConfig(config);
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof TaxonomyConfig, key: string, value: any) => {
    if (!config) return;
    setConfig({
      ...config,
      [field]: {
        ...config[field],
        [key]: value,
      },
    });
  };

  if (loading) {
    return <LoadingState />;
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <Settings className="mx-auto h-12 w-12 mb-4" />
          <p>No taxonomy configuration found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Settings className="mr-2 h-6 w-6" />
          Taxonomy Configuration
        </h1>
        <p className="text-gray-600 mt-1">
          Configure the fields available for categorizing and tagging items in your tenant.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center">
          <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md flex items-center">
          <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
          <span className="text-green-700">Configuration saved successfully!</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Categories Field */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Categories</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={config.categories.type}
                onChange={(e) => updateField('categories', 'type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="string">String</option>
                <option value="array">Array</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Required</label>
              <input
                type="checkbox"
                checked={config.categories.required}
                onChange={(e) => updateField('categories', 'required', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={config.categories.description || ''}
              onChange={(e) => updateField('categories', 'description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>
        </div>

        {/* Tags Field */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={config.tags.type}
                onChange={(e) => updateField('tags', 'type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="string">String</option>
                <option value="array">Array</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Required</label>
              <input
                type="checkbox"
                checked={config.tags.required}
                onChange={(e) => updateField('tags', 'required', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={config.tags.description || ''}
              onChange={(e) => updateField('tags', 'description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>
        </div>

        {/* Metadata Fields */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Metadata Fields</h2>
          <p className="text-gray-600 mb-4">Additional custom fields for items.</p>
          {/* TODO: Add UI for managing metadata fields */}
          <div className="text-gray-500">
            Metadata configuration coming soon...
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          style={{ backgroundColor: brandPrimary }}
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}