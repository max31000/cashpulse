import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { OperationForm } from './OperationForm';
import type { Account, Category, Scenario, PlannedOperation } from '../../api/types';

// --- mocks -----------------------------------------------------------

vi.mock('@mantine/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/notifications')>();
  return {
    ...actual,
    notifications: { show: vi.fn() },
  };
});

vi.mock('../../api/operations', () => ({
  createOperation: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    accountId: 1,
    amount: 1000,
    currency: 'RUB',
    isConfirmed: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }),
  updateOperation: vi.fn().mockResolvedValue({
    id: 42,
    userId: 1,
    accountId: 1,
    amount: 1000,
    currency: 'RUB',
    isConfirmed: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }),
}));

// --- fixtures --------------------------------------------------------

const defaultAccount: Account = {
  id: 1,
  userId: 1,
  name: 'Основной',
  type: 'debit',
  isArchived: false,
  sortOrder: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  balances: [{ accountId: 1, currency: 'RUB', amount: 50000 }],
};

const defaultCategory: Category = {
  id: 1,
  userId: 1,
  name: 'Еда',
  isSystem: false,
  sortOrder: 0,
};

const defaultScenario: Scenario = {
  id: 1,
  userId: 1,
  name: 'Оптимистичный',
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
};

const defaultProps = {
  opened: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  accounts: [defaultAccount],
  categories: [defaultCategory],
  scenarios: [defaultScenario],
};

function renderForm(props: Partial<typeof defaultProps> & { initialValues?: Partial<PlannedOperation> } = {}) {
  const merged = { ...defaultProps, ...props };
  return render(
    <MantineProvider>
      <Notifications />
      <OperationForm {...merged} />
    </MantineProvider>
  );
}

// --- tests -----------------------------------------------------------

describe('OperationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders_form_fields', () => {
    renderForm();

    // Mantine Modal title
    expect(screen.getByText('Новая операция')).toBeInTheDocument();

    // Segmented control with income/expense
    expect(screen.getByText('Доход')).toBeInTheDocument();
    expect(screen.getByText('Расход')).toBeInTheDocument();

    // Key labels
    expect(screen.getByText('Сумма')).toBeInTheDocument();
    expect(screen.getByText('Валюта')).toBeInTheDocument();
    expect(screen.getByText('Счёт')).toBeInTheDocument();
    expect(screen.getByText('Категория')).toBeInTheDocument();
    expect(screen.getByText('Теги')).toBeInTheDocument();
    expect(screen.getByText('Описание')).toBeInTheDocument();

    // Action buttons
    expect(screen.getByRole('button', { name: /Сохранить/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Отмена/i })).toBeInTheDocument();
  });

  it('shows_isConfirmed_switch_only_on_create — switch absent when editing', () => {
    // Edit mode: initialValues has an id
    const editValues: Partial<PlannedOperation> = {
      id: 42,
      accountId: 1,
      amount: 1000,
      currency: 'RUB',
      isConfirmed: true,
      operationDate: '2024-01-01',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      userId: 1,
    };

    renderForm({ initialValues: editValues });

    // In edit mode the modal title changes
    expect(screen.getByText('Редактировать операцию')).toBeInTheDocument();

    // "Сразу подтвердить" switch must NOT be present
    expect(screen.queryByText('Сразу подтвердить')).not.toBeInTheDocument();
  });

  it('shows_isConfirmed_switch_on_create', () => {
    // Create mode: no initialValues
    renderForm();

    expect(screen.getByText('Сразу подтвердить')).toBeInTheDocument();
  });

  it('isConfirmed_defaults_to_true_for_past_date', () => {
    // operationDate is in the past — isConfirmed should default to true (switch checked)
    const pastDate = '2020-01-01';
    renderForm({
      initialValues: {
        operationDate: pastDate,
        // no id → create mode
      } as Partial<PlannedOperation>,
    });

    // Mantine Switch has role="switch" and the accessible name concatenates label + description
    // "Сразу подтвердить Обновить баланс счёта"
    const switchEl = screen.getByRole('switch', { name: /Сразу подтвердить/i });
    expect(switchEl).toBeChecked();
  });

  it('isConfirmed_defaults_to_false_for_future_date', () => {
    // operationDate is far in the future — isConfirmed should default to false
    const futureDate = '2099-12-31';
    renderForm({
      initialValues: {
        operationDate: futureDate,
      } as Partial<PlannedOperation>,
    });

    const switchEl = screen.getByRole('switch', { name: /Сразу подтвердить/i });
    expect(switchEl).not.toBeChecked();
  });

  it('hides_recurrence_fields_when_not_recurring', () => {
    renderForm();

    // By default isRecurring is false → recurrence section must be hidden
    expect(screen.queryByText('Правило повторения')).not.toBeInTheDocument();
    expect(screen.queryByText('Тип повторения')).not.toBeInTheDocument();
    expect(screen.queryByText('Начальная дата')).not.toBeInTheDocument();
  });

  it('shows_recurrence_fields_when_recurring_switched_on', async () => {
    const user = userEvent.setup();
    renderForm();

    // Mantine Switch has role="switch"
    const recurSwitch = screen.getByRole('switch', { name: /Повторяющаяся операция/i });
    await user.click(recurSwitch);

    // After enabling, recurrence fields must appear
    expect(screen.getByText('Правило повторения')).toBeInTheDocument();
    expect(screen.getByText('Тип повторения')).toBeInTheDocument();
    expect(screen.getByText('Начальная дата')).toBeInTheDocument();
  });

  it('cancels form when "Отмена" is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderForm({ onClose });

    await user.click(screen.getByRole('button', { name: /Отмена/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows modal title "Редактировать операцию" in edit mode', () => {
    const editValues: Partial<PlannedOperation> = {
      id: 7,
      accountId: 1,
      amount: 500,
      currency: 'RUB',
      isConfirmed: false,
      operationDate: '2024-06-01',
      userId: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    renderForm({ initialValues: editValues });

    expect(screen.getByText('Редактировать операцию')).toBeInTheDocument();
  });

  it('pre-fills amount field from positive initialValues.amount', () => {
    renderForm({
      initialValues: {
        amount: 12345,
        operationDate: '2024-01-01',
      } as Partial<PlannedOperation>,
    });

    // NumberInput displays the absolute value; Mantine renders an <input type="text" or number>
    const input = screen.getByRole('textbox', { name: /Сумма/i });
    // Mantine formats with thousandSeparator=" " → "12 345"
    expect(input).toHaveValue('12 345');
  });
});
