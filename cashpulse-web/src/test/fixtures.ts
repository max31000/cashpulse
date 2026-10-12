import type { Me } from '@mvv42/kit/platform';

/** `/auth/api/me` of a signed-in user with access to CashPulse. */
export const meSignedIn: Me = {
  user: {
    id: 1,
    telegramId: 100500,
    name: 'Анна Смирнова',
    username: 'anna',
    photoUrl: null,
    isAdmin: false,
    isOwner: false,
  },
  apps: [{ id: 'cashpulse', anonymous: false, access: 'public', granted: true }],
};
