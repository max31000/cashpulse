import { apiClient } from './client';
import type { Account, CreateAccountDto, CurrencyBalance } from './types';

export const getAccounts = () => apiClient.get<Account[]>('/api/accounts');
export const createAccount = (dto: CreateAccountDto) =>
  apiClient.post<Account>('/api/accounts', dto);
export const updateAccount = (id: number, dto: Partial<CreateAccountDto>) =>
  apiClient.put<Account>(`/api/accounts/${id}`, dto);
export const archiveAccount = (id: number) =>
  apiClient.delete<void>(`/api/accounts/${id}`);
// Backend expects [{ currency, amount }] — strip accountId before sending
export const updateBalances = (id: number, balances: CurrencyBalance[]) =>
  apiClient.put<Account>(`/api/accounts/${id}/balances`,
    balances.map(({ currency, amount }) => ({ currency, amount })));
