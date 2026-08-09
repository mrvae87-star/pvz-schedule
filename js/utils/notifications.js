// ========================================
// УВЕДОМЛЕНИЯ
// ========================================

let notificationSound = null;

// Инициализация звука уведомлений
export function initNotificationSound() {
    try {
        notificationSound = new Audio();
        // Создаём простой звук через Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;
        notificationSound.play = function() {
            try {
                oscillator.start();
                setTimeout(() => oscillator.stop(), 200);
            } catch (e) {
                console.log('Звук не поддерживается');
            }
        };
        console.log('🔊 Звук уведомлений инициализирован');
    } catch (error) {
        console.log('⚠️ Звук уведомлений не доступен');
    }
}

// Показать уведомление
export function showNotification(message, isError = false) {
    const existing = document.querySelector('.custom-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'custom-notification';
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${isError ? '#ef4444' : '#22c55e'};
        color: white;
        padding: 14px 24px;
        border-radius: 12px;
        font-weight: 600;
        font-size: 0.95rem;
        z-index: 9999;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        max-width: 90%;
        text-align: center;
        animation: slideUp 0.3s ease;
        cursor: pointer;
        transition: opacity 0.3s ease;
    `;
    notification.textContent = message;
    
    // Добавляем анимацию
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(style);
    
    notification.onclick = () => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    };
    
    document.body.appendChild(notification);
    
    // Автоматическое скрытие через 5 секунд
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
    
    // Воспроизводим звук
    try {
        if (notificationSound && notificationSound.play) {
            notificationSound.play();
        }
    } catch (e) {
        // Игнорируем ошибки звука
    }
}

// Показать уведомление об ошибке
export function showError(message) {
    showNotification(message, true);
}