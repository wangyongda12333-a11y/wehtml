-- X.Z.C 资源站：已发布资源编辑与封面功能迁移
-- 在 Supabase Dashboard -> SQL Editor 中完整执行一次。

alter table public.resources add column if not exists cover_path text;
alter table public.resources add column if not exists cover_name text;
alter table public.resources add column if not exists cover_type text;
alter table public.resources add column if not exists updated_at timestamptz not null default now();
create unique index if not exists resources_cover_path_key on public.resources (cover_path) where cover_path is not null;

drop policy if exists "resources_public_read" on public.resources;
create policy "resources_public_read"
on public.resources for select
to anon, authenticated
using (member_only = false or public.is_member());

insert into storage.buckets (id, name, public, file_size_limit)
values ('resource-covers', 'resource-covers', true, 5242880)
on conflict (id) do update
set public = true, file_size_limit = excluded.file_size_limit;

drop policy if exists "resource_covers_admin_insert" on storage.objects;
create policy "resource_covers_admin_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'resource-covers' and public.is_admin());

drop policy if exists "resource_covers_admin_delete" on storage.objects;
create policy "resource_covers_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'resource-covers' and public.is_admin());
