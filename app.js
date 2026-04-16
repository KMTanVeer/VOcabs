(async function init() {
  // Delay keeps feedback visible briefly before automatically loading the next word.
  const NEXT_QUESTION_DELAY_MS = 650;
  // Matches OCR-fragmented tokens broken into many short chunks (e.g., "de vi a tion").
  // 1-3 char chunks repeated 3+ times followed by a final 1-8 char chunk.
  const OCR_SPLIT_WORD_PATTERN = /\b([a-z]{1,3}(?:\s+[a-z]{1,3}){2,}\s+[a-z]{1,8})\b/gi;
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

  const words = data.map((w) => ({ ...w, definition: clean(w.definition), word: clean(w.word) }));

  const state = {
    part: null,
    letter: null,
    pool: [],
    remaining: [],
    current: null,
    answered: 0
  };

  const partPools = new Map([
    [1, words.filter((w) => w.part === 1)],
    [2, words.filter((w) => w.part === 2)]
  ]);

  const setTheme = (mode) => {
    document.documentElement.setAttribute('data-theme', mode);
    themeToggle.textContent = mode === 'dark' ? '🌙 Dark' : '☀️ Light';
    localStorage.setItem('theme', mode);
  };

  setTheme(localStorage.getItem('theme') || 'dark');
  themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  const lettersForPart = (part) => {
    const grouped = new Map();
    words.filter((w) => w.part === part).forEach((w) => grouped.set(w.letter, (grouped.get(w.letter) || 0) + 1));
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  };

  function showParts() {
    partEl.classList.remove('hidden');
    letterEl.classList.add('hidden');
    examEl.classList.add('hidden');
    partEl.innerHTML = `
      <h2>Choose Part</h2>
      <p class="muted">Pick the source set before selecting a letter.</p>
      <div class="grid">
        <button data-part="1">Word Smart 1</button>
        <button data-part="2">Word Smart 2</button>
      </div>
    `;

    partEl.querySelectorAll('button[data-part]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.part = Number(btn.dataset.part);
        showLetters();
      });
    });
  }

  function showLetters() {
    partEl.classList.add('hidden');
    letterEl.classList.remove('hidden');
    examEl.classList.add('hidden');

    const letters = lettersForPart(state.part);
    letterEl.innerHTML = `
      <div class="row">
        <h2>Word Smart ${state.part}: Select a Letter</h2>
        <button id="backToParts">Back</button>
      </div>
      <div class="grid">
        ${letters
          .map(([letter, total]) => `<button data-letter="${letter}">${letter}<br><span class="muted">${total} words</span></button>`)
          .join('')}
      </div>
    `;

    document.getElementById('backToParts').addEventListener('click', showParts);
    letterEl.querySelectorAll('button[data-letter]').forEach((btn) => {
      btn.addEventListener('click', () => showStart(btn.dataset.letter));
    });
  }

  function showStart(letter) {
    state.letter = letter;
    state.pool = words.filter((w) => w.part === state.part && w.letter === letter);
    state.remaining = [...state.pool];
    state.answered = 0;

    letterEl.classList.add('hidden');
    examEl.classList.remove('hidden');

    examEl.innerHTML = `
      <div class="row">
        <h2>Letter ${letter} • Word Smart ${state.part}</h2>
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

  function askNext() {
    if (!state.remaining.length) {
      examEl.innerHTML = `
        <h2>Completed 🎉</h2>
        <p>You completed all ${state.pool.length} words for letter <strong>${state.letter}</strong> in Word Smart ${state.part}.</p>
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
    const fallbackWrong =
      localWrong.length < 3 ? pickRandom(partPools.get(state.part) || [], 3 - localWrong.length, state.current) : [];
    let options = shuffle([state.current, ...localWrong, ...fallbackWrong]);
    if (options.length < 4) {
      const used = new Set(options.map((o) => o.word));
      const extra = words.filter((w) => w.word !== state.current.word && !used.has(w.word));
      options = shuffle([...options, ...pickRandom(extra, 4 - options.length)]);
    }

    examEl.innerHTML = `
      <div class="row">
        <h2>Exam • Letter ${state.letter} • Word Smart ${state.part}</h2>
        <p><strong>${state.answered + 1}</strong> / ${state.pool.length}</p>
      </div>
      <p class="word">${state.current.word}</p>
      <p class="muted">Choose the correct meaning:</p>
      <div class="options">
        ${options.map((o, i) => `<button class="option" data-index="${i}">${o.definition}</button>`).join('')}
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

  showParts();
})();
