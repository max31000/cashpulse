import { apiClient } from './client';
import type { ImportPreviewResponse, ImportResultResponse } from './types';

export const previewImport = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.postMultipart<ImportPreviewResponse>('/api/import/csv/preview', formData);
};

export const importCsv = (
  file: File,
  mapping: Record<string, string>,
  accountId: number
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('columnMapping', JSON.stringify(mapping));
  formData.append('accountId', String(accountId));
  return apiClient.postMultipart<ImportResultResponse>('/api/import/csv', formData);
};
