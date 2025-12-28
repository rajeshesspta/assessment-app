import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  const navigate = useNavigate();

  return (
    <nav className={`flex items-center space-x-1 text-sm ${className}`} aria-label="Breadcrumb">
      <button
        onClick={() => navigate('/my-assessments')}
        className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors"
        aria-label="Go to My Assessments"
      >
        <Home className="h-4 w-4" />
        <span className="sr-only">Home</span>
      </button>

      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          <ChevronRight className="h-4 w-4 text-slate-400 mx-1" />
          {item.path && index < items.length - 1 ? (
            <button
              onClick={() => navigate(item.path!)}
              className="text-slate-500 hover:text-slate-700 transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-slate-900 font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}