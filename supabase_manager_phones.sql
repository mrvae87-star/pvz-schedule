-- Таблица номеров руководителя для автозвонков при пропуске чекина
-- (эта таблица уже создана и заполнена в Supabase — файл оставлен
-- только как справочная копия структуры, без реальных номеров)
create table if not exists manager_phones (
    id uuid primary key default gen_random_uuid(),
    phone text not null unique,
    created_at timestamptz default now()
);

alter table manager_phones enable row level security;

create policy "Allow anon select on manager_phones"
    on manager_phones for select
    using (true);

create policy "Allow anon insert on manager_phones"
    on manager_phones for insert
    with check (true);

create policy "Allow anon delete on manager_phones"
    on manager_phones for delete
    using (true);
