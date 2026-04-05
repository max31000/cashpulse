import { apiClient } from './client';
import type {
  IncomeSource,
  CreateIncomeSourceDto,
  GenerateOperationsRequest,
  GeneratePreviewResponse,
  ConfirmTrancheRequest,
} from './types';

export const getIncomeSources = () =>
  apiClient.get<IncomeSource[]>('/api/income-sources');

export const getIncomeSource = (id: number) =>
  apiClient.get<IncomeSource>(`/api/income-sources/${id}`);

export const createIncomeSource = (dto: CreateIncomeSourceDto) =>
  apiClient.post<IncomeSource>('/api/income-sources', dto);

export const updateIncomeSource = (id: number, dto: Partial<CreateIncomeSourceDto>) =>
  apiClient.put<IncomeSource>(`/api/income-sources/${id}`, dto);

export const deleteIncomeSource = (id: number) =>
  apiClient.delete<void>(`/api/income-sources/${id}`);

export const generateOperations = (id: number, req: GenerateOperationsRequest) =>
  apiClient.post<GeneratePreviewResponse | { created: number; skipped: number }>(
    `/api/income-sources/${id}/generate`,
    req,
  );

export const confirmTranche = (id: number, req: ConfirmTrancheRequest) =>
  apiClient.post<{ confirmed: number }>(`/api/income-sources/${id}/confirm-tranche`, req);

export const toggleIncomeSourceActive = (id: number, isActive: boolean) =>
  apiClient.put<IncomeSource>(`/api/income-sources/${id}`, { isActive });
