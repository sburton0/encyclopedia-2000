// Activities register themselves here, the same way games do (see src/games/registry.js).
// An activity is { id, name, category, blurb, art(api), mount(root, api) } and opens at the route "activity/<id>".
// One that lives elsewhere in the app gives a `route` instead of `mount`, and its card opens that route.
// The Activities page groups them by category, in this order; a category only appears once something is in it.
window.E2KActivities = {
  categories: ['Science', 'Space', 'Nature', 'Earth', 'History', 'Geography', 'Arts & Music'],
  list: [],
  register(activity) { this.list.push(activity); },
  get(id) { return this.list.find((a) => a.id === id); },
};

// World Explorer has its own Home screen button; this card also lists it under Geography.
E2KActivities.register({
  id: 'world-explorer',
  name: 'World Explorer',
  category: 'Geography',
  route: 'world',
  blurb: 'A clickable map of 237 countries and territories. See each one’s flag, capital, population, languages, and more.',
  art(api) {
    const { svg } = api;
    const s = svg('svg', { viewBox: '0 0 200 120', class: 'wx-art', style: 'width:100%;height:100%' });
    s.innerHTML = `<defs><radialGradient id="wx-art-g" cx="40%" cy="35%"><stop offset="0" stop-color="#5a8fe0"/><stop offset="1" stop-color="#16346e"/></radialGradient></defs>
      <circle cx="100" cy="60" r="44" fill="url(#wx-art-g)" stroke="#9fb4e6" stroke-opacity=".5"/>
      <g fill="none" stroke="#9fb4e6" stroke-opacity=".3"><ellipse cx="100" cy="60" rx="20" ry="44"/><ellipse cx="100" cy="60" rx="38" ry="44"/><path d="M56 60h88M62 38h76M62 82h76"/></g>
      <path d="M74 36q10-6 20 0q6 8-2 14q-8 2-10 12q-8-4-10-12zM104 40q14-4 24 4q4 8-4 12q-8 0-10 10q-6 6-12 0q-2-14 2-26zM112 78q10-2 14 6q-4 6-12 4z" fill="#cfe0f5" opacity=".9"/>
      <path d="M128 52l6 4" stroke="#f5a623" stroke-width="3" stroke-linecap="round"/><circle cx="131" cy="54" r="5" fill="#f5a623" opacity=".35"/>`;
    return s;
  },
});
