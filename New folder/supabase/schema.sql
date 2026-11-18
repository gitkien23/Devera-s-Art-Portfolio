create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  medium text not null default '' check (char_length(medium) <= 60),
  bio text not null default '' check (char_length(bio) <= 280),
  profile_image text,
  role text not null default 'artist' check (role in ('artist', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.artworks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 240),
  medium text not null default 'Artwork' check (char_length(medium) <= 50),
  image_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '',
  color text not null default '#b7c4a4',
  created_at timestamptz not null default now()
);

create index if not exists artworks_user_created_idx
  on public.artworks (user_id, created_at desc);
create index if not exists artworks_status_created_idx
  on public.artworks (status, created_at desc);

create or replace function public.create_artist_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Family Artist')
  );
  return new;
end;
$$;

drop trigger if exists create_artist_profile_after_signup on auth.users;
create trigger create_artist_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_artist_profile();

create or replace function public.is_gallery_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.artworks enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

drop policy if exists "Artists can update their own profile" on public.profiles;
create policy "Artists can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and role = 'artist')
  with check (id = (select auth.uid()) and role = 'artist');

drop policy if exists "Approved artwork and owner/admin views" on public.artworks;
create policy "Approved artwork and owner/admin views"
  on public.artworks for select
  using (
    status = 'approved'
    or user_id = (select auth.uid())
    or (select public.is_gallery_admin())
  );

drop policy if exists "Artists can submit pending artwork" on public.artworks;
create policy "Artists can submit pending artwork"
  on public.artworks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and not (select public.is_gallery_admin())
  );

drop policy if exists "Artists can edit their own artwork" on public.artworks;
create policy "Artists can edit their own artwork"
  on public.artworks for update to authenticated
  using (user_id = (select auth.uid()) and not (select public.is_gallery_admin()))
  with check (user_id = (select auth.uid()) and status = 'pending');

drop policy if exists "Admins can review artwork" on public.artworks;
create policy "Admins can review artwork"
  on public.artworks for update to authenticated
  using ((select public.is_gallery_admin()))
  with check ((select public.is_gallery_admin()));

drop policy if exists "Owners and admins can delete artwork" on public.artworks;
create policy "Owners and admins can delete artwork"
  on public.artworks for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_gallery_admin())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-images', 'portfolio-images', true, 2097152, array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Gallery images are publicly readable" on storage.objects;
create policy "Gallery images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'portfolio-images');

drop policy if exists "Users upload images to their own folder" on storage.objects;
create policy "Users upload images to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portfolio-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users update images in their own folder" on storage.objects;
create policy "Users update images in their own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'portfolio-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'portfolio-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete images in their own folder" on storage.objects;
create policy "Users delete images in their own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'portfolio-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.artworks to authenticated;
grant select on public.artworks to anon;
