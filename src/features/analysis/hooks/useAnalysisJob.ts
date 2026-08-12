import { useQuery } from '@tanstack/react-query';

import * as analysisApi from '../api';
import { TERMINAL_ANALYSIS_STATUSES } from '../types';

const POLL_INTERVAL_MS = 2000; // matches frontend/hooks/useAnalysisPolling.ts

// Same foreground-only pausing as useDubbingJob, via the AppState->focusManager
// wiring in app/_layout.tsx.
export function useAnalysisJob(analysisId: string | undefined) {
  return useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: () => analysisApi.getAnalysis(analysisId as string),
    enabled: !!analysisId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && TERMINAL_ANALYSIS_STATUSES.includes(status)) return false;
      return POLL_INTERVAL_MS;
    },
  });
}
