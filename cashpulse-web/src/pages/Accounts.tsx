import { useEffect, useState } from 'react';
import {
  Stack, Group, Button, Text, Badge, Progress, SimpleGrid,
  Modal, TextInput, Select, NumberInput, Divider, ActionIcon, Skeleton, Switch
} from '@mantine/core';
import { EmptyState, ErrorState, Page, Section } from '@mvv42/kit';
import { IconArchive, IconBuildingBank, IconPencil, IconPlus } from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useAccountStore } from '../store/useAccountStore';
import { createAccount, updateAccount, archiveAccount } from '../api/accounts';
import type { Account, CreateAccountDto } from '../api/types';
import { formatMoney } from '../utils/formatMoney';
import { accountTypeColors, accountTypeLabels } from '../utils/colors';
import { creditUsage, daysUntilDue, graceDaysLeft } from '../utils/accounts';

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
    <Modal opened={opened} onClose={onClose} title={initial ? 'Редактировать счёт' : 'Новый счёт'} size="lg" closeOnClickOutside={false}>
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
              <NumberInput className="cp-grow" thousandSeparator=" " decimalSeparator="," {...form.getInputProps(`balances.${idx}.amount`)} />
              {form.values.balances.length > 1 && (
                <ActionIcon color="red" variant="subtle" onClick={() => removeBalance(idx)}>×</ActionIcon>
              )}
            </Group>
          ))}
          <Button variant="default" size="xs" onClick={addBalance} leftSection={<IconPlus size={14} />}>Добавить валюту</Button>

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

function AccountCard({ acc, onEdit, onArchive }: { acc: Account; onEdit: (a: Account) => void; onArchive: (a: Account) => void }) {
  const mainBal = acc.balances[0];
  const usedPct = creditUsage(acc);
  const daysLeft = daysUntilDue(acc);
  const graceLeft = graceDaysLeft(acc);

  let details: string | null = null;
  if (acc.type === 'deposit' && acc.interestRate) {
    details = `${acc.interestRate}% годовых`
      + (acc.depositEndDate ? ` · до ${new Date(acc.depositEndDate).toLocaleDateString('ru-RU')}` : '')
      + (acc.dailyAccrual ? ' · ежедневное начисление' : acc.interestAccrualDay ? ` · начисление ${acc.interestAccrualDay}-го` : '');
  } else if (acc.type === 'investment' && acc.investmentSubtype) {
    details = (acc.investmentSubtype === 'savings' ? 'Сберегательный' : acc.investmentSubtype === 'bonds' ? 'Облигации' : 'Акции / фонды')
      + (acc.investmentSubtype === 'savings' && acc.interestRate ? ` · ${acc.interestRate}%` : '');
  }

  return (
    <div className="cp-account" data-archived={acc.isArchived || undefined}>
      <div className="cp-account-head">
        <Link to={`/accounts/${acc.id}`} className="cp-account-name cp-title-link cp-truncate">{acc.name}</Link>
        <Group gap={6} wrap="nowrap">
          {acc.isArchived && <Badge size="xs" color="gray">Архив</Badge>}
          <Badge size="sm" color={accountTypeColors[acc.type]}>{accountTypeLabels[acc.type]}</Badge>
        </Group>
      </div>

      <div className="cp-account-balance mvv-num cp-amount" data-sign={mainBal && mainBal.amount < 0 ? 'neg' : undefined}>
        {mainBal ? formatMoney(mainBal.amount, mainBal.currency) : '—'}
      </div>
      {acc.balances.slice(1).map((b) => (
        <Text key={b.currency} fz="sm" c="dimmed" className="mvv-num">{formatMoney(b.amount, b.currency)}</Text>
      ))}

      {usedPct != null && acc.creditLimit && (
        <>
          <Text fz="xs" c="dimmed" className="mvv-num">
            Использовано {formatMoney(Math.abs(mainBal?.amount ?? 0), mainBal?.currency ?? 'RUB')} из {formatMoney(acc.creditLimit, 'RUB')}
          </Text>
          <Progress value={usedPct} color={usedPct > 80 ? 'red' : 'blue'} size="sm" aria-label="Использование лимита" />
          {(daysLeft != null || acc.minPaymentPercent) && (
            <Text fz="xs" c="dimmed">
              {daysLeft != null && <Text span fz="xs" c={daysLeft <= 7 ? 'red' : 'dimmed'}>До оплаты {daysLeft} дн.</Text>}
              {daysLeft != null && acc.minPaymentPercent ? ' · ' : ''}
              {acc.minPaymentPercent ? `мин. платёж ${acc.minPaymentPercent}%` : ''}
            </Text>
          )}
        </>
      )}
      {graceLeft != null && (
        <Text fz="xs" c={graceLeft <= 7 ? 'red' : graceLeft <= 14 ? 'yellow' : 'dimmed'}>
          Беспроцентный период: {graceLeft > 0 ? `ещё ${graceLeft} дн.` : 'истёк'}
        </Text>
      )}
      {details && <Text fz="sm" c="dimmed">{details}</Text>}

      <div className="cp-account-foot">
        <Button component={Link} to={`/accounts/${acc.id}`} variant="subtle" size="xs">Операции</Button>
        <Button variant="subtle" size="xs" color="gray" leftSection={<IconPencil size={14} />} onClick={() => onEdit(acc)}>
          Изменить
        </Button>
        {!acc.isArchived && (
          <Button variant="subtle" size="xs" color="gray" leftSection={<IconArchive size={14} />} onClick={() => onArchive(acc)} ml="auto">
            В архив
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Accounts() {
  const { accounts, loading, error, fetch: fetchAccounts, addAccount, updateAccount: updateStoreAccount, removeAccount } = useAccountStore();
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpened, { open, close }] = useDisclosure(false);
  const [editingAcc, setEditingAcc] = useState<Account | undefined>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchAccounts(); }, []);

  const active = accounts.filter(a => !a.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = accounts.filter(a => a.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);

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

  const openNew = () => { setEditingAcc(undefined); open(); };
  const onEdit = (acc: Account) => { setEditingAcc(acc); open(); };

  return (
    <Page
      title="Счета"
      description="Карты, вклады, наличные и инвестиции"
      width="wide"
      actions={
        <>
          {archived.length > 0 && (
            <Button variant="default" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? 'Скрыть архив' : `Архив (${archived.length})`}
            </Button>
          )}
          <Button leftSection={<IconPlus size={16} />} onClick={openNew}>Добавить счёт</Button>
        </>
      }
    >
      {loading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {[1, 2, 3].map(i => <Skeleton key={i} h={180} radius="md" />)}
        </SimpleGrid>
      ) : error && accounts.length === 0 ? (
        <Section><ErrorState error={error} onRetry={() => void fetchAccounts()} /></Section>
      ) : active.length === 0 && !showArchived ? (
        <Section>
          <EmptyState
            icon={<IconBuildingBank size={22} />}
            title="Нет счетов"
            description="Добавьте первый счёт — с него начинаются баланс и прогноз."
            action={<Button onClick={openNew}>Добавить счёт</Button>}
          />
        </Section>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {active.map(acc => <AccountCard key={acc.id} acc={acc} onEdit={onEdit} onArchive={handleArchive} />)}
        </SimpleGrid>
      )}
      {showArchived && archived.length > 0 && (
        <Section title="Архив" variant="plain">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {archived.map(acc => <AccountCard key={acc.id} acc={acc} onEdit={onEdit} onArchive={handleArchive} />)}
          </SimpleGrid>
        </Section>
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
    </Page>
  );
}
