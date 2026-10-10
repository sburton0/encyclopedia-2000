// Games register themselves here; the Games page lists whatever is registered.
//
// A game is an object with:
//   id        short unique id, used in the route "game/<id>"
//   name      display name
//   blurb     one or two sentences for the Games page
//   art(api)      optional: returns an element for the game's card artwork
//   progress(api) optional: returns a short progress string for its card
//   mount(root, api)  draws the game into `root`; may return a cleanup function
//
// `api` is window.E2K (see app.js): helpers for building DOM, saving progress, sounds, and opening articles.
window.E2KGames = {
  list: [],
  upcoming: [
    { name: 'Time Traveler', icon: 'clock', blurb: 'Put history in order: place events on a timeline and guess the year they happened.' },
    { name: 'Mystery Subject', icon: 'q', blurb: 'Clues appear one at a time. Name the subject in as few clues as you can.' },
  ],
  register(game) { this.list.push(game); },
  get(id) { return this.list.find((g) => g.id === id); },
};
