import { apiClient } from './client';
import type { Category, CreateCategoryDto } from './types';

export const getCategories = () => apiClient.get<Category[]>('/api/categories');
export const createCategory = (dto: CreateCategoryDto) =>
  apiClient.post<Category>('/api/categories', dto);
export const updateCategory = (id: number, dto: Partial<CreateCategoryDto>) =>
  apiClient.put<Category>(`/api/categories/${id}`, dto);
export const deleteCategory = (id: number) =>
  apiClient.delete<void>(`/api/categories/${id}`);
