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
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  medium text not null default 'Family artist',
  bio text not null default '',
  profile_image text not null default 'default-profile.jfif',
  profile_image_path text not null default '',
  created_at timestamptz not null default now()
);

alter table public.devera_portfolio_artists
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists name text not null default 'Family Artist',
  add column if not exists medium text not null default 'Family artist',
  add column if not exists bio text not null default '',
  add column if not exists profile_image text not null default 'default-profile.jfif',
  add column if not exists profile_image_path text not null default '';

create unique index if not exists devera_portfolio_artists_user_id_idx
  on public.devera_portfolio_artists (user_id);

create table if not exists public.devera_portfolio_artworks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.devera_portfolio_artists (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,
  title text not null,
  medium text not null default 'Artwork',
  description text not null default '',
  image_url text not null default '',
  image_path text not null default '',
  created_at timestamptz not null default now()
);

alter table public.devera_portfolio_artworks
  add column if not exists owner_id uuid references auth.users (id) on delete cascade,
  add column if not exists image_path text not null default '';

create index if not exists devera_portfolio_artworks_artist_id_idx
  on public.devera_portfolio_artworks (artist_id);
create index if not exists devera_portfolio_artworks_owner_id_idx
  on public.devera_portfolio_artworks (owner_id);

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

create or replace function public.sync_portfolio_artist_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null then
    update public.profiles
    set display_name = new.name,
        profile_image = new.profile_image
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_portfolio_artist_profile_after_change
  on public.devera_portfolio_artists;
create trigger sync_portfolio_artist_profile_after_change
  after insert or update of user_id, name, profile_image
  on public.devera_portfolio_artists
  for each row execute function public.sync_portfolio_artist_profile();

create or replace function public.create_artist_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_name text;
  initial_image text;
begin
  initial_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Family Artist');
  initial_image := coalesce(nullif(trim(new.raw_user_meta_data ->> 'profile_image'), ''), 'default-profile.jfif');

  insert into public.profiles (id, email, display_name, profile_image)
  values (new.id, new.email, initial_name, initial_image)
  on conflict (id) do update set email = excluded.email;

  insert into public.devera_portfolio_artists (user_id, name, profile_image)
  values (new.id, initial_name, initial_image)
  on conflict (user_id) do nothing;

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

insert into public.devera_portfolio_artists (user_id, name, profile_image)
select id, display_name, profile_image
from public.profiles
on conflict (user_id) do nothing;

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
drop policy if exists "Users can create their artist profile" on public.devera_portfolio_artists;
drop policy if exists "Users can update their artist profile" on public.devera_portfolio_artists;
create policy "Anyone can view artists"
  on public.devera_portfolio_artists for select to anon, authenticated
  using (true);
create policy "Admins can manage artists"
  on public.devera_portfolio_artists for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "Users can create their artist profile"
  on public.devera_portfolio_artists for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users can update their artist profile"
  on public.devera_portfolio_artists for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Anyone can view artworks" on public.devera_portfolio_artworks;
drop policy if exists "Admins can manage artworks" on public.devera_portfolio_artworks;
drop policy if exists "Users can add own artworks" on public.devera_portfolio_artworks;
drop policy if exists "Users can update own artworks" on public.devera_portfolio_artworks;
drop policy if exists "Users can delete own artworks" on public.devera_portfolio_artworks;
create policy "Anyone can view artworks"
  on public.devera_portfolio_artworks for select to anon, authenticated
  using (true);
create policy "Admins can manage artworks"
  on public.devera_portfolio_artworks for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "Users can add own artworks"
  on public.devera_portfolio_artworks for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.devera_portfolio_artists
      where id = artist_id and user_id = (select auth.uid())
    )
  );
create policy "Users can update own artworks"
  on public.devera_portfolio_artworks for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.devera_portfolio_artists
      where id = artist_id and user_id = (select auth.uid())
    )
  );
create policy "Users can delete own artworks"
  on public.devera_portfolio_artworks for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (role) on public.profiles to authenticated;

revoke all on public.devera_portfolio_artists from anon, authenticated;
grant select on public.devera_portfolio_artists to anon, authenticated;
grant insert, update, delete on public.devera_portfolio_artists to authenticated;

revoke all on public.devera_portfolio_artworks from anon, authenticated;
grant select on public.devera_portfolio_artworks to anon, authenticated;
grant insert, update, delete on public.devera_portfolio_artworks to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'devera-portfolio-images',
  'devera-portfolio-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read De Vera portfolio images" on storage.objects;
drop policy if exists "Users can upload own De Vera portfolio images" on storage.objects;
drop policy if exists "Users can update own De Vera portfolio images" on storage.objects;
drop policy if exists "Users can delete own De Vera portfolio images" on storage.objects;
drop policy if exists "Admins can manage De Vera portfolio images" on storage.objects;
create policy "Public can read De Vera portfolio images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'devera-portfolio-images');
create policy "Users can upload own De Vera portfolio images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'devera-portfolio-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users can update own De Vera portfolio images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'devera-portfolio-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'devera-portfolio-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users can delete own De Vera portfolio images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'devera-portfolio-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Admins can manage De Vera portfolio images"
  on storage.objects for all to authenticated
  using (bucket_id = 'devera-portfolio-images' and public.is_admin())
  with check (bucket_id = 'devera-portfolio-images' and public.is_admin());
