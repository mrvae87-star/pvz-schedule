-- Таблица "Важно знать" — список штрафов/правил с суммами
create table if not exists important_notices (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    amount numeric,
    created_at timestamptz default now()
);

alter table important_notices enable row level security;

create policy "Allow anon select on important_notices"
    on important_notices for select
    using (true);

create policy "Allow anon insert on important_notices"
    on important_notices for insert
    with check (true);

create policy "Allow anon delete on important_notices"
    on important_notices for delete
    using (true);
