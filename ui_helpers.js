// ui_helpers.js — нормальные тосты под твой CSS

window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('⚠️ #toast-container not found, toast:', message);
        return;
    }

    const toast = document.createElement('div');

    // базовый класс
    toast.className = 'toast';

    // цвет по типу
    if (type === 'error') {
        toast.classList.add('error');
    } else if (type === 'warning') {
        toast.classList.add('warning');
    }
    // для success/info используем базовый зелёный .toast

    toast.textContent = message;
    container.appendChild(toast);

    // даём браузеру нарисовать элемент, потом включаем анимацию .show
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // через 4 секунды — плавно скрываем и удаляем
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener(
            'transitionend',
            () => toast.remove(),
            { once: true }
        );
    }, 4000);
};
