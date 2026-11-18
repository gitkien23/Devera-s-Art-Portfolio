create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Family Artist',
  role text not null default 'artist',
  profile_image text not null default 'default-profile.jfif',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text not null default 'Family Artist',
  add column if not exists role text not null default 'artist',
  add column if not exists profile_image text not null default 'default-profile.jfif';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('artist', 'admin'));

create or replace function public.create_artist_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, profile_image)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Family Artist'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'profile_image'), ''), 'default-profile.jfif')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_artist_profile_after_signup on auth.users;
create trigger create_artist_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_artist_profile();

alter table public.profiles enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
drop policy if exists "Artists can update their own profile" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

grant select on public.profiles to authenticated;
