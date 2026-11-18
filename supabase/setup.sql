create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null default 'Family Artist',
  role text not null default 'artist',
  profile_image text not null default 'default-profile.jfif',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists display_name text not null default 'Family Artist',
  add column if not exists role text not null default 'artist',
  add column if not exists profile_image text not null default 'default-profile.jfif';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('artist', 'admin'));

create table if not exists public.devera_portfolio_artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  medium text not null default 'Family artist',
  bio text not null default '',
  profile_image text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.devera_portfolio_artworks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.devera_portfolio_artists (id) on delete cascade,
  title text not null,
  medium text not null default 'Artwork',
  description text not null default '',
  image_url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists devera_portfolio_artworks_artist_id_idx
  on public.devera_portfolio_artworks (artist_id);

create or replace function public.create_artist_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, profile_image)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Family Artist'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'profile_image'), ''), 'default-profile.jfif')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists create_artist_profile_after_signup on auth.users;
create trigger create_artist_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_artist_profile();

insert into public.profiles (id, email, display_name, profile_image)
select
  users.id,
  users.email,
  coalesce(nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''), 'Family Artist'),
  coalesce(nullif(trim(users.raw_user_meta_data ->> 'profile_image'), ''), 'default-profile.jfif')
from auth.users as users
on conflict (id) do update set email = excluded.email;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.devera_portfolio_artists enable row level security;
alter table public.devera_portfolio_artworks enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
drop policy if exists "Artists can update their own profile" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users and admins can read profiles" on public.profiles;
drop policy if exists "Admins can change profile roles" on public.profiles;
create policy "Users and admins can read profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy "Admins can change profile roles"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Anyone can view artists" on public.devera_portfolio_artists;
drop policy if exists "Admins can manage artists" on public.devera_portfolio_artists;
create policy "Anyone can view artists"
  on public.devera_portfolio_artists for select to anon, authenticated
  using (true);
create policy "Admins can manage artists"
  on public.devera_portfolio_artists for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Anyone can view artworks" on public.devera_portfolio_artworks;
drop policy if exists "Admins can manage artworks" on public.devera_portfolio_artworks;
create policy "Anyone can view artworks"
  on public.devera_portfolio_artworks for select to anon, authenticated
  using (true);
create policy "Admins can manage artworks"
  on public.devera_portfolio_artworks for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (role) on public.profiles to authenticated;

revoke all on public.devera_portfolio_artists from anon, authenticated;
grant select on public.devera_portfolio_artists to anon, authenticated;
grant insert, update, delete on public.devera_portfolio_artists to authenticated;

revoke all on public.devera_portfolio_artworks from anon, authenticated;
grant select on public.devera_portfolio_artworks to anon, authenticated;
grant insert, update, delete on public.devera_portfolio_artworks to authenticated;
