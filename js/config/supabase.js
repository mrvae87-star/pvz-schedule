// ========================================
// КОНФИГУРАЦИЯ SUPABASE
// ========================================

const SUPABASE_URL = 'https://zavxflpcsshtnhbcgqhp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OU9Y6mZ2_UCyQvLXlIElAg_xEXiXbxP';

// ========================================
// ИНИЦИАЛИЗАЦИЯ SUPABASE
// ========================================

if (typeof window.supabase === 'undefined') {
    console.error('❌ Supabase не загружен! Проверьте подключение CDN в index.html');
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const supabase = supabaseClient;

// ========================================
// ПРОВЕРКА ПАРОЛЯ (ЧЕРЕЗ EDGE FUNCTION, БЕЗ ХРАНЕНИЯ ПАРОЛЕЙ В КОДЕ)
// ========================================

export async function verifyPassword(type, password) {
    try {
        const { data, error } = await supabase.functions.invoke('verify-password', {
            body: { type, password }
        });

        if (error) {
            console.error('Ошибка проверки пароля:', error);
            return { valid: false, error: error.message };
        }

        return { valid: !!(data && data.valid) };
    } catch (error) {
        console.error('Ошибка проверки пароля:', error);
        return { valid: false, error: error.message };
    }
}

console.log('✅ Supabase клиент инициализирован');
console.log(`🔗 URL: ${SUPABASE_URL}`);

// ========================================
// ПРОВЕРКА СОЕДИНЕНИЯ
// ========================================

export async function testConnection() {
    try {
        const { count, error } = await supabase
            .from('employees')
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            console.error('❌ Ошибка подключения к Supabase:', error.message);
            return { success: false, error: error.message };
        }
        
        console.log('✅ Supabase подключен успешно! В таблице employees:', count, 'записей');
        return { success: true, count: count };
    } catch (error) {
        console.error('❌ Ошибка подключения к Supabase:', error);
        return { success: false, error: error.message };
    }
}

// ========================================
// РАБОТА С СОТРУДНИКАМИ
// ========================================

export async function getEmployees() {
    try {
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .eq('archived', false)
            .order('surname', { ascending: true });
        
        if (error) {
            console.error('Ошибка загрузки сотрудников:', error);
            return { success: false, error: error.message, data: [] };
        }
        
        return { success: true, data: data || [] };
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
        return { success: false, error: error.message, data: [] };
    }
}

export async function getArchivedEmployees() {
    try {
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .eq('archived', true)
            .order('archived_at', { ascending: false });

        if (error) {
            console.error('Ошибка загрузки архива сотрудников:', error);
            return { success: false, error: error.message, data: [] };
        }

        return { success: true, data: data || [] };
    } catch (error) {
        console.error('Ошибка загрузки архива сотрудников:', error);
        return { success: false, error: error.message, data: [] };
    }
}

export async function archiveEmployee(id, employeeName) {
    try {
        const { error } = await supabase
            .from('employees')
            .update({ archived: true, archived_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('Ошибка увольнения сотрудника:', error);
            return { success: false, error: error.message };
        }

        // ====== ЧИСТИМ ВСЕ ЕГО СМЕНЫ (прошлые и будущие) ======
        // Сотрудник больше не работает — график по нему больше не нужен,
        // и check-checkins не должен по нему звонить, даже если в графике
        // на будущие даты у него что-то осталось.
        if (employeeName) {
            const { error: scheduleError } = await supabase
                .from('schedules')
                .delete()
                .eq('employee_name', employeeName);
            if (scheduleError) {
                console.warn('⚠️ Не удалось очистить смены при увольнении:', scheduleError);
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Ошибка увольнения сотрудника:', error);
        return { success: false, error: error.message };
    }
}

export async function restoreEmployee(id) {
    try {
        const { error } = await supabase
            .from('employees')
            .update({ archived: false, archived_at: null })
            .eq('id', id);

        if (error) {
            console.error('Ошибка восстановления сотрудника:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Ошибка восстановления сотрудника:', error);
        return { success: false, error: error.message };
    }
}

// ========================================
// ЖУРНАЛ ИСТОРИИ ПО СОТРУДНИКУ
// ========================================

export async function logActivity(employeeName, eventType, description) {
    try {
        const { error } = await supabase
            .from('activity_log')
            .insert([{
                employee_name: employeeName,
                event_type: eventType,
                description: description
            }]);

        if (error) {
            console.error('Ошибка записи в журнал:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Ошибка записи в журнал:', error);
        return { success: false, error: error.message };
    }
}

export async function getActivityLog(employeeName) {
    try {
        const { data, error } = await supabase
            .from('activity_log')
            .select('*')
            .eq('employee_name', employeeName)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Ошибка загрузки журнала:', error);
            return { success: false, error: error.message, data: [] };
        }

        return { success: true, data: data ?? [] };
    } catch (error) {
        console.error('Ошибка загрузки журнала:', error);
        return { success: false, error: error.message, data: [] };
    }
}

export async function addEmployee(employee) {
    try {
        const { data, error } = await supabase
            .from('employees')
            .insert([{
                name: employee.name,
                surname: employee.surname,
                email: employee.email || '',
                phone: employee.phone || ''
            }])
            .select();
        
        if (error) {
            console.error('Ошибка добавления сотрудника:', error);
            return { success: false, error: error.message, data: null };
        }
        
        return { success: true, data: data?.[0] || null };
    } catch (error) {
        console.error('Ошибка добавления сотрудника:', error);
        return { success: false, error: error.message, data: null };
    }
}

export async function updateEmployee(id, employee) {
    try {
        const { data, error } = await supabase
            .from('employees')
            .update({
                name: employee.name,
                surname: employee.surname,
                email: employee.email || '',
                phone: employee.phone || ''
            })
            .eq('id', id)
            .select();
        
        if (error) {
            console.error('Ошибка обновления сотрудника:', error);
            return { success: false, error: error.message, data: null };
        }
        
        return { success: true, data: data?.[0] || null };
    } catch (error) {
        console.error('Ошибка обновления сотрудника:', error);
        return { success: false, error: error.message, data: null };
    }
}

export async function deleteEmployee(id, employeeName) {
    try {
        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id);
        
        if (error) {
            console.error('Ошибка удаления сотрудника:', error);
            return { success: false, error: error.message };
        }

        // ====== ЧИСТИМ ЕГО СМЕНЫ ======
        // Иначе они "осиротеют" в schedules — check-checkins будет
        // по-прежнему находить их и звонить по несуществующему сотруднику.
        if (employeeName) {
            const { error: scheduleError } = await supabase
                .from('schedules')
                .delete()
                .eq('employee_name', employeeName);
            if (scheduleError) {
                console.warn('⚠️ Не удалось очистить schedules для удалённого сотрудника:', scheduleError);
            }
        }
        
        return { success: true };
    } catch (error) {
        console.error('Ошибка удаления сотрудника:', error);
        return { success: false, error: error.message };
    }
}

// ========================================
// РАБОТА С ПВЗ
// ========================================

export async function getPVZ() {
    try {
        const { data, error } = await supabase
            .from('pvz')
            .select('*')
            .order('name', { ascending: true });
        
        if (error) {
            console.error('Ошибка загрузки ПВЗ:', error);
            return { success: false, error: error.message, data: {} };
        }
        
        const result = {};
        data.forEach(pvz => {
            result[pvz.name] = {
                employeesHistory: pvz.employees_history || {},
                schedules: pvz.schedules || {}
            };
        });
        
        return { success: true, data: result };
    } catch (error) {
        console.error('Ошибка загрузки ПВЗ:', error);
        return { success: false, error: error.message, data: {} };
    }
}

export async function savePVZ(pvzName, pvzData) {
    try {
        const { data, error } = await supabase
            .from('pvz')
            .upsert({
                name: pvzName,
                employees_history: pvzData.employeesHistory || {},
                schedules: pvzData.schedules || {}
            }, {
                onConflict: 'name'
            })
            .select();
        
        if (error) {
            console.error('Ошибка сохранения ПВЗ:', error);
            return { success: false, error: error.message };
        }
        
        console.log(`✅ ПВЗ "${pvzName}" сохранён в Supabase`);
        return { success: true, data: data?.[0] || null };
    } catch (error) {
        console.error('Ошибка сохранения ПВЗ:', error);
        return { success: false, error: error.message };
    }
}

// Убрать сотрудника с ПВЗ на месяц — чистит его смены и в реляционной
// таблице schedules (от неё зависят автоматические звонки), а не только
// в JSON-поле pvz.schedules, которое используется для отображения
// календаря на сайте. Без этого удаление "видно" только в интерфейсе,
// а сервер продолжает считать, что смена всё ещё стоит.
export async function deleteScheduleForEmployeeMonth(pvzName, employeeName, year, month) {
    try {
        const { error } = await supabase
            .from('schedules')
            .delete()
            .eq('pvz_name', pvzName)
            .eq('employee_name', employeeName)
            .eq('year', year)
            .eq('month', month);

        if (error) {
            console.error('Ошибка очистки смен сотрудника за месяц:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Ошибка очистки смен сотрудника за месяц:', error);
        return { success: false, error: error.message };
    }
}

// Получить последний сохранённый баланс zvonok.com (обновляется сервером
// при каждом реальном звонке — отдельного метода "узнать баланс" в API нет).
export async function getZvonokBalance() {
    try {
        const { data, error } = await supabase
            .from('zvonok_status')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error('Ошибка загрузки баланса zvonok.com:', error);
            return { success: false, error: error.message, data: null };
        }

        return { success: true, data: data || null };
    } catch (error) {
        console.error('Ошибка загрузки баланса zvonok.com:', error);
        return { success: false, error: error.message, data: null };
    }
}

export async function deletePVZ(pvzName) {
    try {
        const { error } = await supabase
            .from('pvz')
            .delete()
            .eq('name', pvzName);
        
        if (error) {
            console.error('Ошибка удаления ПВЗ:', error);
            return { success: false, error: error.message };
        }

        // ====== ЧИСТИМ СВЯЗАННЫЕ ЗАПИСИ ======
        // Иначе смены удалённого ПВЗ "осиротеют" в schedules и
        // pvz_settings — и check-checkins будет по ним звонить,
        // хотя такого ПВЗ на сайте уже нет.
        const { error: scheduleError } = await supabase
            .from('schedules')
            .delete()
            .eq('pvz_name', pvzName);
        if (scheduleError) {
            console.warn('⚠️ Не удалось очистить schedules для удалённого ПВЗ:', scheduleError);
        }

        const { error: settingsError } = await supabase
            .from('pvz_settings')
            .delete()
            .eq('pvz_name', pvzName);
        if (settingsError) {
            console.warn('⚠️ Не удалось очистить pvz_settings для удалённого ПВЗ:', settingsError);
        }
        
        return { success: true };
    } catch (error) {
        console.error('Ошибка удаления ПВЗ:', error);
        return { success: false, error: error.message };
    }
}

// ========================================
// РАБОТА С ГРАФИКОМ
// ========================================

export async function saveSchedule(pvzName, employeeName, year, month, day, isWork) {
    try {
        const { data, error } = await supabase
            .from('schedules')
            .upsert({
                pvz_name: pvzName,
                employee_name: employeeName,
                year: year,
                month: month,
                day: day,
                is_working: isWork
            }, {
                onConflict: 'pvz_name, employee_name, year, month, day'
            })
            .select();
        
        if (error) {
            console.error('Ошибка сохранения графика:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data?.[0] || null };
    } catch (error) {
        console.error('Ошибка сохранения графика:', error);
        return { success: false, error: error.message };
    }
}

export async function getSchedules(pvzName, year, month) {
    try {
        const { data, error } = await supabase
            .from('schedules')
            .select('*')
            .eq('pvz_name', pvzName)
            .eq('year', year)
            .eq('month', month);
        
        if (error) {
            console.error('Ошибка загрузки графика:', error);
            return { success: false, error: error.message, data: {} };
        }
        
        const result = {};
        data.forEach(item => {
            if (!result[item.employee_name]) {
                result[item.employee_name] = {};
            }
            const dayKey = `${item.year}-${item.month}-${item.day}`;
            result[item.employee_name][dayKey] = item.is_working;
        });
        
        return { success: true, data: result };
    } catch (error) {
        console.error('Ошибка загрузки графика:', error);
        return { success: false, error: error.message, data: {} };
    }
}

// Получить график на конкретный день сразу по всем ПВЗ одним запросом —
// используется для периодического обновления "сегодня", чтобы открытая
// вкладка чекина видела свежие изменения графика (перестановки, снятие
// смены и т.д.), а не только то, что было загружено при открытии страницы.
export async function getScheduleForDate(year, month, day) {
    try {
        const { data, error } = await supabase
            .from('schedules')
            .select('pvz_name, employee_name, is_working')
            .eq('year', year)
            .eq('month', month)
            .eq('day', day);

        if (error) {
            console.error('Ошибка загрузки графика на дату:', error);
            return { success: false, error: error.message, data: [] };
        }

        return { success: true, data: data ?? [] };
    } catch (error) {
        console.error('Ошибка загрузки графика на дату:', error);
        return { success: false, error: error.message, data: [] };
    }
}

// ========================================
// РАБОТА С ЗАРПЛАТОЙ
// ========================================

export async function saveSalary(employeeName, year, month, salaryData) {
    try {
        const { data, error } = await supabase
            .from('salary')
            .upsert({
                employee_name: employeeName,
                year: year,
                month: month,
                rate: salaryData.rate || 1500,
                trainee_days: salaryData.traineeDays || 0,
                trainee_rate: salaryData.traineeRate || 800,
                advance: salaryData.advance || 0,
                money_transferred: salaryData.moneyTransferred || 0
            }, {
                onConflict: 'employee_name, year, month'
            })
            .select();
        
        if (error) {
            console.error('Ошибка сохранения зарплаты:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data?.[0] || null };
    } catch (error) {
        console.error('Ошибка сохранения зарплаты:', error);
        return { success: false, error: error.message };
    }
}

export async function getSalary(employeeName, year, month) {
    try {
        const { data, error } = await supabase
            .from('salary')
            .select('*')
            .eq('employee_name', employeeName)
            .eq('year', year)
            .eq('month', month)
            .maybeSingle();
        
        if (error) {
            console.error('Ошибка загрузки зарплаты:', error);
            return { success: false, error: error.message, data: null };
        }
        
        return { success: true, data: data || null };
    } catch (error) {
        console.error('Ошибка загрузки зарплаты:', error);
        return { success: false, error: error.message, data: null };
    }
}

// ========================================
// РАБОТА С НАСТРОЙКАМИ ПВЗ (ВРЕМЯ ОТКРЫТИЯ)
// ========================================

// Сохранить время открытия ПВЗ
export async function savePvzOpenTime(pvzName, openTime) {
    try {
        // Проверяем, существует ли уже запись
        const { data: existing, error: findError } = await supabase
            .from('pvz_settings')
            .select('*')
            .eq('pvz_name', pvzName)
            .maybeSingle();
        
        if (findError && findError.code !== 'PGRST116') {
            console.error('Ошибка поиска настроек ПВЗ:', findError);
            return { success: false, error: findError.message };
        }
        
        let result;
        if (existing) {
            // Обновляем существующую запись
            const { data, error } = await supabase
                .from('pvz_settings')
                .update({ open_time: openTime, updated_at: new Date().toISOString() })
                .eq('pvz_name', pvzName)
                .select();
            if (error) throw error;
            result = data;
        } else {
            // Создаём новую запись
            const { data, error } = await supabase
                .from('pvz_settings')
                .insert([{ pvz_name: pvzName, open_time: openTime }])
                .select();
            if (error) throw error;
            result = data;
        }
        
        console.log(`✅ Время открытия для "${pvzName}" сохранено: ${openTime}`);
        return { success: true, data: result?.[0] || null };
    } catch (error) {
        console.error('Ошибка сохранения времени открытия ПВЗ:', error);
        return { success: false, error: error.message };
    }
}

// Получить все настройки ПВЗ
export async function getPvzSettings() {
    try {
        const { data, error } = await supabase
            .from('pvz_settings')
            .select('*');
        
        if (error) {
            console.error('Ошибка загрузки настроек ПВЗ:', error);
            return { success: false, error: error.message, data: {} };
        }
        
        // Преобразуем в формат { pvzName: openTime }
        const result = {};
        data.forEach(item => {
            result[item.pvz_name] = item.open_time;
        });
        
        console.log('✅ Настройки ПВЗ загружены:', result);
        return { success: true, data: result };
    } catch (error) {
        console.error('Ошибка загрузки настроек ПВЗ:', error);
        return { success: false, error: error.message, data: {} };
    }
}

// ========================================
// РАБОТА С ЧЕКИНАМИ (ВЫХОД НА СМЕНУ)
// ========================================

// Отметить сотрудника на смену за сегодняшнюю дату
export async function saveCheckin(employeeName, pvzName, checkinDate) {
    try {
        const { data, error } = await supabase
            .from('checkins')
            .upsert({
                employee_name: employeeName,
                pvz_name: pvzName,
                checkin_date: checkinDate, // формат YYYY-MM-DD
                checkin_time: new Date().toISOString(),
                status: 'confirmed'
            }, {
                onConflict: 'employee_name, checkin_date'
            })
            .select();

        if (error) {
            console.error('Ошибка сохранения чекина:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data?.[0] || null };
    } catch (error) {
        console.error('Ошибка сохранения чекина:', error);
        return { success: false, error: error.message };
    }
}

// Получить все чекины за конкретную дату
export async function getCheckinsForDate(checkinDate) {
    try {
        const { data, error } = await supabase
            .from('checkins')
            .select('*')
            .eq('checkin_date', checkinDate);

        if (error) {
            console.error('Ошибка загрузки чекинов:', error);
            return { success: false, error: error.message, data: {} };
        }

        // Преобразуем в формат { employeeName: { status, time, pvz } }
        const result = {};
        data.forEach(item => {
            result[item.employee_name] = {
                status: item.status,
                time: item.checkin_time,
                pvz: item.pvz_name
            };
        });

        return { success: true, data: result };
    } catch (error) {
        console.error('Ошибка загрузки чекинов:', error);
        return { success: false, error: error.message, data: {} };
    }
}

// ========================================
// РАБОТА С ЭКСТРЕННЫМИ КОНТАКТАМИ
// ========================================

// Сохранить (создать или обновить) экстренные контакты сотрудника
export async function saveEmergencyContact(employeeName, address, contacts, documents) {
    try {
        const { data: existing, error: findError } = await supabase
            .from('emergency_contacts')
            .select('*')
            .eq('employee_name', employeeName)
            .maybeSingle();

        if (findError && findError.code !== 'PGRST116') {
            console.error('Ошибка поиска экстренных контактов:', findError);
            return { success: false, error: findError.message };
        }

        let result;
        if (existing) {
            const { data, error } = await supabase
                .from('emergency_contacts')
                .update({ address, contacts, documents })
                .eq('employee_name', employeeName)
                .select();
            if (error) throw error;
            result = data;
        } else {
            const { data, error } = await supabase
                .from('emergency_contacts')
                .insert([{ employee_name: employeeName, address, contacts, documents }])
                .select();
            if (error) throw error;
            result = data;
        }

        return { success: true, data: result?.[0] || null };
    } catch (error) {
        console.error('Ошибка сохранения экстренных контактов:', error);
        return { success: false, error: error.message };
    }
}

// Получить экстренные контакты всех сотрудников
export async function getEmergencyContacts() {
    try {
        const { data, error } = await supabase
            .from('emergency_contacts')
            .select('*');

        if (error) {
            console.error('Ошибка загрузки экстренных контактов:', error);
            return { success: false, error: error.message, data: {} };
        }

        const result = {};
        (data ?? []).forEach(item => {
            result[item.employee_name] = {
                address: item.address || '',
                contacts: item.contacts || [],
                documents: item.documents || {}
            };
        });

        return { success: true, data: result };
    } catch (error) {
        console.error('Ошибка загрузки экстренных контактов:', error);
        return { success: false, error: error.message, data: {} };
    }
}

// Удалить экстренные контакты сотрудника
export async function deleteEmergencyContact(employeeName) {
    try {
        const { error } = await supabase
            .from('emergency_contacts')
            .delete()
            .eq('employee_name', employeeName);

        if (error) {
            console.error('Ошибка удаления экстренных контактов:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Ошибка удаления экстренных контактов:', error);
        return { success: false, error: error.message };
    }
}

// ========================================
// НОМЕРА РУКОВОДИТЕЛЯ ДЛЯ АВТОЗВОНКА
// ========================================

// Получить список всех номеров
export async function getManagerPhones() {
    try {
        const { data, error } = await supabase
            .from('manager_phones')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Ошибка загрузки номеров руководителя:', error);
            return { success: false, error: error.message, data: [] };
        }

        return { success: true, data: (data ?? []).map(item => item.phone) };
    } catch (error) {
        console.error('Ошибка загрузки номеров руководителя:', error);
        return { success: false, error: error.message, data: [] };
    }
}

// Добавить номер
export async function addManagerPhone(phone) {
    try {
        const { data, error } = await supabase
            .from('manager_phones')
            .insert([{ phone }])
            .select();

        if (error) {
            console.error('Ошибка добавления номера:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data?.[0] || null };
    } catch (error) {
        console.error('Ошибка добавления номера:', error);
        return { success: false, error: error.message };
    }
}

// Удалить номер
export async function deleteManagerPhone(phone) {
    try {
        const { error } = await supabase
            .from('manager_phones')
            .delete()
            .eq('phone', phone);

        if (error) {
            console.error('Ошибка удаления номера:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Ошибка удаления номера:', error);
        return { success: false, error: error.message };
    }
}

// ========================================
// "ВАЖНО ЗНАТЬ" — СПИСОК ШТРАФОВ/ПРАВИЛ
// ========================================

// Получить все записи (сначала новые)
export async function getImportantNotices() {
    try {
        const { data, error } = await supabase
            .from('important_notices')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Ошибка загрузки важной информации:', error);
            return { success: false, error: error.message, data: [] };
        }

        return { success: true, data: data ?? [] };
    } catch (error) {
        console.error('Ошибка загрузки важной информации:', error);
        return { success: false, error: error.message, data: [] };
    }
}

// Добавить запись
export async function addImportantNotice(title, amount) {
    try {
        const { data, error } = await supabase
            .from('important_notices')
            .insert([{ title, amount }])
            .select();

        if (error) {
            console.error('Ошибка добавления записи:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data?.[0] || null };
    } catch (error) {
        console.error('Ошибка добавления записи:', error);
        return { success: false, error: error.message };
    }
}

// Удалить запись
export async function deleteImportantNotice(id) {
    try {
        const { error } = await supabase
            .from('important_notices')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Ошибка удаления записи:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Ошибка удаления записи:', error);
        return { success: false, error: error.message };
    }
}

// ========================================
// ПОДРАБОТКИ
// ========================================

export async function saveExtraWork(employeeName, pvzName, date, hours, hourlyRate, description) {
    try {
        const { data, error } = await supabase
            .from('extra_works')
            .insert([{
                employee_name: employeeName,
                pvz_name: pvzName,
                date: date,
                hours: hours,
                hourly_rate: hourlyRate,
                description: description
            }])
            .select();

        if (error) {
            console.error('Ошибка сохранения подработки:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data?.[0] || null };
    } catch (error) {
        console.error('Ошибка сохранения подработки:', error);
        return { success: false, error: error.message };
    }
}

export async function getAllExtraWorks() {
    try {
        const { data, error } = await supabase
            .from('extra_works')
            .select('*');

        if (error) {
            console.error('Ошибка загрузки подработок:', error);
            return { success: false, error: error.message, data: {} };
        }

        const result = {};
        (data ?? []).forEach(item => {
            if (!result[item.employee_name]) result[item.employee_name] = [];
            result[item.employee_name].push({
                id: item.id,
                pvz: item.pvz_name,
                date: item.date,
                hours: item.hours,
                hourlyRate: item.hourly_rate,
                description: item.description || '',
                amount: (item.hours || 0) * (item.hourly_rate || 0)
            });
        });

        return { success: true, data: result };
    } catch (error) {
        console.error('Ошибка загрузки подработок:', error);
        return { success: false, error: error.message, data: {} };
    }
}

export async function deleteExtraWorkRemote(id) {
    try {
        const { error } = await supabase
            .from('extra_works')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Ошибка удаления подработки:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Ошибка удаления подработки:', error);
        return { success: false, error: error.message };
    }
}

// ========================================
// ШТРАФЫ
// ========================================

export async function saveFine(employeeName, date, amount, description) {
    try {
        const { data, error } = await supabase
            .from('fines')
            .insert([{
                employee_name: employeeName,
                date: date,
                amount: amount,
                description: description
            }])
            .select();

        if (error) {
            console.error('Ошибка сохранения штрафа:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data?.[0] || null };
    } catch (error) {
        console.error('Ошибка сохранения штрафа:', error);
        return { success: false, error: error.message };
    }
}

export async function getAllFines() {
    try {
        const { data, error } = await supabase
            .from('fines')
            .select('*');

        if (error) {
            console.error('Ошибка загрузки штрафов:', error);
            return { success: false, error: error.message, data: {} };
        }

        const result = {};
        (data ?? []).forEach(item => {
            if (!result[item.employee_name]) result[item.employee_name] = [];
            result[item.employee_name].push({
                id: item.id,
                date: item.date,
                amount: item.amount,
                description: item.description || ''
            });
        });

        return { success: true, data: result };
    } catch (error) {
        console.error('Ошибка загрузки штрафов:', error);
        return { success: false, error: error.message, data: {} };
    }
}

export async function deleteFineRemote(id) {
    try {
        const { error } = await supabase
            .from('fines')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Ошибка удаления штрафа:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Ошибка удаления штрафа:', error);
        return { success: false, error: error.message };
    }
}

// ========================================
// ЗАГРУЗКА ВСЕЙ ЗАРПЛАТЫ (для основного расчёта)
// ========================================

export async function getAllSalary() {
    try {
        const { data, error } = await supabase
            .from('salary')
            .select('*');

        if (error) {
            console.error('Ошибка загрузки зарплаты:', error);
            return { success: false, error: error.message, data: {} };
        }

        const result = {};
        (data ?? []).forEach(item => {
            const monthKey = `${item.year}-${item.month}`;
            if (!result[item.employee_name]) result[item.employee_name] = {};
            result[item.employee_name][monthKey] = {
                rate: item.rate,
                traineeDays: item.trainee_days,
                traineeRate: item.trainee_rate,
                advance: item.advance,
                moneyTransferred: item.money_transferred
            };
        });

        return { success: true, data: result };
    } catch (error) {
        console.error('Ошибка загрузки зарплаты:', error);
        return { success: false, error: error.message, data: {} };
    }
}

// ========================================
// ЭКСПОРТ ВСЕХ ФУНКЦИЙ
// ========================================

export default {
    supabase,
    testConnection,
    getEmployees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    getPVZ,
    savePVZ,
    deletePVZ,
    deleteScheduleForEmployeeMonth,
    saveSchedule,
    getSchedules,
    getScheduleForDate,
    saveSalary,
    getSalary,
    getAllSalary,
    savePvzOpenTime,
    getPvzSettings,
    saveCheckin,
    getCheckinsForDate,
    saveEmergencyContact,
    getEmergencyContacts,
    deleteEmergencyContact,
    getManagerPhones,
    addManagerPhone,
    deleteManagerPhone,
    saveExtraWork,
    getAllExtraWorks,
    deleteExtraWorkRemote,
    saveFine,
    getAllFines,
    deleteFineRemote,
    getArchivedEmployees,
    archiveEmployee,
    restoreEmployee,
    logActivity,
    getActivityLog,
    getImportantNotices,
    addImportantNotice,
    deleteImportantNotice,
    verifyPassword,
    getZvonokBalance
};