import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { theme } from './theme';
import { AppLayout } from './components/Layout/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Operations from './pages/Operations';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import Scenarios from './pages/Scenarios';
import ScenarioDetail from './pages/ScenarioDetail';
import Tags from './pages/Tags';
import Settings from './pages/Settings';
import Login from './pages/Login';
import IncomeSources from './pages/IncomeSources';
import { useSettingsStore } from './store/useSettingsStore';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/dropzone/styles.css';

function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem' }}>
      <div style={{ fontSize: '4rem' }}>🔍</div>
      <h2>Страница не найдена</h2>
      <a href="/cashpulse/">← На главную</a>
    </div>
  );
}

export default function App() {
  const { colorScheme } = useSettingsStore();

  return (
    <MantineProvider theme={theme} defaultColorScheme={colorScheme}>
      <ColorSchemeScript defaultColorScheme={colorScheme} />
      <Notifications position="top-right" autoClose={5000} />
      <BrowserRouter basename="/cashpulse">
        <Routes>
          {/* Публичный маршрут */}
          <Route path="login" element={<Login />} />

          {/* Защищённые маршруты */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="operations" element={<Operations />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="accounts/:id" element={<AccountDetail />} />
              <Route path="scenarios" element={<Scenarios />} />
              <Route path="scenarios/:id" element={<ScenarioDetail />} />
              <Route path="tags" element={<Tags />} />
              <Route path="income-sources" element={<IncomeSources />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  );
}
