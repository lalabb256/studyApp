// Timer State Management
let workDuration = 25 * 60;
let breakDuration = 5 * 60;

let timeLeft = workDuration;
let isRunning = false;
let isWorkMode = true;
let timerInterval = null;

// Analytics State
let sessionCount = 0;
let totalFocusSeconds = 0;

const STORAGE_KEYS = {
    settings: 'focushub-settings',
    stats: 'focushub-stats',
    theme: 'focushub-theme',
    notes: 'focushub-notes',
    flashcard: 'focushub-flashcard',
    flashcards: 'focushub-flashcards'
};

const defaultFlashcards = [
    {
        question: 'ArrayList と LinkedList の主な使い分けは？',
        answer: 'ArrayList は順アクセスとランダムアクセスに強く、LinkedList は途中挿入・削除が多い場面で有利です。'
    },
    {
        question: 'SQL で INNER JOIN と LEFT JOIN の違いは？',
        answer: 'INNER JOIN は両方に存在する行だけ、LEFT JOIN は左側テーブルを優先して結合し、右側がなければ NULL を返します。'
    },
    {
        question: 'for と while の使い分けの目安は？',
        answer: '回数が決まっているなら for、条件が先にあり繰り返し回数が不定なら while が適しています。'
    }
];

let flashcards = [...defaultFlashcards];

let currentFlashcardIndex = 0;
let flashcardRevealed = false;
let editingFlashcardIndex = null;
let mistakeNotes = [];

// DOM Element References
const timerDisplay = document.getElementById('timer-display');
const btnToggle = document.getElementById('btn-toggle-timer');
const iconToggle = document.getElementById('icon-toggle');
const btnReset = document.getElementById('btn-reset-timer');
const btnSkip = document.getElementById('btn-skip-timer');
const statusBadge = document.getElementById('timer-status-badge');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

const headerSessions = document.getElementById('header-sessions');
const headerTotalTime = document.getElementById('header-total-time');
const mobileSessions = document.getElementById('mobile-sessions');
const mobileTotalTime = document.getElementById('mobile-total-time');

const modal = document.getElementById('settings-modal');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const inputWork = document.getElementById('input-work-time');
const inputBreak = document.getElementById('input-break-time');

const btnThemeToggle = document.getElementById('btn-toggle-theme');
const flashcardQuestion = document.getElementById('flashcard-question');
const flashcardAnswer = document.getElementById('flashcard-answer');
const btnFlashcardToggle = document.getElementById('btn-flashcard-toggle');
const btnFlashcardNext = document.getElementById('btn-flashcard-next');
const mistakeForm = document.getElementById('mistake-form');
const mistakeInput = document.getElementById('mistake-input');
const mistakeList = document.getElementById('mistake-list');
const flashcardForm = document.getElementById('flashcard-form');
const flashcardQuestionInput = document.getElementById('flashcard-question-input');
const flashcardAnswerInput = document.getElementById('flashcard-answer-input');
const flashcardList = document.getElementById('flashcard-list');
const flashcardSubmitButton = document.getElementById('flashcard-submit');
const flashcardCancelButton = document.getElementById('flashcard-cancel');
const ambientInputs = document.querySelectorAll('[data-sound]');

const ambientAudio = {
    context: null,
    masterGain: null,
    tracks: {},

    init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext || this.context) return;

        this.context = new AudioContext();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.context.destination);

        this.tracks.rain = this.createNoiseTrack(1600, 0.12);
        this.tracks.cafe = this.createNoiseTrack(900, 0.06);
        this.tracks.wave = this.createWaveTrack();
    },

    createNoiseTrack(cutoff, gainValue) {
        const bufferSize = 2 * this.context.sampleRate;
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const channelData = buffer.getChannelData(0);
        let lastOut = 0;

        for (let i = 0; i < bufferSize; i += 1) {
            const white = Math.random() * 2 - 1;
            lastOut = (0.02 * white) + (0.98 * lastOut);
            channelData[i] = lastOut * 0.6;
        }

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;

        const gain = this.context.createGain();
        gain.gain.value = 0;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start();

        return { source, filter, gain, maxVolume: gainValue };
    },

    createWaveTrack() {
        const oscillator = this.context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = 95;

        const lfo = this.context.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08;

        const lfoGain = this.context.createGain();
        lfoGain.gain.value = 10;

        const gain = this.context.createGain();
        gain.gain.value = 0;

        lfo.connect(lfoGain);
        lfoGain.connect(oscillator.frequency);
        oscillator.connect(gain);
        gain.connect(this.masterGain);

        oscillator.start();
        lfo.start();

        return { oscillator, gain, lfo, lfoGain, maxVolume: 0.012 };
    },

    ensureReady() {
        if (!this.context) {
            this.init();
        }
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    },

    update(name, volume) {
        if (!this.context || !this.tracks[name]) return;
        const level = Math.max(0, Math.min(1, volume));
        const maxVolume = this.tracks[name].maxVolume ?? 0.08;
        const target = level * maxVolume;
        this.tracks[name].gain.gain.setTargetAtTime(target, this.context.currentTime, 0.25);
    }
};

window.ambientAudio = ambientAudio;

function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.15);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
    } catch (error) {
        console.log('Audio Context playback error:', error);
    }
}

function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
        workDuration,
        breakDuration,
        sessionCount,
        totalFocusSeconds,
        isWorkMode,
        timeLeft,
        currentFlashcardIndex,
        flashcardRevealed
    }));
}

function saveStats() {
    localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify({
        sessionCount,
        totalFocusSeconds
    }));
}

function loadPersistedState() {
    try {
        const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}');
        const savedStats = JSON.parse(localStorage.getItem(STORAGE_KEYS.stats) || '{}');
        const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
        const savedNotes = JSON.parse(localStorage.getItem(STORAGE_KEYS.notes) || '[]');
        const savedFlashcards = JSON.parse(localStorage.getItem(STORAGE_KEYS.flashcards) || '[]');
        const savedFlashcardIndex = Number(localStorage.getItem(STORAGE_KEYS.flashcard) || 0);

        if (savedSettings.workDuration) workDuration = Number(savedSettings.workDuration);
        if (savedSettings.breakDuration) breakDuration = Number(savedSettings.breakDuration);
        if (savedStats.sessionCount) sessionCount = Number(savedStats.sessionCount);
        if (savedStats.totalFocusSeconds) totalFocusSeconds = Number(savedStats.totalFocusSeconds);
        if (savedNotes.length) mistakeNotes = savedNotes;
        if (Array.isArray(savedFlashcards) && savedFlashcards.length) {
            flashcards = savedFlashcards;
        }
        if (Number.isFinite(savedFlashcardIndex) && savedFlashcardIndex >= 0) {
            currentFlashcardIndex = Math.min(savedFlashcardIndex, Math.max(flashcards.length - 1, 0));
        }

        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    } catch (error) {
        console.warn('Persisted state could not be loaded:', error);
    }
}

function saveFlashcards() {
    localStorage.setItem(STORAGE_KEYS.flashcards, JSON.stringify(flashcards));
}

function renderFlashcard() {
    if (!flashcards.length) {
        flashcardQuestion.textContent = 'Q. まだカードがありません';
        flashcardAnswer.textContent = 'A. 追加ボタンから新しいカードを作成できます。';
        flashcardAnswer.classList.remove('hidden');
        btnFlashcardToggle.textContent = '答えを表示する';
        return;
    }

    const card = flashcards[currentFlashcardIndex % flashcards.length];
    flashcardQuestion.textContent = `Q. ${card.question}`;
    flashcardAnswer.textContent = `A. ${card.answer}`;
    flashcardAnswer.classList.toggle('hidden', !flashcardRevealed);
    btnFlashcardToggle.textContent = flashcardRevealed ? '答えを隠す' : '答えを表示する';
    localStorage.setItem(STORAGE_KEYS.flashcard, String(currentFlashcardIndex));
}

function toggleFlashcard() {
    if (!flashcards.length) return;
    flashcardRevealed = !flashcardRevealed;
    renderFlashcard();
}

function nextFlashcard() {
    if (!flashcards.length) return;
    currentFlashcardIndex = (currentFlashcardIndex + 1) % flashcards.length;
    flashcardRevealed = false;
    renderFlashcard();
}

function renderFlashcardList() {
    if (!flashcardList) return;

    if (!flashcards.length) {
        flashcardList.innerHTML = `
            <div class="py-4 text-sm text-slate-500 dark:text-slate-400">
                カードを追加すると、ここに一覧が表示されます。
            </div>
        `;
        return;
    }

    flashcardList.innerHTML = flashcards
        .map((card, index) => `
            <div class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3">
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-slate-700 dark:text-slate-200 text-sm break-words">Q. ${card.question}</div>
                    <div class="mt-1 text-xs text-slate-500 dark:text-slate-400 break-words">A. ${card.answer}</div>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button type="button" class="edit-flashcard text-xs text-brand-500 font-semibold hover:underline" data-index="${index}">編集</button>
                    <button type="button" class="delete-flashcard text-xs text-slate-400 hover:text-red-500" data-index="${index}" aria-label="削除">削除</button>
                </div>
            </div>
        `)
        .join('');

    document.querySelectorAll('.delete-flashcard').forEach((button) => {
        button.addEventListener('click', (event) => {
            const index = Number(event.currentTarget.dataset.index);
            flashcards.splice(index, 1);
            if (currentFlashcardIndex >= flashcards.length) {
                currentFlashcardIndex = 0;
            }
            if (editingFlashcardIndex === index) {
                cancelFlashcardEdit();
            } else if (editingFlashcardIndex !== null && index < editingFlashcardIndex) {
                editingFlashcardIndex -= 1;
            }
            saveFlashcards();
            renderFlashcard();
            renderFlashcardList();
        });
    });

    document.querySelectorAll('.edit-flashcard').forEach((button) => {
        button.addEventListener('click', (event) => {
            const index = Number(event.currentTarget.dataset.index);
            startEditingFlashcard(index);
        });
    });
}

function startEditingFlashcard(index) {
    const card = flashcards[index];
    if (!card) return;

    editingFlashcardIndex = index;
    flashcardQuestionInput.value = card.question;
    flashcardAnswerInput.value = card.answer;
    flashcardSubmitButton.textContent = 'カードを更新';
    flashcardCancelButton.classList.remove('hidden');
    flashcardQuestionInput.focus();
}

function cancelFlashcardEdit() {
    editingFlashcardIndex = null;
    flashcardForm.reset();
    flashcardSubmitButton.textContent = 'カードを追加';
    flashcardCancelButton.classList.add('hidden');
}

function addFlashcard(event) {
    event.preventDefault();

    const question = flashcardQuestionInput.value.trim();
    const answer = flashcardAnswerInput.value.trim();

    if (!question || !answer) return;

    if (editingFlashcardIndex !== null) {
        flashcards[editingFlashcardIndex] = { question, answer };
        currentFlashcardIndex = editingFlashcardIndex;
        cancelFlashcardEdit();
    } else {
        flashcards.unshift({ question, answer });
        currentFlashcardIndex = 0;
        flashcardRevealed = false;
    }

    saveFlashcards();
    renderFlashcard();
    renderFlashcardList();
    flashcardForm.reset();
    flashcardSubmitButton.textContent = 'カードを追加';
    flashcardCancelButton.classList.add('hidden');
}

function renderMistakes() {
    if (!mistakeList) return;

    if (!mistakeNotes.length) {
        mistakeList.innerHTML = `
            <div class="py-4 text-sm text-slate-500 dark:text-slate-400">
                学習メモを追加すると、ここにリストが表示されます。
            </div>
        `;
        return;
    }

    mistakeList.innerHTML = mistakeNotes
        .map((note, index) => `
            <div class="py-3 flex justify-between items-center gap-3">
                <div>
                    <div class="font-medium text-slate-700 dark:text-slate-200 text-sm">${note.text}</div>
                    <div class="text-xs text-slate-400">理解度: ${note.level} | 最終更新: ${note.date}</div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="review-note text-xs text-brand-500 font-semibold cursor-pointer hover:underline" data-index="${index}">復習する</button>
                    <button class="delete-note text-xs text-slate-400 hover:text-red-500" data-index="${index}" aria-label="削除">削除</button>
                </div>
            </div>
        `)
        .join('');

    document.querySelectorAll('.delete-note').forEach((button) => {
        button.addEventListener('click', (event) => {
            const index = Number(event.currentTarget.dataset.index);
            mistakeNotes.splice(index, 1);
            localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(mistakeNotes));
            renderMistakes();
        });
    });

    document.querySelectorAll('.review-note').forEach((button) => {
        button.addEventListener('click', (event) => {
            const index = Number(event.currentTarget.dataset.index);
            mistakeNotes[index].level = '★★★☆☆';
            mistakeNotes[index].date = new Date().toLocaleDateString('ja-JP');
            localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(mistakeNotes));
            renderMistakes();
        });
    });
}

function addMistakeNote(event) {
    event.preventDefault();
    const value = mistakeInput.value.trim();
    if (!value) return;

    mistakeNotes.unshift({
        text: value,
        level: '★☆☆☆☆',
        date: new Date().toLocaleDateString('ja-JP')
    });

    localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(mistakeNotes));
    mistakeInput.value = '';
    renderMistakes();
}

function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    timerDisplay.textContent = formatted;
    document.title = `${formatted} - ${isWorkMode ? '集中中' : '休憩中'} | FocusHub`;
}

function updateStatusUI() {
    if (isWorkMode) {
        statusBadge.className = 'px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1.5 transition-colors';
        statusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 ' + (isRunning ? 'animate-pulse' : '');
        statusText.textContent = '集中タイム';
    } else {
        statusBadge.className = 'px-2.5 py-0.5 text-xs font-semibold rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 flex items-center gap-1.5 transition-colors';
        statusDot.className = 'w-2 h-2 rounded-full bg-sky-500 ' + (isRunning ? 'animate-pulse' : '');
        statusText.textContent = '休憩タイム';
    }
}

function toggleTimer() {
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    if (isRunning) return;

    isRunning = true;
    iconToggle.setAttribute('data-lucide', 'pause');
    lucide.createIcons();
    updateStatusUI();

    timerInterval = setInterval(() => {
        if (timeLeft > 0) {
            timeLeft -= 1;
            if (isWorkMode) {
                totalFocusSeconds += 1;
                updateStatsDisplay();
            }
            updateDisplay();
            saveSettings();
        } else {
            handleTimerComplete();
        }
    }, 1000);
}

function pauseTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    iconToggle.setAttribute('data-lucide', 'play');
    lucide.createIcons();
    updateStatusUI();
    saveSettings();
}

function resetTimer() {
    pauseTimer();
    timeLeft = isWorkMode ? workDuration : breakDuration;
    updateDisplay();
    saveSettings();
}

function skipTimer() {
    pauseTimer();
    switchMode(!isWorkMode);
}

function switchMode(toWorkMode) {
    isWorkMode = toWorkMode;
    timeLeft = isWorkMode ? workDuration : breakDuration;
    updateStatusUI();
    updateDisplay();
    saveSettings();
}

function handleTimerComplete() {
    pauseTimer();
    playNotificationSound();

    if (isWorkMode) {
        sessionCount += 1;
        updateStatsDisplay();
        saveStats();
        switchMode(false);
    } else {
        switchMode(true);
    }
}

function updateStatsDisplay() {
    headerSessions.textContent = sessionCount;
    mobileSessions.textContent = sessionCount;

    const totalMinutes = Math.floor(totalFocusSeconds / 60);
    headerTotalTime.textContent = totalMinutes;
    mobileTotalTime.textContent = totalMinutes;
    saveStats();
}

function saveThemePreference() {
    localStorage.setItem(STORAGE_KEYS.theme, document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

function bindAmbientControls() {
    ambientInputs.forEach((input) => {
        input.addEventListener('input', (event) => {
            const sound = event.target.dataset.sound;
            const value = Number(event.target.value) / 100;
            ambientAudio.ensureReady();
            ambientAudio.update(sound, value);
        });
    });
}

btnToggle.addEventListener('click', toggleTimer);
btnReset.addEventListener('click', resetTimer);
btnSkip.addEventListener('click', skipTimer);

btnOpenSettings.addEventListener('click', () => {
    inputWork.value = Math.floor(workDuration / 60);
    inputBreak.value = Math.floor(breakDuration / 60);
    modal.classList.remove('hidden');
});

btnCloseSettings.addEventListener('click', () => {
    modal.classList.add('hidden');
});

btnSaveSettings.addEventListener('click', () => {
    const newWorkMin = parseInt(inputWork.value, 10) || 25;
    const newBreakMin = parseInt(inputBreak.value, 10) || 5;

    workDuration = newWorkMin * 60;
    breakDuration = newBreakMin * 60;

    modal.classList.add('hidden');
    resetTimer();
    saveSettings();
});

btnThemeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    saveThemePreference();
});

btnFlashcardToggle.addEventListener('click', toggleFlashcard);
btnFlashcardNext.addEventListener('click', nextFlashcard);
flashcardForm.addEventListener('submit', addFlashcard);
flashcardCancelButton.addEventListener('click', cancelFlashcardEdit);
mistakeForm.addEventListener('submit', addMistakeNote);

function switchTab(tabKey) {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.remove('active', 'border-brand-500', 'text-brand-500', 'font-semibold');
        btn.classList.add('border-transparent', 'text-slate-500', 'dark:text-slate-400', 'font-medium');
    });

    const selectedBtn = document.getElementById(`tab-${tabKey}`);
    if (selectedBtn) {
        selectedBtn.classList.add('active', 'border-brand-500', 'text-brand-500', 'font-semibold');
        selectedBtn.classList.remove('border-transparent', 'text-slate-500', 'dark:text-slate-400', 'font-medium');
    }

    document.querySelectorAll('.tab-view').forEach((view) => {
        view.classList.add('hidden');
        view.classList.remove('block');
    });

    const selectedView = document.getElementById(`view-${tabKey}`);
    if (selectedView) {
        selectedView.classList.remove('hidden');
        selectedView.classList.add('block');
    }
}

function switchFlashcardPane(mode) {
    const tabs = document.querySelectorAll('.flashcard-pane-tab');
    tabs.forEach((tab) => {
        const isActive = tab.id === `flashcard-${mode}-tab`;
        tab.classList.toggle('bg-brand-50', isActive);
        tab.classList.toggle('text-brand-600', isActive);
        tab.classList.toggle('dark:bg-brand-950/60', isActive);
        tab.classList.toggle('dark:text-brand-300', isActive);
        tab.classList.toggle('border-brand-200', isActive);
        tab.classList.toggle('dark:border-brand-800', isActive);
        tab.classList.toggle('text-slate-600', !isActive);
        tab.classList.toggle('dark:text-slate-300', !isActive);
        tab.classList.toggle('border-transparent', !isActive);
        tab.classList.toggle('font-semibold', isActive);
        tab.classList.toggle('font-medium', !isActive);
    });

    document.querySelectorAll('.flashcard-pane').forEach((pane) => {
        pane.classList.add('hidden');
        pane.classList.remove('block');
    });

    const activePane = document.getElementById(`flashcard-${mode}-panel`);
    if (activePane) {
        activePane.classList.remove('hidden');
        activePane.classList.add('block');
    }
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
    }
});

modal.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.classList.add('hidden');
    }
});

window.onload = function () {
    loadPersistedState();
    bindAmbientControls();
    lucide.createIcons();
    renderFlashcard();
    renderFlashcardList();
    renderMistakes();
    updateDisplay();
    updateStatsDisplay();
    updateStatusUI();
    saveSettings();
};
