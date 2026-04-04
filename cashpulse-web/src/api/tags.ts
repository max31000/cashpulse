import { apiClient } from './client';
import type { TagSummary } from './types';

export const getTagsSummary = () => apiClient.get<TagSummary[]>('/api/tags/summary');
