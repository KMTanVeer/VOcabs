(async function init() {
  // Delay keeps feedback visible briefly before automatically loading the next word.
  const NEXT_QUESTION_DELAY_MS = 650;
  // Matches OCR-fragmented tokens broken into many short chunks (e.g., "de vi a tion").
  // 1-3 char chunks repeated 3+ times followed by a final 1-8 char chunk.
  // Example: "some thing" is not matched, but "de vi a tion" is matched and re-joined.
  const OCR_SPLIT_WORD_PATTERN = /\b([a-z]{1,3}(?:\s+[a-z]{1,3}){2,}\s+[a-z]{1,8})\b/gi;
  const DEFINITION_FALLBACK = 'Definition unavailable.';
  const data = await fetch('./words-data.json').then((r) => r.json());

  const partEl = document.getElementById('partSelection');
  const letterEl = document.getElementById('letterSelection');
  const examEl = document.getElementById('examScreen');
  const themeToggle = document.getElementById('themeToggle');

  const clean = (text) =>
    String(text)
      .replace(/\u00ad/g, '')
      .replace(/ﬁ/g, 'fi')
      // Re-join OCR splits where one word was broken into many short chunks (e.g., "de vi a tion").
      .replace(OCR_SPLIT_WORD_PATTERN, (m) => m.replace(/\s+/g, ''))
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[;,:\-]+$/, '');

  const formatDefinition = (text) => {
    if (!String(text || '').trim()) return DEFINITION_FALLBACK;
    const value = clean(text)
      .replace(/\s*\.\.\.\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim();
    if (!value) return DEFINITION_FALLBACK;
    const withCapital = value.charAt(0).toUpperCase() + value.slice(1);
    return /[.?!]$/.test(withCapital) ? withCapital : `${withCapital}.`;
  };

  const words = data.map((w) => ({
    ...w,
    definition: clean(w.definition),
    definitionDisplay: formatDefinition(w.definition),
    word: clean(w.word)
  }));

  const state = {
    letter: null,
    pool: [],
    remaining: [],
    current: null,
    answered: 0
  };

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const wordsByLetter = new Map(
    ALPHABET.map((letter) => [letter, words.filter((w) => w.letter === letter)])
  );

  const setTheme = (mode) => {
    document.documentElement.setAttribute('data-theme', mode);
    themeToggle.textContent = mode === 'dark' ? '🌙 Dark' : '☀️ Light';
    localStorage.setItem('theme', mode);
  };

  setTheme(localStorage.getItem('theme') || 'dark');
  themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  function showHome() {
    partEl.classList.remove('hidden');
    partEl.innerHTML = `
      <h2>Word Smart 1 • Complete A–Z</h2>
      <p class="muted">Premium vocabulary practice with all available Word Smart 1 entries.</p>
      <p>Total words loaded: <strong>${words.length}</strong></p>
      <button id="openLetters" class="primary">Choose Letter</button>
    `;
    letterEl.classList.add('hidden');
    examEl.classList.add('hidden');
    document.getElementById('openLetters').addEventListener('click', showLetters);
  }

  function showLetters() {
    partEl.classList.add('hidden');
    letterEl.classList.remove('hidden');
    examEl.classList.add('hidden');

    letterEl.innerHTML = `
      <div class="row">
        <h2>Word Smart 1: Select a Letter</h2>
        <button id="backToHome">Back</button>
      </div>
      <div class="grid">
        ${ALPHABET
          .map((letter) => {
            const total = (wordsByLetter.get(letter) || []).length;
            const disabled = total === 0 ? 'disabled' : '';
            return `<button data-letter="${letter}" ${disabled}>${letter}<br><span class="muted">${total} words</span></button>`;
          })
          .join('')}
      </div>
    `;

    document.getElementById('backToHome').addEventListener('click', showHome);
    letterEl.querySelectorAll('button[data-letter]').forEach((btn) => {
      btn.addEventListener('click', () => showStart(btn.dataset.letter));
    });
  }

  function showStart(letter) {
    state.letter = letter;
    state.pool = wordsByLetter.get(letter) || [];
    state.remaining = [...state.pool];
    state.answered = 0;

    letterEl.classList.add('hidden');
    examEl.classList.remove('hidden');

    examEl.innerHTML = `
      <div class="row">
        <h2>Letter ${letter} • Word Smart 1</h2>
        <button id="backToLetters">Change Letter</button>
      </div>
      <p>Total words: <strong>${state.pool.length}</strong></p>
      <button id="startExam" class="primary">Start Exam</button>
    `;

    document.getElementById('backToLetters').addEventListener('click', showLetters);
    document.getElementById('startExam').addEventListener('click', askNext);
  }

  function pickRandom(list, count, skipWord) {
    const skip = skipWord?.word;
    const source = list.filter((w) => w.word !== skip);
    const out = [];
    while (source.length && out.length < count) {
      const idx = Math.floor(Math.random() * source.length);
      out.push(source.splice(idx, 1)[0]);
    }
    return out;
  }

  function shuffle(arr) {
    const clone = [...arr];
    for (let i = clone.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
  }

  function fillUniqueOptions(options, target, correctWord) {
    const used = new Set(options.map((o) => o.word));
    let tries = 0;
    while (options.length < target && tries < words.length * 2) {
      const candidate = words[Math.floor(Math.random() * words.length)];
      tries += 1;
      if (!candidate || candidate.word === correctWord || used.has(candidate.word)) continue;
      used.add(candidate.word);
      options.push(candidate);
    }
    return options;
  }

  function askNext() {
    if (!state.remaining.length) {
      examEl.innerHTML = `
        <h2>Completed 🎉</h2>
        <p>You completed all ${state.pool.length} words for letter <strong>${state.letter}</strong> in Word Smart 1.</p>
        <div class="row">
          <button id="restartLetter" class="primary">Retry Letter</button>
          <button id="changeLetter">Choose Another Letter</button>
        </div>
      `;
      document.getElementById('restartLetter').addEventListener('click', () => showStart(state.letter));
      document.getElementById('changeLetter').addEventListener('click', showLetters);
      return;
    }

    const idx = Math.floor(Math.random() * state.remaining.length);
    state.current = state.remaining[idx];

    const localWrong = pickRandom(state.pool, 3, state.current);
    const fallbackWrong = localWrong.length < 3 ? pickRandom(words, 3 - localWrong.length, state.current) : [];
    let options = shuffle([state.current, ...localWrong, ...fallbackWrong]);
    if (options.length < 4) options = shuffle(fillUniqueOptions(options, 4, state.current.word));

    examEl.innerHTML = `
      <div class="row">
        <h2>Exam • Letter ${state.letter} • Word Smart 1</h2>
        <p><strong>${state.answered + 1}</strong> / ${state.pool.length}</p>
      </div>
      <p class="word">${state.current.word}</p>
      <p class="muted">Choose the correct meaning:</p>
      <div class="options">
        ${options.map((o, i) => `<button class="option" data-index="${i}">${o.definitionDisplay}</button>`).join('')}
      </div>
      <p id="feedback" class="feedback"></p>
    `;

    const feedback = document.getElementById('feedback');
    const buttons = [...examEl.querySelectorAll('.option')];

    buttons.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const selected = options[i];
        if (selected.word === state.current.word) {
          btn.classList.add('correct');
          feedback.textContent = 'Correct! Loading next word...';
          feedback.className = 'feedback ok';
          state.remaining = state.remaining.filter((w) => w.word !== state.current.word);
          state.answered += 1;
          buttons.forEach((b) => (b.disabled = true));
          setTimeout(askNext, NEXT_QUESTION_DELAY_MS);
          return;
        }

        btn.classList.add('wrong');
        feedback.textContent = 'Try again.';
        feedback.className = 'feedback error';
      });
    });
  }

  showHome();
})();
