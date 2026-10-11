// Activities register themselves here, the same way games do (see src/games/registry.js).
// An activity is { id, name, blurb, art(api), mount(root, api) } and opens at the route "activity/<id>".
window.E2KActivities = {
  list: [],
  register(activity) { this.list.push(activity); },
  get(id) { return this.list.find((a) => a.id === id); },
};
