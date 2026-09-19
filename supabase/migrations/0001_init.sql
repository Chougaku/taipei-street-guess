-- TaipeiGuessr core schema.
--
-- All reads and writes go through the game server (it connects as the table
-- owner, which bypasses RLS). RLS is enabled with no policies so that the
-- Supabase REST API exposes nothing to anon/authenticated clients — answers
-- (map_locations) and scores can't be read or forged from the browser.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  avatar text not null default 'pin-red',
  xp integer not null default 0,
  rating integer not null default 1000,
  ranked_games integer not null default 0,
  friend_code text not null unique,
  is_guest boolean not null default true,
  role text not null default 'player' check (role in ('player', 'admin')),
  settings jsonb not null default '{}'::jsonb,
  daily_streak integer not null default 0,
  last_daily_day date,
  best_district_streak integer not null default 0,
  best_village_streak integer not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index profiles_nickname_idx on public.profiles (lower(nickname));

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_en text not null default '',
  description text not null default '',
  kind text not null check (kind in ('official', 'custom')),
  -- Official per-district maps draw from the city pool filtered by district.
  district_code text,
  owner_id uuid references public.profiles (id) on delete cascade,
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  bbox double precision[] not null default '{121.457,24.96,121.666,25.21}',
  diagonal_km double precision not null default 35,
  location_count integer not null default 0,
  likes integer not null default 0,
  plays integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index maps_owner_idx on public.maps (owner_id);
create index maps_public_idx on public.maps (visibility, kind);

create table public.map_locations (
  id bigint generated always as identity primary key,
  map_id uuid not null references public.maps (id) on delete cascade,
  pano_id text not null,
  lat double precision not null,
  lng double precision not null,
  heading real not null default 0,
  pitch real not null default 0,
  zoom real not null default 0,
  district_code text,
  village_code text,
  capture_date text,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (map_id, pano_id)
);
create index map_locations_map_idx on public.map_locations (map_id, district_code) where not disabled;

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null default 'challenge' check (kind in ('challenge', 'daily')),
  creator_id uuid references public.profiles (id) on delete set null,
  map_id uuid not null references public.maps (id) on delete cascade,
  time_limit_sec integer not null,
  movement text not null check (movement in ('moving', 'nomove', 'nmpz')),
  round_count integer not null default 5,
  -- Snapshot of the rounds so later map edits can't change a challenge.
  locations jsonb not null,
  created_at timestamptz not null default now()
);

create table public.daily_challenges (
  day date primary key,
  challenge_id uuid not null references public.challenges (id) on delete cascade
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  map_id uuid not null references public.maps (id) on delete cascade,
  mode text not null check (mode in ('classic', 'challenge', 'daily', 'explorer')),
  challenge_id uuid references public.challenges (id) on delete set null,
  time_limit_sec integer not null,
  movement text not null check (movement in ('moving', 'nomove', 'nmpz')),
  round_count integer not null default 5,
  current_round integer not null default 1,
  status text not null default 'playing' check (status in ('playing', 'finished')),
  total_score integer not null default 0,
  xp_gained integer,
  -- Rounds swapped because the panorama failed to load (capped to prevent re-rolling).
  replacements integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index games_user_idx on public.games (user_id, created_at desc);
create index games_map_score_idx on public.games (map_id, total_score desc) where status = 'finished';
create unique index games_one_per_challenge on public.games (challenge_id, user_id) where challenge_id is not null;

create table public.game_rounds (
  game_id uuid not null references public.games (id) on delete cascade,
  round_no integer not null,
  location_id bigint references public.map_locations (id) on delete set null,
  pano_id text not null,
  lat double precision not null,
  lng double precision not null,
  heading real not null default 0,
  pitch real not null default 0,
  zoom real not null default 0,
  district_code text,
  started_at timestamptz,
  deadline timestamptz,
  guess_lat double precision,
  guess_lng double precision,
  distance_m double precision,
  score integer,
  timed_out boolean not null default false,
  time_ms integer,
  guessed_at timestamptz,
  primary key (game_id, round_no)
);

create table public.streak_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  level text not null check (level in ('district', 'village')),
  time_limit_sec integer not null,
  movement text not null check (movement in ('moving', 'nomove', 'nmpz')),
  status text not null default 'playing' check (status in ('playing', 'finished')),
  streak integer not null default 0,
  round_no integer not null default 1,
  -- Current location (answer included — never sent to the client before guessing).
  current jsonb,
  history jsonb not null default '[]'::jsonb,
  round_started_at timestamptz,
  deadline timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index streak_runs_best_idx on public.streak_runs (level, streak desc) where status = 'finished';
create index streak_runs_user_idx on public.streak_runs (user_id, created_at desc);

create table public.explorer_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  district_code text not null,
  best_score integer not null default 0,
  medal text check (medal in ('bronze', 'silver', 'gold', 'platinum')),
  games integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, district_code)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('duels', 'team_duels', 'br_distance', 'br_district', 'br_village')),
  ranked boolean not null default false,
  party_code text,
  map_id uuid references public.maps (id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  rounds jsonb not null default '[]'::jsonb,
  result jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team text,
  placement integer,
  rating_before integer,
  rating_after integer,
  xp_gained integer not null default 0,
  primary key (match_id, user_id)
);
create index match_players_user_idx on public.match_players (user_id);

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index friendships_addressee_idx on public.friendships (addressee_id);

create table public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

create table public.map_likes (
  map_id uuid not null references public.maps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (map_id, user_id)
);

create table public.location_reports (
  id bigint generated always as identity primary key,
  location_id bigint references public.map_locations (id) on delete cascade,
  pano_id text not null,
  user_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('no_coverage', 'indoor', 'bad_quality', 'wrong_place', 'other')),
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

-- ── Profiles are created automatically for every auth user (incl. anonymous guests) ──
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  loop
    code := upper(substr(md5(random()::text || new.id::text), 1, 8));
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  insert into public.profiles (id, nickname, friend_code, is_guest)
  values (
    new.id,
    '旅人' || substr(replace(new.id::text, '-', ''), 1, 4),
    code,
    coalesce(new.is_anonymous, true)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Guests that link an email / Google identity stop being guests.
create or replace function public.handle_user_upgraded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set is_guest = coalesce(new.is_anonymous, false) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_upgraded
  after update of is_anonymous on auth.users
  for each row execute function public.handle_user_upgraded();

alter table public.profiles enable row level security;
alter table public.maps enable row level security;
alter table public.map_locations enable row level security;
alter table public.challenges enable row level security;
alter table public.daily_challenges enable row level security;
alter table public.games enable row level security;
alter table public.game_rounds enable row level security;
alter table public.streak_runs enable row level security;
alter table public.explorer_progress enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.friendships enable row level security;
alter table public.user_achievements enable row level security;
alter table public.map_likes enable row level security;
alter table public.location_reports enable row level security;
