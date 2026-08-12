import { useQuery } from '@tanstack/react-query';

import * as dubbingApi from '../api';
import { TERMINAL_JOB_STATUSES } from '../types';

const POLL_INTERVAL_MS = 2000; // matches frontend/hooks/useJobPolling.ts

// refetchIntervalInBackground defaults to false, so this automatically stops
// polling while the app is backgrounded (via the AppState->focusManager wiring
// in app/_layout.tsx) and refetches once on foreground — no extra code needed.
export function useDubbingJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => dubbingApi.getJob(jobId as string),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && TERMINAL_JOB_STATUSES.includes(status)) return false;
      return POLL_INTERVAL_MS;
    },
  });
}
