import { apiClient } from './client';
import type { Scenario, CreateScenarioDto } from './types';

export const getScenarios = () => apiClient.get<Scenario[]>('/api/scenarios');
export const createScenario = (dto: CreateScenarioDto) =>
  apiClient.post<Scenario>('/api/scenarios', dto);
export const updateScenario = (id: number, dto: Partial<CreateScenarioDto>) =>
  apiClient.put<Scenario>(`/api/scenarios/${id}`, dto);
export const deleteScenario = (id: number) =>
  apiClient.delete<void>(`/api/scenarios/${id}`);
export const toggleScenario = (id: number) =>
  apiClient.put<Scenario>(`/api/scenarios/${id}/toggle`, {});
