import { useEffect, useState } from 'react';
import {
  Stack, Group, Button, Text, Card, Badge, Progress, SimpleGrid,
  Modal, TextInput, Select, NumberInput, Divider, ActionIcon, Skeleton, Switch
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useAccountStore } from '../store/useAccountStore';
import { createAccount, updateAccount, archiveAccount } from '../api/accounts';
import type { Account, CreateAccountDto } from '../api/types';
import { formatMoney } from '../utils/formatMoney';
import { accountTypeColors, accountTypeLabels } from '../utils/colors';

interface BalanceEntry { currency: string; amount: number | '' }
interface FormValues {
  name: string;
  type: string;
  balances: BalanceEntry[];
  creditLimit: number | '';
  gracePeriodDays: number | '';
  minPaymentPercent: number | '';
  statementDay: number | '';
  dueDay: number | '';
  interestRate: number | '';
  interestAccrualDay: number | '';
  depositEndDate: string;
  canTopUpAlways: boolean;
  canWithdraw: boolean;
  dailyAccrual: boolean;
  investmentSubtype: string;
  gracePeriodEndDate: string;
}

function AccountModal({ opened, onClose, onSave, initial }: {
  opened: boolean;
  onClose: () => void;
  onSave: (acc: Account) => void;
  initial?: Account;
}) {
  const [loading, setLoading] = useState(false);
  const form = useForm<FormValues>({
    initialValues: {
      name: initial?.name ?? '',
      type: initial?.type ?? 'debit',
      balances: initial?.balances.map(b => ({ currency: b.currency, amount: b.amount })) ?? [{ currency: 'RUB', amount: 0 }],
      creditLimit: initial?.creditLimit ?? '',
      gracePeriodDays: initial?.gracePeriodDays ?? '',
      minPaymentPercent: initial?.minPaymentPercent ?? '',
      statementDay: initial?.statementDay ?? '',
      dueDay: initial?.dueDay ?? '',
      interestRate: initial?.interestRate ?? '',
      interestAccrualDay: initial?.interestAccrualDay ?? '',
      depositEndDate: initial?.depositEndDate ?? '',
      canTopUpAlways: initial?.canTopUpAlways ?? true,
      canWithdraw: initial?.canWithdraw ?? false,
      dailyAccrual: initial?.dailyAccrual ?? false,
      investmentSubtype: initial?.investmentSubtype ?? '',
      gracePeriodEndDate: initial?.gracePeriodEndDate ?? '',
    },
    validate: {
      name: (v) => !v.trim() ? 'Введите название' : null,
      type: (v) => !v ? 'Выберите тип' : null,
    }
  });

  const handleSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const dto: CreateAccountDto = {
        name: values.name,
        type: values.type as CreateAccountDto['type'],
        balances: values.balances.map(b => ({ currency: b.currency, amount: b.amount as number })),
        creditLimit: values.type === 'credit' && values.creditLimit !== '' ? values.creditLimit as number : undefined,
        gracePeriodDays: values.type === 'credit' && values.gracePeriodDays !== '' ? values.gracePeriodDays as number : undefined,
        minPaymentPercent: values.type === 'credit' && values.minPaymentPercent !== '' ? values.minPaymentPercent as number : undefined,
        statementDay: values.type === 'credit' && values.statementDay !== '' ? values.statementDay as number : undefined,
        dueDay: values.type === 'credit' && values.dueDay !== '' ? values.dueDay as number : undefined,
        interestRate: values.interestRate !== '' ? values.interestRate as number : undefined,
        interestAccrualDay: values.interestAccrualDay !== '' ? values.interestAccrualDay as number : undefined,
        depositEndDate: values.depositEndDate || undefined,
        canTopUpAlways: values.type === 'deposit' ? values.canTopUpAlways : undefined,
        canWithdraw: values.type === 'deposit' ? values.canWithdraw : undefined,
        dailyAccrual: values.type === 'deposit' ? values.dailyAccrual : undefined,
        investmentSubtype: values.type === 'investment' ? values.investmentSubtype || undefined : undefined,
        gracePeriodEndDate: values.type === 'credit' ? values.gracePeriodEndDate || undefined : undefined,
      };
      const result = initial ? await updateAccount(initial.id, dto) : await createAccount(dto);
      onSave(result);
      onClose();
      notifications.show({ title: 'Успешно', message: initial ? 'Счёт обновлён' : 'Счёт создан', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const addBalance = () => form.setFieldValue('balances', [...form.values.balances, { currency: 'USD', amount: 0 }]);
  const removeBalance = (idx: number) => form.setFieldValue('balances', form.values.balances.filter((_, i) => i !== idx));

  return (
    <Modal opened={opened} onClose={onClose} title={initial ? 'Редактировать счёт' : 'Новый счёт'} size="lg" closeOnClickOutside={false} overlayProps={{ blur: 3 }}>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <TextInput label="Название" required maxLength={255} placeholder="Например: Tinkoff Дебетовая" {...form.getInputProps('name')} />
          <Select label="Тип" required data={[
            { value: 'debit', label: 'Дебетовый' },
            { value: 'credit', label: 'Кредитный' },
            { value: 'investment', label: 'Инвестиционный' },
            { value: 'cash', label: 'Наличные' },
            { value: 'deposit', label: 'Вклад' },
          ]} {...form.getInputProps('type')} />

          <Text fz="sm" fw={500}>Начальные балансы</Text>
          {form.values.balances.map((_, idx) => (
            <Group key={idx} align="flex-end">
              <Select w={90} data={['RUB', 'USD', 'EUR', 'CNY', 'GBP']} {...form.getInputProps(`balances.${idx}.currency`)} />
              <NumberInput style={{ flex: 1 }} thousandSeparator=" " decimalSeparator="," {...form.getInputProps(`balances.${idx}.amount`)} />
              {form.values.balances.length > 1 && (
                <ActionIcon color="red" variant="subtle" onClick={() => removeBalance(idx)}>×</ActionIcon>
              )}
            </Group>
          ))}
          <Button variant="outline" size="xs" onClick={addBalance} style={{ borderStyle: 'dashed' }}>+ Добавить валюту</Button>

          {form.values.type === 'credit' && (
            <>
              <Divider label="Параметры кредита" />
              <Group grow>
                <NumberInput label="Кредитный лимит" required={form.values.type === 'credit'} min={0} thousandSeparator=" " {...form.getInputProps('creditLimit')} />
                <NumberInput label="Льготный период (дней)" min={0} max={365} {...form.getInputProps('gracePeriodDays')} />
              </Group>
              <Group grow>
                <NumberInput label="Минимальный платёж (%)" min={0} max={100} decimalScale={2} suffix="%" {...form.getInputProps('minPaymentPercent')} />
                <NumberInput label="День оплаты" min={1} max={31} {...form.getInputProps('dueDay')} />
              </Group>
              <TextInput
                label="Дата окончания беспроцентного периода"
                description="Введите конкретную дату — например для Альфа 100 дней с первой операции"
                type="date"
                {...form.getInputProps('gracePeriodEndDate')}
              />
            </>
          )}

          {form.values.type === 'deposit' && (
            <>
              <Divider label="Параметры вклада" labelPosition="left" my="xs" />
              <NumberInput
                label="Годовая ставка"
                description="Например: 16.5 для 16.5% годовых"
                required
                min={0.01}
                max={100}
                decimalScale={2}
                suffix="%"
                {...form.getInputProps('interestRate')}
              />
              <Switch
                label="Ежедневное начисление"
                description="Проценты зачисляются каждый день (как в Райффайзенбанке)"
                {...form.getInputProps('dailyAccrual', { type: 'checkbox' })}
              />
              {!form.values.dailyAccrual && (
                <NumberInput
                  label="День начисления процентов"
                  description="Число месяца (1-28)"
                  required
                  min={1}
                  max={28}
                  {...form.getInputProps('interestAccrualDay')}
                />
              )}
              <TextInput
                label="Дата окончания вклада"
                description="Оставьте пустым для бессрочного вклада"
                type="date"
                {...form.getInputProps('depositEndDate')}
              />
              <Group>
                <Switch
                  label="Пополнение в любое время"
                  description="Если выключено — только первые 30 дней с открытия"
                  {...form.getInputProps('canTopUpAlways', { type: 'checkbox' })}
                />
                <Switch
                  label="Частичное снятие разрешено"
                  description="Если выключено — снятие только при закрытии"
                  {...form.getInputProps('canWithdraw', { type: 'checkbox' })}
                />
              </Group>
            </>
          )}

          {form.values.type === 'investment' && (
            <>
              <Divider label="Тип инвестиционного счёта" labelPosition="left" my="xs" />
              <Select
                label="Вид счёта"
                required
                data={[
                  { value: 'savings', label: 'Сберегательный (фиксированная ставка)' },
                  { value: 'bonds', label: 'Облигации (купоны — вручную)' },
                  { value: 'stocks', label: 'Акции / фонды (вручную)' },
                ]}
                {...form.getInputProps('investmentSubtype')}
              />
              {form.values.investmentSubtype === 'savings' && (
                <Group grow>
                  <NumberInput
                    label="Годовая ставка"
                    description="Например: 12.5 для 12.5% годовых"
                    required
                    min={0.01}
                    max={100}
                    decimalScale={2}
                    suffix="%"
                    {...form.getInputProps('interestRate')}
                  />
                  <NumberInput
                    label="День начисления процентов"
                    description="Число месяца (1-28)"
                    required
                    min={1}
                    max={28}
                    {...form.getInputProps('interestAccrualDay')}
                  />
                </Group>
              )}
            </>
          )}

          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose} disabled={loading}>Отмена</Button>
            <Button type="submit" loading={loading}>Сохранить</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export default function Accounts() {
  const navigate = useNavigate();
  const { accounts, loading, fetch: fetchAccounts, addAccount, updateAccount: updateStoreAccount, removeAccount } = useAccountStore();
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpened, { open, close }] = useDisclosure(false);
  const [editingAcc, setEditingAcc] = useState<Account | undefined>();

  useEffect(() => { void fetchAccounts(); }, []);

  const active = accounts.filter(a => !a.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = accounts.filter(a => a.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);
  const hasArchived = archived.length > 0;

  const handleArchive = async (acc: Account) => {
    if (!confirm(`Архивировать счёт "${acc.name}"?`)) return;
    try {
      await archiveAccount(acc.id);
      removeAccount(acc.id);
      notifications.show({ title: 'Архивировано', message: `Счёт "${acc.name}" архивирован`, color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  const AccountCardEl = ({ acc }: { acc: Account }) => {
    const mainBal = acc.balances[0];
    const otherBals = acc.balances.slice(1);
    const usedPct = acc.type === 'credit' && acc.creditLimit && mainBal
      ? (Math.abs(mainBal.amount) / acc.creditLimit) * 100 : 0;
    const dueDay = acc.dueDay;
    let daysLeft = 0;
    if (dueDay) {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), dueDay);
      if (next < now) next.setMonth(next.getMonth() + 1);
      daysLeft = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    return (
      <Card p="lg" radius="md" withBorder shadow="sm" style={{ cursor: 'pointer', opacity: acc.isArchived ? 0.6 : 1 }}
        onClick={() => navigate(`/accounts/${acc.id}`)}>
        <Card.Section withBorder inheritPadding py="xs">
          <Group justify="space-between">
            <Text fw={700} fz="lg">{acc.name}</Text>
            <Group gap="xs">
              {acc.isArchived && <Badge size="xs" color="gray">Архивирован</Badge>}
              <Badge size="sm" color={accountTypeColors[acc.type]}>{accountTypeLabels[acc.type]}</Badge>
            </Group>
          </Group>
        </Card.Section>

        <Stack gap={4} mt="md">
          <Text fz="xl" fw={700} c={mainBal?.amount < 0 ? 'red' : undefined}>
            {mainBal ? formatMoney(mainBal.amount, mainBal.currency) : '—'}
          </Text>
          {otherBals.map(b => <Text key={b.currency} fz="sm" c="dimmed">{formatMoney(b.amount, b.currency)}</Text>)}
        </Stack>

        {acc.type === 'credit' && acc.creditLimit && (
          <>
            <Divider my="sm" />
            <Text fz="xs" c="dimmed">Использовано: {formatMoney(Math.abs(mainBal?.amount ?? 0), mainBal?.currency ?? 'RUB')} / Лимит: {formatMoney(acc.creditLimit, 'RUB')}</Text>
            <Progress value={usedPct} color={usedPct > 80 ? 'red' : 'blue'} size="md" radius="xl" mt="xs" />
            {dueDay && <Text fz="xs" c={daysLeft <= 7 ? 'red' : 'dimmed'} mt={4}>До оплаты: {daysLeft} дней</Text>}
            {acc.minPaymentPercent && <Text fz="xs" c="dimmed">Мин. платёж: {acc.minPaymentPercent}%</Text>}
          </>
        )}

        {acc.type === 'credit' && acc.gracePeriodEndDate && (
          (() => {
            const graceLeft = Math.round(
              (new Date(acc.gracePeriodEndDate).getTime() - Date.now()) / 86400000
            );
            return (
              <Text size="sm" c={graceLeft <= 7 ? 'red' : graceLeft <= 14 ? 'yellow' : 'dimmed'}>
                Беспроцентный период: {graceLeft > 0 ? `ещё ${graceLeft} дн.` : 'истёк'}
              </Text>
            );
          })()
        )}

        {acc.type === 'deposit' && acc.interestRate && (
          <Text size="sm" c="dimmed">
            {acc.interestRate}% годовых
            {acc.depositEndDate && ` · до ${new Date(acc.depositEndDate).toLocaleDateString('ru-RU')}`}
            {acc.dailyAccrual ? ' · ежедневное начисление' : acc.interestAccrualDay ? ` · начисление ${acc.interestAccrualDay}-го` : ''}
          </Text>
        )}

        {acc.type === 'investment' && acc.investmentSubtype && (
          <Text size="sm" c="dimmed">
            {acc.investmentSubtype === 'savings' ? 'Сберегательный' :
             acc.investmentSubtype === 'bonds' ? 'Облигации' : 'Акции / фонды'}
            {acc.investmentSubtype === 'savings' && acc.interestRate && ` · ${acc.interestRate}%`}
          </Text>
        )}

        <Card.Section withBorder inheritPadding pt="sm" mt="md">
          <Group justify="space-between">
            <Button variant="subtle" size="xs" onClick={(e) => { e.stopPropagation(); setEditingAcc(acc); open(); }}>
              ✏️ Редактировать
            </Button>
            {acc.isArchived ? (
              <Button variant="subtle" size="xs" color="blue" onClick={(e) => { e.stopPropagation(); /* TODO: unarchive */ }}>
                ↺ Разархивировать
              </Button>
            ) : (
              <Button variant="subtle" size="xs" color="gray" onClick={(e) => { e.stopPropagation(); handleArchive(acc); }}>
                🗄 Архивировать
              </Button>
            )}
          </Group>
        </Card.Section>
      </Card>
    );
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fz="xl" fw={700}>Счета</Text>
        <Button variant="filled" onClick={() => { setEditingAcc(undefined); open(); }}>+ Добавить счёт</Button>
      </Group>
      {hasArchived && (
        <Button variant="subtle" size="xs" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Скрыть архивированные' : 'Показать архивированные'}
        </Button>
      )}

      {loading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {[1,2,3,4].map(i => <Skeleton key={i} h={200} />)}
        </SimpleGrid>
      ) : (
        <>
          {active.length === 0 && !showArchived ? (
            <Stack align="center" py="xl">
              <Text fz="4xl">🏦</Text>
              <Text fw={600}>Нет счетов</Text>
              <Text c="dimmed" fz="sm">Добавьте первый счёт для начала работы</Text>
              <Button onClick={() => { setEditingAcc(undefined); open(); }}>Добавить счёт</Button>
            </Stack>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {active.map(acc => <AccountCardEl key={acc.id} acc={acc} />)}
            </SimpleGrid>
          )}
          {showArchived && archived.length > 0 && (
            <>
              <Divider label="Архив" />
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {archived.map(acc => <AccountCardEl key={acc.id} acc={acc} />)}
              </SimpleGrid>
            </>
          )}
        </>
      )}

      <AccountModal
        key={editingAcc?.id ?? 'new'}
        opened={modalOpened}
        onClose={close}
        onSave={(acc) => {
          if (editingAcc) updateStoreAccount(acc);
          else addAccount(acc);
        }}
        initial={editingAcc}
      />
    </Stack>
  );
}
