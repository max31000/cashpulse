import { AppShell, Burger, Group, ScrollArea, Text, NavLink, Stack, Divider, Avatar, Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Outlet, useNavigate, useMatch } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

const navItems = [
  { label: 'Дашборд',   path: '/',          icon: '📊', end: true  },
  { label: 'Операции',  path: '/operations',     icon: '💰', end: false },
  { label: 'Доходы',    path: '/income-sources', icon: '💵', end: false },
  { label: 'Счета',     path: '/accounts',        icon: '🏦', end: false },
  { label: 'Сценарии',  path: '/scenarios',  icon: '🔮', end: false },
  { label: 'Теги',      path: '/tags',       icon: '🏷', end: false },
  { label: 'Настройки', path: '/settings',   icon: '⚙',  end: false },
];

function NavItem({ label, path, icon, end }: { label: string; path: string; icon: string; end: boolean }) {
  const navigate = useNavigate();
  const match = useMatch({ path, end });

  return (
    <NavLink
      label={label}
      leftSection={<Text fz="lg">{icon}</Text>}
      active={!!match}
      variant={match ? 'filled' : 'subtle'}
      onClick={() => navigate(path)}
      fw={500}
      fz="sm"
    />
  );
}

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <AppShell
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      header={{ height: 60, offset: false }}
      padding="md"
    >
      <AppShell.Header hiddenFrom="sm">
        <Group h="100%" px="md" justify="space-between">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Text fw={700} size="lg" c="blue" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            CashPulse
          </Text>
          <Avatar size="sm" radius="xl" color="blue" style={{ cursor: 'pointer' }} onClick={toggle}>
            {initials}
          </Avatar>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        {/* Лого */}
        <AppShell.Section>
          <Group gap="xs" mb="md" style={{ cursor: 'pointer' }} onClick={() => { navigate('/'); close(); }}>
            <Text fz="xl">≋</Text>
            <Text fw={700} fz="xl" c="blue" visibleFrom="sm">CashPulse</Text>
          </Group>
          <Divider mb="sm" />
        </AppShell.Section>

        {/* Навигация */}
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={4}>
            {navItems.map((item) => (
              <div key={item.path} onClick={close}>
                <NavItem {...item} />
              </div>
            ))}
          </Stack>
        </AppShell.Section>

        {/* Пользователь + выход */}
        <AppShell.Section>
          <Divider mb="sm" />
          <Group gap="sm" mb="xs" wrap="nowrap">
            <Avatar size="sm" radius="xl" color="blue">{initials}</Avatar>
            <Text fz="sm" fw={500} truncate="end" style={{ flex: 1 }}>
              {user?.displayName ?? '—'}
            </Text>
          </Group>
          <Button
            variant="subtle"
            color="red"
            size="xs"
            fullWidth
            onClick={handleLogout}
          >
            Выйти
          </Button>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main pt={{ base: 60, sm: 0 }}>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
