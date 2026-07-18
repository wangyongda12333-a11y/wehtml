-- X.Z.C 资源站 Supabase 初始化脚本
-- 在 Supabase Dashboard -> SQL Editor 中完整执行一次。

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  role text not null default 'pending' check (role in ('pending', 'member', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  description text not null check (char_length(description) between 1 and 240),
  content text not null default '' check (char_length(content) <= 5000),
  category text not null check (char_length(category) between 1 and 30),
  subcategory text not null default '其他' check (char_length(subcategory) <= 30),
  version text not null default '1.0.0' check (char_length(version) <= 20),
  color text not null default 'blue' check (color in ('blue', 'violet', 'orange', 'green', 'cyan', 'rose')),
  icon text not null default 'NEW' check (char_length(icon) <= 4),
  member_only boolean not null default false,
  downloads bigint not null default 0 check (downloads >= 0),
  file_path text unique,
  file_name text,
  file_type text,
  file_size bigint check (file_size is null or file_size between 0 and 52428800),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))),
    'pending'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('member', 'admin')
  );
$$;

create or replace function public.can_access_resource(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.resources
    where file_path = object_name
      and (member_only = false or public.is_member())
  );
$$;

create or replace function public.increment_download(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.resources
  set downloads = downloads + 1
  where id = p_resource_id
    and (member_only = false or public.is_member());
  if not found then
    raise exception 'resource unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_member() from public;
revoke all on function public.can_access_resource(text) from public;
revoke all on function public.increment_download(uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_member() to anon, authenticated;
grant execute on function public.can_access_resource(text) to anon, authenticated;
grant execute on function public.increment_download(uuid) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.resources enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "resources_public_read" on public.resources;
create policy "resources_public_read"
on public.resources for select
to anon, authenticated
using (true);

drop policy if exists "resources_admin_insert" on public.resources;
create policy "resources_admin_insert"
on public.resources for insert
to authenticated
with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "resources_admin_update" on public.resources;
create policy "resources_admin_update"
on public.resources for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "resources_admin_delete" on public.resources;
create policy "resources_admin_delete"
on public.resources for delete
to authenticated
using (public.is_admin());

grant select on public.resources to anon, authenticated;
grant insert, update, delete on public.resources to authenticated;
grant select on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('resources', 'resources', false, 52428800)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "resource_files_select" on storage.objects;
create policy "resource_files_select"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'resources'
  and (public.is_admin() or public.can_access_resource(name))
);

drop policy if exists "resource_files_admin_insert" on storage.objects;
create policy "resource_files_admin_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'resources' and public.is_admin());

drop policy if exists "resource_files_admin_delete" on storage.objects;
create policy "resource_files_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'resources' and public.is_admin());

-- 创建首位管理员：
-- 1. Dashboard -> Authentication -> Users 中选择 Create new user，邮箱填写：你的账号@example.com
-- 2. 确认该用户后执行下面语句，把 wangyongda 换成你的账号：
-- update public.profiles set role = 'admin' where username = 'wangyongda';
