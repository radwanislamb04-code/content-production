/**
 * The owner's user id, in its own tiny module.
 *
 * It lives here rather than in `lib/users.ts` so that `lib/settings.ts` (which
 * needs it to namespace per-user keys) does not create an import cycle with the
 * module that reads the current user. Created by migrations/009_multi_user.sql.
 */
export const OWNER_ID = "usr_radwanislamb04";
