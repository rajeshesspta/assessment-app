import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AttemptResult } from '../components/AttemptResult';

export default function AssessmentResultPage({ api, brandPrimary }: { api: any; brandPrimary?: string }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLatestAttempt() {
      try {
        // Fetch all attempts for the current user
        const attempts = await api.fetchAttempts();
        const filtered = attempts.filter((a: any) => a.assessmentId === id && a.status !== 'in_progress');
        if (filtered.length === 0) {
          setError('No completed attempt found for this assessment.');
        } else {
          // Show the most recent completed attempt
          setAttemptId(filtered.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0].id);
        }
      } catch (err) {
        setError('Failed to load attempt.');
      }
    }
    if (id) fetchLatestAttempt();
  }, [id, api]);

  if (error) return <div className="p-8 text-rose-600">{error}</div>;
  if (!attemptId) return <div className="p-8">Loading...</div>;

  return <AttemptResult attemptId={attemptId} api={api} brandPrimary={brandPrimary} onExit={() => navigate(-1)} />;
}
