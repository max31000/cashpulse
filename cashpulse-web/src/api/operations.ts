import { apiClient } from './client';
import type { PlannedOperation, CreateOperationDto, OperationFilter } from './types';

function buildQuery(filter: OperationFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.accountId != null) params.set('accountId', String(filter.accountId));
  if (filter.categoryId != null) params.set('categoryId', String(filter.categoryId));
  if (filter.tag) params.set('tag', filter.tag);
  if (filter.isConfirmed != null) params.set('isConfirmed', String(filter.isConfirmed));
  if (filter.scenarioId != null) params.set('scenarioId', String(filter.scenarioId));
  if (filter.offset != null) params.set('offset', String(filter.offset));
  if (filter.limit != null) params.set('limit', String(filter.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const getOperations = (filter: OperationFilter = {}) =>
  apiClient.get<PlannedOperation[]>(`/api/operations${buildQuery(filter)}`);

export const createOperation = (dto: CreateOperationDto) =>
  apiClient.post<PlannedOperation>('/api/operations', dto);

export const updateOperation = (id: number, dto: Partial<CreateOperationDto>) =>
  apiClient.put<PlannedOperation>(`/api/operations/${id}`, dto);

export const confirmOperation = (id: number) =>
  apiClient.post<{ id: number; isConfirmed: boolean }>(`/api/operations/${id}/confirm`);

export const deleteOperation = (id: number) =>
  apiClient.delete<void>(`/api/operations/${id}`);
