import axios from 'axios';

import { API_URL } from '../config/env';
import { getStoredToken } from './tokenStorage';

// Centralized transport for every backend call the app makes. Feature
// modules (auth, dubbing, analysis — added from Phase 2 onward) build on top
// of this client rather than creating their own axios instances, matching
// frontend/lib/api.ts's apiClient pattern.
export const apiClient = axios.create({ baseURL: API_URL });

apiClient.interceptors.request.use(async (config) => {
  const token = await getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
