const skipBreakButton = document.getElementById('skipBreakButton');
const addSpButton = document.getElementById('addSpButton');
// --- Получение ссылок на элементы DOM ---
const timerView = document.getElementById('timerView');
const completionView = document.getElementById('completionView');
const modeLabel = document.getElementById('mode');
const timerDisplay = document.getElementById('timer');
const mainButton = document.getElementById('mainButton');
const endDayButton = document.getElementById('endDayButton');
const startAnotherButton = document.getElementById('startAnotherButton');

// Элементы для кругового графика
const spChartProgress = document.getElementById('sp-chart-progress');
const spChartText = document.getElementById('sp-chart-text');

// --- Глобальные переменные ---
let uiUpdateInterval = null;
const WORK_MINUTES = 45; // Константа для отображения начального времени

// --- Основная функция обновления интерфейса ---
async function updateUI() {
    // Показывать кнопку пропуска паузы только во время break (после деструктуризации timerState)
    if (window.skipBreakButton && typeof timerState !== 'undefined') {
        if (timerState === 'break') {
            skipBreakButton.classList.remove('hidden');
        } else {
            skipBreakButton.classList.add('hidden');
        }
    }
// Обработчик для пропуска паузы
if (skipBreakButton) {
    skipBreakButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ command: 'skip_break' }, () => setTimeout(updateUI, 100));
    });
}

// Обработчик для ручного добавления SP
if (addSpButton) {
    addSpButton.addEventListener('click', () => {
        chrome.storage.local.get(['spCount', 'dailyGoal'], ({ spCount = 0, dailyGoal = 5 }) => {
            chrome.storage.local.set({ spCount: Math.min(spCount + 1, dailyGoal) }, updateUI);
        });
    });
}
    // Получаем все актуальные данные из хранилища
    const data = await chrome.storage.local.get([
        'timerState', 'spCount', 'dailyGoal', 'alarmTime', 'remainingTime', 'lastResetDate'
    ]);

    // Проверяем, не наступил ли новый день. Если да - сбрасываем счетчик.
    // Эта проверка дублирует логику background.js, но делает UI отзывчивее,
    // если браузер не перезапускался.
    const today = new Date().toLocaleDateString();
    if (data.lastResetDate !== today) {
        chrome.runtime.sendMessage({ command: 'end_day' }, () => setTimeout(updateUI, 100));
        return;
    }

    // Деструктуризация переменных для удобства. Добавляем значения по умолчанию.
    const { timerState = 'initial', spCount = 0, dailyGoal = 5, alarmTime, remainingTime } = data;

    // Обновление кругового графика
    const progressPercentage = (spCount / dailyGoal) * 100;
    spChartProgress.style.strokeDasharray = `${progressPercentage}, 100`;
    spChartText.textContent = `${spCount}/${dailyGoal}`;
    spChartProgress.style.stroke = (spCount >= dailyGoal) ? '#34c759' : '#007aff';

    // Показать экран поздравления, если нужно
    if (timerState === 'initial' && spCount >= dailyGoal) {
        timerView.classList.add('hidden');
        completionView.classList.remove('hidden');
        return;
    }
    timerView.classList.remove('hidden');
    completionView.classList.add('hidden');

    // Очистка старого интервала, чтобы избежать дублирования
    if (uiUpdateInterval) clearInterval(uiUpdateInterval);

    // Обновление таймера и кнопок
    let displayTime, label, buttonText;
    switch (timerState) {
        case 'work':
            label = 'Работа';
            buttonText = 'Пауза';
            startLiveTimer(alarmTime);
            break;
        case 'break':
            label = 'Перерыв';
            buttonText = 'Пауза';
            startLiveTimer(alarmTime);
            break;
        case 'paused':
            label = 'На паузе';
            buttonText = 'Продолжить';
            displayTime = formatTime(Math.round((remainingTime || 0) / 1000));
            break;
        case 'initial':
        default:
            label = 'Готовы к работе?';
            buttonText = 'Начать работу';
            displayTime = formatTime(WORK_MINUTES * 60);
            break;
    }
    modeLabel.textContent = label;
    mainButton.textContent = buttonText;
    if (displayTime) timerDisplay.textContent = displayTime;
}

// --- Функции-помощники ---
function startLiveTimer(endTime) {
    if (!endTime) return; // Защита от случая, когда endTime не определен
    uiUpdateInterval = setInterval(() => {
        const remainingSeconds = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        timerDisplay.textContent = formatTime(remainingSeconds);
        if (remainingSeconds === 0) {
            clearInterval(uiUpdateInterval);
            setTimeout(updateUI, 500); // Даем время фоновому скрипту обновить состояние
        }
    }, 1000);
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Обработчики событий (вешаются ОДИН раз) ---
mainButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'main_action' }, () => setTimeout(updateUI, 100));
});

endDayButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'end_day' }, () => setTimeout(updateUI, 100));
});

startAnotherButton.addEventListener('click', () => {
    // Эта кнопка тоже должна запускать основной сценарий "Начать работу"
    chrome.runtime.sendMessage({ command: 'main_action' }, () => setTimeout(updateUI, 100));
});

// --- Инициализация ---
// Запускаем обновление UI, как только HTML-структура будет готова
document.addEventListener('DOMContentLoaded', updateUI);
