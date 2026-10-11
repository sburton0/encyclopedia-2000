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
  register(game) { this.list.push(game); },
  get(id) { return this.list.find((g) => g.id === id); },
};
