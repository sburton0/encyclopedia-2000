// A placeholder for search results that have no free picture (Wikipedia leaves out non-free logos and posters): an icon
// for the kind of subject, guessed cautiously from the result's short description ("2013 film by…", "NFL team in…",
// "American actor (born 1970)"). The first rule that matches wins; anything unclear gets a plain book, so a guess is
// never confidently wrong. Checked against 2,000 real search results (October 2026).
window.E2KKinds = (() => {
  const PERSON_ROLE = /\b(actor|actress|singer|songwriter|rapper|musician|composer|guitarist|drummer|bassist|pianist|saxophonist|conductor|politician|footballer|player|athlete|golfer|cricketer|wrestler|boxer|racing driver|swimmer|surfer|freediver|skater|coach|manager|writer|author|novelist|poet|playwright|journalist|broadcaster|comedian|filmmaker|director|producer|screenwriter|artist|painter|sculptor|photographer|architect|designer|model|dancer|scientist|physicist|chemist|biologist|mathematician|engineer|inventor|philosopher|psychologist|economist|historian|businessman|businesswoman|entrepreneur|executive|founder|personality|influencer|socialite|activist|lawyer|attorney|judge|monarch|king|queen|emperor|empress|prince|princess|pope|saint|bishop|priest|minister|general|officer|soldier|astronaut|explorer|surveyor|mountaineer|criminal|murderer|spy|aristocrat|nobleman|noblewoman|heir|wife|husband|mother|father|son|daughter|matriarch|patriarch|chef|entertainer|magician|escapologist|stuntman|drag queen|youtuber|streamer|ethnobotanist|lecturer|pathologist|physician|surgeon|nurse)\b/i;
  const NOT_PERSON = /\b(characters|character|detector|experiment|telescope|satellite|probe|spacecraft|instrument|device|machine|computer|software|system|structure|sitcom|soap opera|show|serial|car|cars|vehicle|aircraft|ship|warship|train|locomotive|series|program|programme|spaceflight|mission|university|college|school|wall|building|bridge|tower|era|period|war|battle|team|club|league|state|city|capital|enclave|country|empire|kingdom|dynasty|company|band|group|album|game|console|award|event|festival|church|cathedral)\b/i;
  const LIFESPAN = /\((born|b\.) [^)]*\d{3,4}[^)]*\)|\(died [^)]*\d{3,4}\)|\(\s*(c\. ?)?\d{1,4}( BC)?\s*[–-]\s*(c\. ?)?\d{1,4}( BC| AD)?\s*\)/;
  const PLACE_NOUN = '(city|town|village|hamlet|borough|county|municipality|commune|province|region|district|neighbou?rhood|suburb|parish|island|archipelago|river|lake|waterfall|mountain|peak|volcano|desert|sea|ocean|bay|gulf|strait|peninsula|valley|canyon|forest|metropolitan area|city centre|census-designated place|community|territory|national park|country|sovereign state)';
  const PLACE = new RegExp(`^((\\w|-)+[ ,]+){0,3}${PLACE_NOUN}( and [\\w ]+?)? (in|of|on|that|flows|located)\\b|^(u\\.s\\. state|country in)`, 'i');
  // "State of Australia" and "Capital of Nebraska" are places; "State of matter" isn't: a capitalized name must follow.
  const STATE_OF = /^(State|Capital|Capital city) (of|in) [A-Z]/;

  function kind(d) {
    d = (d || '').trim();
    if (!d) return 'other';
    if (/^(list|index|overview|outline|topics|disambiguation|wikimedia|episode list|history of|politics of|culture of|economy of|geography of|demographics of|nicknames of|anthem|head of|governor of)\b/i.test(d)) return 'other';
    // People: a birth year, a death year, or a lifespan, with a person's role and nothing that names a thing.
    if (LIFESPAN.test(d)) {
      const rest = d.replace(LIFESPAN, '');
      if (PERSON_ROLE.test(rest) || !NOT_PERSON.test(rest)) return 'person';
    }
    if (/^((\w|-)+ ){0,4}(film|television|tv|music|record|theatre|theater|stage|voice) ?(actor|actress|director|producer|composer|executive)\b/i.test(d)) return 'person';
    // Sports: teams, clubs, leagues, and championships.
    if (/\b(sports team|football club|soccer club|association football club|(basketball|baseball|hockey|football|softball|rugby|cricket|volleyball|esports) (team|club)|national (football|basketball|cricket|rugby) team|(nfl|nba|mlb|nhl|mls|wnba|nwsl) team|team (in|based in) |club (in|based in) |championship game|sports league|football league season|team season|club season)\b/i.test(d)) return 'team';
    // Films, TV, and video games.
    if (/\b((\d{4}|upcoming|unreleased|american|british|indian|japanese|french|canadian|australian|korean|chinese|italian|animated|documentary|comedy|drama|horror|thriller|action|fantasy|science fiction|romantic|crime|silent|short|anthology|disney|tv|television|superhero|war|musical|animated disney) film|film by|film directed by|film series|television (series|show|sitcom|film|miniseries|special)|tv (series|show|film)|miniseries|sitcom|soap opera|web series|anime|animated series|episode of|(\d{4}|puzzle|role-playing|action|adventure|platform|racing|sports|fighting|strategy|simulation) video game|video game series|video game franchise|media franchise)\b/i.test(d)
      && !/\b(developer|publisher|console|company|studio|studios|distributor|stage|musical)\b/i.test(d)) return 'screen';
    // Music.
    if (/\b((studio|live|compilation|debut|greatest hits|soundtrack|tribute|cover|remix|video|ep|mixtape) album|album by|(\d{4}|debut|promotional) single|single by|song by|(\d{4}) song|(rock|pop|metal|punk|indie|jazz|folk|hip hop|country|r&b|soul|electronic|heavy metal|progressive rock|power metal|boy|girl|k-pop) band|musical group|hip hop group|discography|recordings by|singles recorded by|opera by|symphony by|concerto by|composition by)\b/i.test(d)) return 'music';
    if (PLACE.test(d) || STATE_OF.test(d)) return 'place';
    return 'other';
  }

  // 24 x 24 icons, drawn in the tile's color.
  const ICONS = {
    team: 'M7 4h10v3a5 5 0 0 1-4 4.9V14h3v2H8v-2h3v-2.1A5 5 0 0 1 7 7zM4 5h2v2a2 2 0 0 0 1 1.7V10a4 4 0 0 1-3-3.9zm16 0v1.1A4 4 0 0 1 17 10V8.7A2 2 0 0 0 18 7V5zM7 18h10v2H7z',
    screen: 'M4 5h16v14H4zm2 2v2h2V7zm10 0v2h2V7zM6 11v2h2v-2zm10 0v2h2v-2zM6 15v2h2v-2zm10 0v2h2v-2zM10 7v10h4V7z',
    person: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-7 16c0-3.9 3.1-6 7-6s7 2.1 7 6z',
    place: 'M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    music: 'M9 4l11-2v13a3 3 0 1 1-2-2.8V6l-7 1.3V17a3 3 0 1 1-2-2.8z',
    other: 'M3 5c3-1.3 6-1.2 8 .4V20c-2-1.4-5-1.5-8-.4zm18 0v14.6c-3-1.1-6-1-8 .4V5.4c2-1.6 5-1.7 8-.4z',
  };
  // The placeholder's icon as an SVG element (svg is the app's SVG element helper).
  const icon = (svg, description) => svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: ICONS[kind(description)] }));
  return { kind, icon };
})();
