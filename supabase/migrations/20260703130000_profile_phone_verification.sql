-- Phone number + verification state for messaging (WhatsApp/SMS). The number is
-- verified via Firebase phone OTP; phone_verified is only ever set server-side
-- after the Firebase ID token is validated (never by the client directly).
alter table public.profiles
  add column if not exists phone text,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz;

-- A verified number belongs to exactly one account.
create unique index if not exists profiles_phone_unique
  on public.profiles (phone) where phone is not null;
