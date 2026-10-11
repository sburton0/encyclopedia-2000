// Trivia question engine, shared by all games. Builds multiple-choice questions from live Wikipedia data.
// Subjects come from curated lists of well-known topics so questions stay fair (random articles are too obscure).
window.E2KTrivia = (() => {
  const TOPICS = [
    { id: 'history', name: 'History', titles: [
      'Ancient Egypt', 'Roman Empire', 'Ancient Greece', 'Byzantine Empire', 'Ottoman Empire', 'Mongol Empire', 'Renaissance',
      'Reformation', 'French Revolution', 'American Revolution', 'Industrial Revolution', 'World War I', 'World War II', 'Cold War',
      'Russian Revolution', 'Great Depression', 'Black Death', 'Crusades', 'Magna Carta', 'Fall of the Berlin Wall', 'Apollo 11',
      'Han dynasty', 'Ming dynasty', 'Aztec Empire', 'Inca Empire', 'Viking Age', "Hundred Years' War", 'Battle of Hastings',
      'Age of Discovery', 'Meiji Restoration', 'Partition of India', 'Mughal Empire', 'Achaemenid Empire', 'Holy Roman Empire',
      'Napoleonic Wars', 'American Civil War', 'Space Race', 'Printing press', 'Silk Road', 'Ancient Rome',
    ] },
    { id: 'science', name: 'Science', titles: [
      'Gravity', 'Photosynthesis', 'DNA', 'Atom', 'Electron', 'Black hole', 'Big Bang', 'Theory of relativity', 'Quantum mechanics',
      'Evolution', 'Periodic table', 'Oxygen', 'Carbon', 'Electricity', 'Magnetism', 'Light', 'Plate tectonics', 'Volcano', 'Earthquake',
      'Vaccine', 'Penicillin', 'Cell (biology)', 'Neuron', 'Sun', 'Moon', 'Mars', 'Jupiter', 'Saturn', 'Milky Way', 'Telescope',
      'Computer', 'Internet', 'Steam engine', 'Laser', 'Nuclear fission', 'Climate change', 'Thermodynamics', 'Rainbow', 'Comet', 'Diamond',
    ] },
    { id: 'geography', name: 'Geography', titles: [
      'Mount Everest', 'Amazon River', 'Nile', 'Sahara', 'Pacific Ocean', 'Atlantic Ocean', 'Antarctica', 'Himalayas', 'Andes', 'Alps',
      'Grand Canyon', 'Great Barrier Reef', 'Mediterranean Sea', 'Dead Sea', 'Lake Baikal', 'Mississippi River', 'Yangtze', 'Ganges',
      'Iceland', 'Japan', 'Brazil', 'Egypt', 'Australia', 'Canada', 'Mexico', 'India', 'Madagascar', 'Greenland', 'Venice', 'Paris',
      'Tokyo', 'New York City', 'Istanbul', 'Rome', 'Cairo', 'Rio de Janeiro', 'Sydney', 'Panama Canal', 'Strait of Gibraltar', 'Victoria Falls',
    ] },
    { id: 'nature', name: 'Nature', titles: [
      'Lion', 'Tiger', 'African elephant', 'Blue whale', 'Giant panda', 'Bald eagle', 'Emperor penguin', 'Polar bear', 'Wolf',
      'Western honey bee', 'Monarch butterfly', 'Octopus', 'Great white shark', 'Dolphin', 'Chimpanzee', 'Kangaroo', 'Koala', 'Cheetah',
      'Giraffe', 'Hummingbird', 'Coral reef', 'Rainforest', 'Sequoia sempervirens', 'Helianthus', 'Rose', 'Oak', 'Bamboo', 'Cactus',
      'Fungus', 'Tyrannosaurus', 'Venus flytrap', 'Komodo dragon', 'Platypus', 'Axolotl', 'Peafowl', 'Owl', 'Salmon', 'Ant', 'Spider', 'Hippopotamus',
    ] },
    { id: 'arts', name: 'Arts', titles: [
      'Mona Lisa', 'The Starry Night', 'The Last Supper (Leonardo)', 'Sistine Chapel ceiling', 'Hamlet', 'Romeo and Juliet', 'Don Quixote',
      'Pride and Prejudice', 'War and Peace', 'Odyssey', 'Iliad', 'Divine Comedy', 'Symphony No. 9 (Beethoven)', 'The Magic Flute',
      'Swan Lake', 'Jazz', 'Blues', 'Opera', 'Ballet', 'Impressionism', 'Cubism', 'Baroque', 'Gothic architecture', 'Taj Mahal',
      'Eiffel Tower', 'Parthenon', 'Colosseum', 'Great Wall of China', 'Statue of Liberty', 'Sydney Opera House', 'Guernica (Picasso)',
      'The Scream', 'Girl with a Pearl Earring', 'The Great Gatsby', 'Moby-Dick', 'Frankenstein', 'Origami', 'Kabuki', 'Photography', 'Haiku',
    ] },
    { id: 'people', name: 'People', titles: [
      'William Shakespeare', 'Leonardo da Vinci', 'Albert Einstein', 'Isaac Newton', 'Marie Curie', 'Charles Darwin', 'Galileo Galilei',
      'Wolfgang Amadeus Mozart', 'Ludwig van Beethoven', 'Napoleon', 'Julius Caesar', 'Cleopatra', 'Alexander the Great', 'Genghis Khan',
      'Abraham Lincoln', 'Mahatma Gandhi', 'Nelson Mandela', 'Martin Luther King Jr.', 'Queen Victoria', 'Elizabeth I', 'Confucius',
      'Aristotle', 'Plato', 'Socrates', 'Michelangelo', 'Pablo Picasso', 'Vincent van Gogh', 'Frida Kahlo', 'Ada Lovelace', 'Nikola Tesla',
      'Thomas Edison', 'Florence Nightingale', 'Joan of Arc', 'Christopher Columbus', 'Marco Polo', 'Neil Armstrong', 'Amelia Earhart',
      'Jane Austen', 'Charles Dickens', 'Mark Twain',
    ] },
  ];

  const cache = new Map();
  function summary(title) {
    if (!cache.has(title)) cache.set(title, Wiki.summary(title).catch((e) => { cache.delete(title); throw e; }));
    return cache.get(title);
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const display = (t) => t.replace(/\s*\([^)]*\)$/, '');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'des', 'del', 'von', 'van', 'der']);

  function sentences(text, n) {
    const parts = (text || '').split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/);
    let out = parts.slice(0, n).join(' ');
    if (out.length > 340) out = out.slice(0, 337).replace(/\s+\S*$/, '') + '…';
    return out;
  }

  // Marks a hidden word in a passage. A private-use character, so it never appears in real text.
  const BLANK = '';

  // Hide the subject's name (and words built from it, like "Roman" -> "Romans") in a passage.
  // Consecutive hidden words merge into one blank, so a two-word name shows as a single gap.
  function redact(text, ...names) {
    const words = new Set(names.join(' ').split(/[^\p{L}\p{N}']+/u).map((w) => w.replace(/'s$/i, ''))
      .filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase())));
    let out = text.replace(/\s*\([^()]*[/ˈˌ][^()]*\)/g, ''); // pronunciation guides
    for (const w of words) out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRe(w)}[\\p{L}']*`, 'giu'), BLANK);
    return out
      .replace(new RegExp(`${BLANK}(?:[\\s-]+${BLANK})+`, 'g'), BLANK)
      .replace(/\(\s*\)/g, '')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s{2,}/g, ' ');
  }

  // Splits a passage into DOM-ready pieces: plain text, plus a styled "?" blank wherever a word was hidden.
  function passage(text, h) {
    return text.split(BLANK).flatMap((part, i) => (i ? [h('span', { class: 'blank', title: 'Hidden word' }, '?'), part] : [part]));
  }

  const RECENT_KEY = 'e2k.trivia.recent';
  function recent() { try { return new Set(JSON.parse(localStorage.getItem(RECENT_KEY)) || []); } catch { return new Set(); } }
  function remember(t) {
    try {
      const list = [...recent()].filter((x) => x !== t);
      list.push(t);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(-150)));
    } catch {}
  }

  async function subjectFor(topic) {
    const seen = recent();
    let pool = shuffle(topic.titles.filter((t) => !seen.has(t)));
    if (pool.length < 4) pool = shuffle([...topic.titles]);
    for (const t of pool.slice(0, 6)) {
      try {
        const s = await summary(t);
        if (s.type !== 'disambiguation' && s.extract) return { title: t, s };
      } catch {}
    }
    throw new Error('Couldn’t find a question');
  }

  function withChoices(q, correct, wrong) {
    const others = [...new Set(wrong)].filter((w) => w !== correct).slice(0, 3);
    const choices = shuffle([correct, ...others]);
    return { ...q, choices, answer: choices.indexOf(correct) };
  }

  async function yearQuestion(topic) {
    const d = new Date(2001, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));
    const data = await Wiki.onThisDay(d, 'selected');
    const now = new Date().getFullYear();
    const events = (data.selected || []).filter((e) => e.year >= 1000 && e.year < now && e.text && !e.text.includes(String(e.year)));
    const e = pick(events);
    if (!e) throw new Error('No events');
    const step = Math.max(2, Math.round((now - e.year) * 0.07));
    const years = new Set([e.year]);
    while (years.size < 4) {
      const y = e.year + (1 + Math.floor(Math.random() * 6)) * step * (Math.random() < 0.5 ? -1 : 1);
      if (y > 0 && y < now) years.add(y);
    }
    const choices = [...years].sort((a, b) => a - b).map(String);
    const page = (e.pages || [])[0];
    const when = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    return {
      topic: topic.id, type: 'year', kicker: 'Guess the year', prompt: 'In what year did this happen?', detail: e.text,
      choices, answer: choices.indexOf(String(e.year)),
      learn: page ? page.titles?.normalized || page.title : null,
      fact: `It happened on ${when}, ${e.year}.` + (page?.extract ? ' ' + sentences(page.extract, 1) : ''),
    };
  }

  // topicId: one of TOPICS ids, or 'any' for a random topic.
  async function make(topicId) {
    const topic = topicId === 'any' ? pick(TOPICS) : TOPICS.find((t) => t.id === topicId);
    const kinds = ['mystery', 'mystery', 'picture', 'describe'].concat(topic.id === 'history' ? ['year', 'year'] : []);
    const kind = pick(kinds);
    if (kind === 'year') {
      try { return await yearQuestion(topic); } catch {}
    }
    const { title, s } = await subjectFor(topic);
    remember(title);
    const name = s.titles?.normalized || title;
    const base = { topic: topic.id, learn: name, fact: sentences(s.extract, 2) };
    const wrong = shuffle(topic.titles.filter((t) => t !== title)).slice(0, 4).map(display);

    if (kind === 'picture' && s.thumbnail?.source) {
      // Only offer wrong answers that have pictures too, so none can be ruled out as "not something you can photograph".
      const others = await Promise.allSettled(shuffle(topic.titles.filter((t) => t !== title)).slice(0, 7).map(summary));
      const pictured = others.filter((r) => r.status === 'fulfilled' && r.value.thumbnail?.source && r.value.type !== 'disambiguation')
        .map((r) => display(r.value.titles?.normalized || r.value.title));
      if (pictured.length >= 3) {
        return withChoices({ ...base, type: 'picture', kicker: 'Picture puzzle', prompt: 'What does this picture show?', image: s.thumbnail.source },
          display(name), pictured);
      }
    }
    if (kind === 'describe' && s.description) {
      const others = await Promise.allSettled(shuffle(topic.titles.filter((t) => t !== title)).slice(0, 5).map(summary));
      const descs = others.filter((r) => r.status === 'fulfilled' && r.value.description && r.value.description !== s.description)
        .map((r) => cap(r.value.description));
      if (descs.length >= 3) {
        return withChoices({ ...base, type: 'describe', kicker: 'Match the description', prompt: `Which of these describes ${display(name)}?` },
          cap(s.description), descs);
      }
    }
    return withChoices({
      ...base, type: 'mystery', kicker: 'Mystery subject', prompt: 'Which subject is this passage about?',
      detail: redact(sentences(s.extract, 2), title, name),
    }, display(name), wrong);
  }

  return { TOPICS, make, display, passage };
})();
