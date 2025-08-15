// --- Константы ---
const WORK_MINUTES = 45;
const BREAK_MINUTES = 15;

// --- Инициализация при установке ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    timerState: 'initial',
    spCount: 0,
    dailyGoal: 5,
    lastResetDate: new Date().toLocaleDateString()
  });
  // Сразу очищаем иконку при установке
  chrome.action.setBadgeText({ text: '' });
});

// --- Основной слушатель будильника (для таймера и для обновления иконки) ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Логика для основного таймера SP-5
  if (alarm.name === 'sp5Timer') {
    const { timerState, spCount, dailyGoal } = await chrome.storage.local.get(['timerState', 'spCount', 'dailyGoal']);
    if (timerState === 'work') {
      const newSpCount = spCount + 1;
      await chrome.storage.local.set({ timerState: 'break', spCount: newSpCount });
      chrome.alarms.create('sp5Timer', { when: Date.now() + BREAK_MINUTES * 60 * 1000 });
      createNotification('work_end', `Время для перерыва!`, `Выполнено SP: ${newSpCount} из ${dailyGoal}`);
    } else if (timerState === 'break') {
      await chrome.storage.local.set({ timerState: 'initial' });
      createNotification('break_end', 'Перерыв окончен!', 'Готовы к следующему рабочему циклу?');
    }
  }

  // Логика для ежеминутного обновления иконки
  if (alarm.name === 'badgeUpdater') {
    updateBadge();
  }
});

// --- Слушатель сообщений от popup.js ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.command) {
        case 'main_action':
          await handleMainAction();
          break;
        case 'end_day':
          await resetToInitialState();
          break;
        case 'check_date':
          await checkDateAndResetCounter();
          break;
      }
      sendResponse({ status: "ok" });
    } catch (error) {
      console.error("Ошибка в обработчике сообщений:", error);
      sendResponse({ status: "error", message: error.message });
    }
  })();
  return true;
});

// --- Основные действия ---
async function handleMainAction() {
  const { timerState } = await chrome.storage.local.get(['timerState']);

  if (timerState === 'initial') {
    await chrome.storage.local.set({ timerState: 'work' });
    chrome.alarms.create('sp5Timer', { when: Date.now() + WORK_MINUTES * 60 * 1000 });
  } else if (timerState === 'work' || timerState === 'break') {
    const alarm = await chrome.alarms.get('sp5Timer');
    if (alarm) {
      const remainingTime = alarm.scheduledTime - Date.now();
      await chrome.storage.local.set({
        timerState: 'paused',
        remainingTime: remainingTime > 0 ? remainingTime : 0,
        previousState: timerState
      });
      await chrome.alarms.clear('sp5Timer');
    }
  } else if (timerState === 'paused') {
    const { remainingTime, previousState } = await chrome.storage.local.get(['remainingTime', 'previousState']);
    await chrome.storage.local.set({ timerState: previousState });
    chrome.alarms.create('sp5Timer', { when: Date.now() + remainingTime });
  }
  // После любого действия обновляем иконку
  await updateBadge();
}

async function resetToInitialState() {
  await chrome.alarms.clearAll(); // Очищаем все будильники
  await chrome.storage.local.set({
    timerState: 'initial',
    spCount: 0
  });
  await updateBadge();
}

// --- Логика обновления иконки (Badge) ---
async function updateBadge() {
  const { timerState, remainingTime } = await chrome.storage.local.get(['timerState', 'remainingTime']);
  const alarm = await chrome.alarms.get('sp5Timer');

  if (timerState === 'work' || timerState === 'break') {
    if (alarm) {
      const minutesLeft = Math.ceil((alarm.scheduledTime - Date.now()) / 1000 / 60);
      chrome.action.setBadgeText({ text: `${minutesLeft}'` });
      chrome.action.setBadgeBackgroundColor({ color: '#007aff' }); // Синий цвет
      // Создаем будильник для обновления иконки через минуту
      chrome.alarms.create('badgeUpdater', { delayInMinutes: 1 });
    }
  } else if (timerState === 'paused') {
    const minutesLeft = Math.ceil((remainingTime || 0) / 1000 / 60);
    chrome.action.setBadgeText({ text: `${minutesLeft}'` });
    chrome.action.setBadgeBackgroundColor({ color: '#8e8e93' }); // Серый цвет
    chrome.alarms.clear('badgeUpdater'); // Останавливаем обновление иконки на паузе
  } else { // initial или любой другой случай
    chrome.action.setBadgeText({ text: '' });
    chrome.alarms.clear('badgeUpdater');
  }
}

// --- Утилиты ---
function createNotification(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic', iconUrl: 'icons/icon128.png', title: title, message: message, priority: 2
  });
}

async function checkDateAndResetCounter() {
  const { lastResetDate } = await chrome.storage.local.get(['lastResetDate']);
  const today = new Date().toLocaleDateString();
  if (lastResetDate !== today) {
    await resetToInitialState();
    await chrome.storage.local.set({ lastResetDate: today });
  }
}

// При запуске браузера проверяем, нужно ли восстановить состояние иконки
chrome.runtime.onStartup.addListener(updateBadge);
