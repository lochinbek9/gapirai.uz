import { apiClient } from '../../api/client';
import type { RequestResolutionResponse, ResolutionOption } from '../dubbing/types';
import type { LibraryAccessResponse, LibraryEligibleResponse, LibraryItem, PurchaseLibraryResponse } from './types';

export async function getLibrary(limit: number = 24, offset: number = 0): Promise<LibraryItem[]> {
  const res = await apiClient.get<LibraryItem[]>('/api/library', { params: { limit, offset } });
  return res.data;
}

export async function getLibraryAccess(): Promise<LibraryAccessResponse> {
  const res = await apiClient.get<LibraryAccessResponse>('/api/library/access');
  return res.data;
}

export async function getLibraryEligible(jobId: string): Promise<LibraryEligibleResponse> {
  const res = await apiClient.get<LibraryEligibleResponse>(`/api/library/${jobId}/eligible`);
  return res.data;
}

export async function purchaseLibraryAccess(): Promise<PurchaseLibraryResponse> {
  const res = await apiClient.post<PurchaseLibraryResponse>('/api/library/purchase');
  return res.data;
}

export async function purchaseLibraryAccessPayme(): Promise<PurchaseLibraryResponse> {
  const res = await apiClient.post<PurchaseLibraryResponse>('/api/payments/payme/initiate-library');
  return res.data;
}

// Library viewing uses its OWN resolution endpoints — availability is gated
// by the VIEWER's plan, not the video owner's (backend/api/routes.py:
// list_library_resolutions / request_library_resolution).
export async function getLibraryJobResolutions(jobId: string): Promise<{ resolutions: ResolutionOption[] }> {
  const res = await apiClient.get<{ resolutions: ResolutionOption[] }>(`/api/library/${jobId}/resolutions`);
  return res.data;
}

export async function requestLibraryResolution(jobId: string, resolution: string): Promise<RequestResolutionResponse> {
  const res = await apiClient.post<RequestResolutionResponse>(`/api/library/${jobId}/resolutions/${resolution}`);
  return res.data;
}
