import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export function AnalyticsBarChart({ data, loading }: { data: any[]; loading: boolean }) {
  if (loading) return <div className="text-slate-500">Loading chart…</div>;
  if (!data || data.length === 0) return <div className="text-slate-500">No analytics data available.</div>;

  const chartData = {
    labels: data.map(a => a.assessmentTitle || a.assessmentId),
    datasets: [
      {
        label: 'Average Score',
        data: data.map(a => a.averageScore ?? 0),
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
      },
      {
        label: 'Attempts',
        data: data.map(a => a.attemptCount ?? a.attempts ?? 0),
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Assessment Analytics' },
    },
    scales: {
      y: { beginAtZero: true },
    },
  };

  return <Bar data={chartData} options={options} />;
}
