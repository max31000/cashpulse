import type { ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Button } from '@mantine/core';
import { EmptyState, ErrorState, LoginRequired, Mvv42Provider, Page } from '@mvv42/kit';
import { AppLayout, type NavItem } from '@mvv42/kit/router';
import {
  IconActivity,
  IconArrowsExchange,
  IconBuildingBank,
  IconCash,
  IconGitBranch,
  IconLayoutDashboard,
  IconMapSearch,
  IconSettings,
  IconTag,
} from '@tabler/icons-react';
import Dashboard from './pages/Dashboard';
import Operations from './pages/Operations';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import Scenarios from './pages/Scenarios';
import ScenarioDetail from './pages/ScenarioDetail';
import Tags from './pages/Tags';
import Settings from './pages/Settings';
import IncomeSources from './pages/IncomeSources';
import { SERVICE_ID } from './api/client';
import { useAccessStore } from './store/useAccessStore';

const ICON = { size: 16, stroke: 1.75 } as const;

const nav: NavItem[] = [
  { label: 'Дашборд', to: '/', icon: <IconLayoutDashboard {...ICON} /> },
  { label: 'Операции', to: '/operations', icon: <IconArrowsExchange {...ICON} />, end: false },
  { label: 'Счета', to: '/accounts', icon: <IconBuildingBank {...ICON} />, end: false },
  { label: 'Сценарии', to: '/scenarios', icon: <IconGitBranch {...ICON} />, end: false },
  { label: 'Теги', to: '/tags', icon: <IconTag {...ICON} /> },
  { label: 'Источники дохода', to: '/income-sources', icon: <IconCash {...ICON} /> },
  { label: 'Настройки', to: '/settings', icon: <IconSettings {...ICON} /> },
];

function NotFound() {
  return (
    <Page>
      <EmptyState
        icon={<IconMapSearch size={22} />}
        title="Страница не найдена"
        description="Такого раздела в CashPulse нет."
        action={
          <Button component={Link} to="/" variant="default">
            На дашборд
          </Button>
        }
      />
    </Page>
  );
}

/** The API answered 403: the account lost (or never had) access to CashPulse. */
function AccessGate({ children }: { children: ReactNode }) {
  const denied = useAccessStore((s) => s.denied);
  if (!denied) return <>{children}</>;
  return (
    <Page>
      <ErrorState
        error={denied}
        onRetry={() => {
          useAccessStore.getState().reset();
          window.location.reload();
        }}
      />
    </Page>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="operations" element={<Operations />} />
      <Route path="accounts" element={<Accounts />} />
      <Route path="accounts/:id" element={<AccountDetail />} />
      <Route path="scenarios" element={<Scenarios />} />
      <Route path="scenarios/:id" element={<ScenarioDetail />} />
      <Route path="tags" element={<Tags />} />
      <Route path="income-sources" element={<IncomeSources />} />
      <Route path="settings" element={<Settings />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Mvv42Provider serviceId={SERVICE_ID} accent="blue">
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AppLayout title="CashPulse" icon={<IconActivity size={16} stroke={2} />} nav={nav}>
          <LoginRequired description="Планирование денег и прогноз баланса доступны после входа через Telegram.">
            <AccessGate>
              <AppRoutes />
            </AccessGate>
          </LoginRequired>
        </AppLayout>
      </BrowserRouter>
    </Mvv42Provider>
  );
}
