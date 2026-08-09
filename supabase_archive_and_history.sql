-- Архив уволенных сотрудников: помечаем вместо удаления
alter table employees add column if not exists archived boolean default false;
alter table employees add column if not exists archived_at timestamptz;

-- Журнал истории изменений по сотруднику
create table if not exists activity_log (
    id uuid primary key default gen_random_uuid(),
    employee_name text not null,
    event_type text,
    description text not null,
    created_at timestamptz default now()
);

alter table activity_log enable row level security;

create policy "Allow anon select on activity_log"
    on activity_log for select
    using (true);

create policy "Allow anon insert on activity_log"
    on activity_log for insert
    with check (true);
