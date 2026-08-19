import { apiClient } from '../../api/client';
import type { CurrentSubscription, PlanDef, SubscribeResponse } from './types';

export async function getPlans(): Promise<{ plans: PlanDef[]; current: CurrentSubscription | null }> {
  const res = await apiClient.get('/api/plans');
  return res.data;
}

export async function subscribeToPlan(planId: string): Promise<SubscribeResponse> {
  const res = await apiClient.post<SubscribeResponse>('/api/plans/subscribe', { plan: planId });
  return res.data;
}
