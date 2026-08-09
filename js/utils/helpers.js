// ========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ========================================

// Экранирование HTML
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Получение названия месяца
export function getMonthName(month) {
    const names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                   'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    return names[month - 1] || '';
}

// Получение ключа месяца (год-месяц)
export function getMonthKey(year, month) {
    return `${year}-${month}`;
}

// Получение дня недели (0 = Воскресенье)
export function getDayOfWeek(year, month, day) {
    return new Date(year, month - 1, day).getDay();
}

// Проверка, является ли дата сегодняшней
export function isToday(year, month, day) {
    const today = new Date();
    return today.getFullYear() === year && 
           (today.getMonth() + 1) === month && 
           today.getDate() === day;
}

// Форматирование даты
export function formatDate(date) {
    return new Date(date).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Форматирование времени
export function formatTime(date) {
    return new Date(date).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Ключ сегодняшней даты в формате YYYY-MM-DD (для поля checkin_date в Supabase)
export function getTodayDateKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}