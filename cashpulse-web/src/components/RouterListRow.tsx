import type { MouseEvent } from 'react';
import { Skeleton, Stack } from '@mantine/core';
import { ListRow, type ListRowProps } from '@mvv42/kit';
import { useHref, useNavigate } from 'react-router-dom';

/** Kit `ListRow` as a react-router link: real href (basename-aware), client-side navigation on plain clicks. */
export function RouterListRow({ to, ...props }: Omit<ListRowProps, 'href' | 'linkProps' | 'onClick'> & { to: string }) {
  const href = useHref(to);
  const navigate = useNavigate();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <ListRow {...props} href={href} linkProps={{ onClick }} />;
}

/** Placeholder rows for a list inside `Section padding="none"`. */
export function ListSkeleton({ rows = 3, height = 24 }: { rows?: number; height?: number }) {
  return (
    <Stack gap="sm" p="md" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={height} />
      ))}
    </Stack>
  );
}
