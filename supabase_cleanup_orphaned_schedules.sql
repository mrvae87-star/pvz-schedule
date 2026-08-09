-- Удаляем "осиротевшие" записи графика и настроек времени открытия,
-- которые остались от уже удалённых ПВЗ (сам ПВЗ удалён из таблицы pvz,
-- но его смены в schedules/pvz_settings продолжали "висеть" в базе —
-- именно из-за этого система звонила по несуществующим ПВЗ).

delete from schedules
where pvz_name not in (select name from pvz);

delete from pvz_settings
where pvz_name not in (select name from pvz);
