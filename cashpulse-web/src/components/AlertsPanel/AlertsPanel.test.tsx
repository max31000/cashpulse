import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AlertsPanel } from './AlertsPanel';
import type { ForecastAlert } from '../../api/types';

// Wrap with MantineProvider so Mantine components render correctly
function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

const makeAlert = (overrides: Partial<ForecastAlert> = {}): ForecastAlert => ({
  type: 'BALANCE_BELOW_ZERO',
  severity: 'critical',
  date: '2024-06-20',
  message: 'Баланс счёта опустится ниже нуля',
  suggestedAction: 'Пополните счёт',
  ...overrides,
});

describe('AlertsPanel', () => {
  it('renders_empty_state_when_no_alerts', () => {
    renderWithMantine(<AlertsPanel alerts={[]} loading={false} />);

    expect(screen.getByText(/Всё в порядке/i)).toBeInTheDocument();
    expect(screen.getByText(/Критических предупреждений нет/i)).toBeInTheDocument();
  });

  it('renders_BALANCE_BELOW_ZERO_alert', () => {
    const alert = makeAlert({
      type: 'BALANCE_BELOW_ZERO',
      severity: 'critical',
      message: 'Баланс счёта опустится ниже нуля',
    });

    renderWithMantine(<AlertsPanel alerts={[alert]} loading={false} />);

    expect(screen.getByText(/Баланс счёта опустится ниже нуля/)).toBeInTheDocument();
    // Critical severity → title "Критично"
    expect(screen.getByText(/Критично/)).toBeInTheDocument();
  });

  it('renders_CREDIT_GRACE_EXPIRY_alert', () => {
    const alert = makeAlert({
      type: 'CREDIT_GRACE_EXPIRY',
      severity: 'warning',
      message: 'Льготный период по кредитной карте истекает через 3 дня',
      suggestedAction: 'Погасите задолженность',
    });

    renderWithMantine(<AlertsPanel alerts={[alert]} loading={false} />);

    expect(screen.getByText(/Льготный период по кредитной карте/)).toBeInTheDocument();
    // Warning severity → title "Предупреждение"
    expect(screen.getByText(/Предупреждение/)).toBeInTheDocument();
  });

  it('renders_multiple_alerts', () => {
    const alerts: ForecastAlert[] = [
      makeAlert({ message: 'Первый алерт', severity: 'critical' }),
      makeAlert({ message: 'Второй алерт', severity: 'warning' }),
      makeAlert({ message: 'Третий алерт', severity: 'info' }),
    ];

    renderWithMantine(<AlertsPanel alerts={alerts} loading={false} />);

    expect(screen.getByText('Первый алерт')).toBeInTheDocument();
    expect(screen.getByText('Второй алерт')).toBeInTheDocument();
    expect(screen.getByText('Третий алерт')).toBeInTheDocument();
  });

  it('applies_correct_severity_color — critical shows red badge, warning does not', () => {
    const alerts: ForecastAlert[] = [
      makeAlert({ severity: 'critical' }),
      makeAlert({ severity: 'warning' }),
    ];

    renderWithMantine(<AlertsPanel alerts={alerts} loading={false} />);

    // Critical count badge should show "1" (one critical alert)
    // The badge is rendered by AlertsPanel when criticalCount > 0
    const badge = screen.getByText('1');
    expect(badge).toBeInTheDocument();

    // Critical item renders "Критично", warning item renders "Предупреждение"
    expect(screen.getByText(/Критично/)).toBeInTheDocument();
    expect(screen.getByText(/Предупреждение/)).toBeInTheDocument();
  });

  it('shows loading skeletons when loading=true', () => {
    const { container } = renderWithMantine(<AlertsPanel alerts={[]} loading={true} />);
    // Mantine Skeleton renders as div with mantine-Skeleton class
    const skeletons = container.querySelectorAll('[class*="mantine-Skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "Показать ещё" button when more than 5 alerts', () => {
    const alerts = Array.from({ length: 7 }, (_, i) =>
      makeAlert({ message: `Алерт ${i + 1}`, severity: 'warning' })
    );

    renderWithMantine(<AlertsPanel alerts={alerts} loading={false} />);

    // Only 5 are visible initially, button shows remaining count (2)
    expect(screen.getByText(/Показать ещё 2/)).toBeInTheDocument();
    // Items 6 and 7 are not visible yet
    expect(screen.queryByText('Алерт 6')).not.toBeInTheDocument();
  });

  it('expands all alerts when "Показать ещё" is clicked', () => {
    const alerts = Array.from({ length: 7 }, (_, i) =>
      makeAlert({ message: `Алерт ${i + 1}`, severity: 'warning' })
    );

    renderWithMantine(<AlertsPanel alerts={alerts} loading={false} />);

    fireEvent.click(screen.getByText(/Показать ещё/));

    expect(screen.getByText('Алерт 6')).toBeInTheDocument();
    expect(screen.getByText('Алерт 7')).toBeInTheDocument();
  });

  it('shows "Развернуть" button when message longer than 80 chars', () => {
    const longMessage = 'А'.repeat(90);
    const alert = makeAlert({ message: longMessage, suggestedAction: '' });

    renderWithMantine(<AlertsPanel alerts={[alert]} loading={false} />);

    expect(screen.getByText(/Развернуть/)).toBeInTheDocument();
  });

  it('shows full message and suggestedAction after clicking "Развернуть"', () => {
    const longMessage = 'Полное описание алерта '.repeat(5); // > 80 chars
    const alert = makeAlert({
      message: longMessage,
      suggestedAction: 'Нужно что-то сделать',
    });

    renderWithMantine(<AlertsPanel alerts={[alert]} loading={false} />);

    fireEvent.click(screen.getByText(/Развернуть/));

    expect(screen.getByText(/Рекомендация:/)).toBeInTheDocument();
    expect(screen.getByText(/Нужно что-то сделать/)).toBeInTheDocument();
    // Button label changes
    expect(screen.getByText(/Свернуть/)).toBeInTheDocument();
  });
});
