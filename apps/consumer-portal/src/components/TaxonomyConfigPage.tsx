import { useEffect, useState } from 'react';
import { Settings, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { LoadingState } from './LoadingState';
import { useTenantConfig } from '../context/TenantConfigContext';

interface TaxonomyConfigPageProps {
  api: any;
  brandPrimary?: string;
}


interface TaxonomyConfig {
  categories: {
    type: 'string' | 'array';
    required: boolean;
    description?: string;
    value?: string;
    values?: string[];
  };
  tags: {
    predefined: string[];
    allowCustom: boolean;
  };
  metadata: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object';
    required: boolean;
    allowedValues?: (string | number | boolean)[];
    description?: string;
  }>;
}

export function TaxonomyConfigPage({ api, brandPrimary }: TaxonomyConfigPageProps) {
  const [config, setConfig] = useState<TaxonomyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { refresh } = useTenantConfig();

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchTaxonomyConfig();
      // Normalize categories for UI
      let categoriesUI: any = { type: 'string', required: false, description: '', value: '', values: [] };
      if (Array.isArray(data.categories)) {
        categoriesUI = { type: 'array', required: false, description: '', values: data.categories };
      } else if (typeof data.categories === 'string') {
        categoriesUI = { type: 'string', required: false, description: '', value: data.categories };
      } else if (typeof data.categories === 'object' && data.categories) {
        categoriesUI = { ...data.categories };
      }
      setConfig({
        ...data,
        categories: categoriesUI,
        metadata: Array.isArray(data.metadataFields) ? data.metadataFields : [],
      });
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
    // Prepare config for backend
    let categories: any;
    if (config.categories.type === 'array') {
      categories = Array.isArray(config.categories.values) ? config.categories.values.filter(v => v.trim() !== '') : [];
    } else {
      categories = typeof config.categories.value === 'string' ? config.categories.value : '';
    }
    // Normalize metadata: filter out invalid fields
    const metadata = config.metadata.filter(field => field.key?.trim() && field.label?.trim());
    const payload = {
      ...config,
      categories,
      tags: config.tags,
      metadataFields: metadata,
    };
    try {
      console.log('Taxonomy config save payload:', payload);
      await api.updateTaxonomyConfig(payload);
      setSuccess(true);
      // Reload config to show updated metadata
      loadConfig();
      // Refresh tenant config to update taxonomy in other components
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };


  const updateCategoryField = (key: string, value: any) => {
    if (!config) return;
    setConfig({
      ...config,
      categories: {
        ...config.categories,
        [key]: value,
      },
    });
  };

  const updateTagsPredefined = (index: number, value: string) => {
    if (!config) return;
    const newPredefined = [...config.tags.predefined];
    newPredefined[index] = value;
    setConfig({
      ...config,
      tags: {
        ...config.tags,
        predefined: newPredefined,
      },
    });
  };

  const addTagPredefined = () => {
    if (!config) return;
    setConfig({
      ...config,
      tags: {
        ...config.tags,
        predefined: [...config.tags.predefined, ''],
      },
    });
  };

  const removeTagPredefined = (index: number) => {
    if (!config) return;
    const newPredefined = config.tags.predefined.filter((_, i) => i !== index);
    setConfig({
      ...config,
      tags: {
        ...config.tags,
        predefined: newPredefined,
      },
    });
  };

  const updateTagsAllowCustom = (value: boolean) => {
    if (!config) return;
    setConfig({
      ...config,
      tags: {
        ...config.tags,
        allowCustom: value,
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
                onChange={(e) => updateCategoryField('type', e.target.value)}
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
                onChange={(e) => updateCategoryField('required', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={config.categories.description || ''}
              onChange={(e) => updateCategoryField('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>

          {/* Array input for categories if type is 'array' */}
          {config.categories.type === 'array' && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Category Values</label>
              {(Array.isArray(config.categories.values) ? config.categories.values : []).map((cat: string, idx: number) => (
                <div key={idx} className="flex items-center mb-2">
                  <input
                    type="text"
                    value={cat}
                    onChange={e => {
                      const newValues = [...(config.categories.values || [])];
                      newValues[idx] = e.target.value;
                      updateCategoryField('values', newValues);
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Category #${idx + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newValues = (config.categories.values || []).filter((_: string, i: number) => i !== idx);
                      updateCategoryField('values', newValues);
                    }}
                    className="ml-2 px-2 py-1 text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const newValues = Array.isArray(config.categories.values) ? [...config.categories.values, ''] : [''];
                  updateCategoryField('values', newValues);
                }}
                className="mt-2 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                Add Category Value
              </button>
            </div>
          )}
        </div>


        {/* Tags Field (new format) */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Predefined Tags</label>
            {config.tags.predefined.length === 0 && (
              <div className="text-gray-400 text-sm mb-2">No predefined tags. Add one below.</div>
            )}
            {config.tags.predefined.map((tag, idx) => (
              <div key={idx} className="flex items-center mb-2">
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => updateTagsPredefined(idx, e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Tag #${idx + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeTagPredefined(idx)}
                  className="ml-2 px-2 py-1 text-xs text-red-600 hover:underline"
                  aria-label="Remove tag"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addTagPredefined}
              className="mt-2 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              Add Tag
            </button>
          </div>
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Allow Custom Tags</label>
            <input
              type="checkbox"
              checked={config.tags.allowCustom}
              onChange={(e) => updateTagsAllowCustom(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-gray-600 text-sm">Allow users to add their own tags</span>
          </div>
        </div>

        {/* Metadata Fields */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Metadata Fields</h2>
          <p className="text-gray-600 mb-4">Additional custom fields for items.</p>
          <div className="space-y-4">
            {config.metadata.length === 0 && (
              <div className="text-gray-400 text-sm mb-2">No metadata fields defined.</div>
            )}
            {config.metadata.map((field, idx) => (
              <div key={idx} className="border rounded p-4 mb-2 bg-gray-50">
                <div className="flex flex-wrap gap-4 mb-2">
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Key</label>
                    <input
                      type="text"
                      value={field.key || ''}
                      onChange={e => {
                        const newMeta = [...config.metadata];
                        newMeta[idx] = { ...field, key: e.target.value };
                        setConfig({ ...config, metadata: newMeta });
                      }}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
                    <input
                      type="text"
                      value={field.label || ''}
                      onChange={e => {
                        const newMeta = [...config.metadata];
                        newMeta[idx] = { ...field, label: e.target.value };
                        setConfig({ ...config, metadata: newMeta });
                      }}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={field.type}
                      onChange={e => {
                        const newMeta = [...config.metadata];
                        newMeta[idx] = { ...field, type: e.target.value as any };
                        setConfig({ ...config, metadata: newMeta });
                      }}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="enum">Enum</option>
                      <option value="array">Array</option>
                      <option value="object">Object</option>
                    </select>
                  </div>
                  <div className="flex items-center min-w-[100px]">
                    <label className="block text-xs font-medium text-gray-700 mr-2">Required</label>
                    <input
                      type="checkbox"
                      checked={!!field.required}
                      onChange={e => {
                        const newMeta = [...config.metadata];
                        newMeta[idx] = { ...field, required: e.target.checked };
                        setConfig({ ...config, metadata: newMeta });
                      }}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newMeta = config.metadata.filter((_, i) => i !== idx);
                      setConfig({ ...config, metadata: newMeta });
                    }}
                    className="ml-2 px-2 py-1 text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Allowed Values (comma separated, for enum/array)</label>
                    <input
                      type="text"
                      value={Array.isArray(field.allowedValues) ? field.allowedValues.join(',') : ''}
                      onChange={e => {
                        const newMeta = [...config.metadata];
                        newMeta[idx] = {
                          ...field,
                          allowedValues: e.target.value.split(',').map(v => v.trim()).filter(Boolean),
                        };
                        setConfig({ ...config, metadata: newMeta });
                      }}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={field.description || ''}
                      onChange={e => {
                        const newMeta = [...config.metadata];
                        newMeta[idx] = { ...field, description: e.target.value };
                        setConfig({ ...config, metadata: newMeta });
                      }}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setConfig({
                  ...config,
                  metadata: [
                    ...config.metadata,
                    {
                      key: '',
                      label: '',
                      type: 'string',
                      required: false,
                      allowedValues: [],
                      description: '',
                    },
                  ],
                });
              }}
              className="mt-2 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              Add Metadata Field
            </button>
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