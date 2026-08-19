import { useQuery } from '@tanstack/react-query';

import * as jobsApi from '../api';

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: jobsApi.listJobs,
  });
}
