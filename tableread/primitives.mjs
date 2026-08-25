// Composable front-door acts for saga fixtures. Same idiom as
// fizz/mbt/support/world.ts — every step is a real form, fetched, filled,
// and posted back — ported outside that tree (no cheerio; see html.mjs) so
// it can point at a real deployed origin (staging) instead of a local
// wrangler dev. createSagaWorld(baseUrl) returns `p`, a shared context: one
// cookie jar per persona, and an id map recorded as the front door hands
// ids back — never read from a database, because sagas only ever touch the
// product through its own doors.
import { Actor, request, buildBody } from './http.mjs';
import { optionsOf, firstRealOption } from './html.mjs';

export const STAGING_BASE_URL = 'https://fireside-staging.noisy-glade-1496.workers.dev';

function future(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

function rid() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** A short, stable, unique handle for a persona, derived from a display
 *  name ("Reviewer A" -> "reviewer-a"), disambiguated on collision. Used as
 *  the jar key and as the value recipes pass back into stageReview /
 *  submitReviews / surfaces. */
function personaHandle(name, taken) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'persona';
  let candidate = base;
  let i = 2;
  while (taken.has(candidate)) candidate = `${base}-${i++}`;
  taken.add(candidate);
  return candidate;
}

/** Decode the payload of a magic-link token straight off a link the app
 *  printed us: {purpose, subjectId, nonce, exp}. This is NOT signature
 *  verification (we have no secret and don't need one) — it's reading data
 *  the front door already handed back in plain sight, the same way a
 *  person reading the page would learn nothing more from it. subjectId is
 *  the personId; that's how every primitive below records one without ever
 *  opening a database connection. */
function decodeMagicLink(link) {
  const u = new URL(link);
  const t = u.searchParams.get('t');
  if (!t) throw new Error(`Not a magic sign-in link (no t= param): ${link}`);
  const payload = t.split('.', 1)[0];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

// Non-greedy, stopped at the first HTML-meaningful character. The printed
// link appears twice back to back with no whitespace between them (once in
// an auto-linkified href="...", once as the same text right after) — a
// plain greedy \S+ run-on match swallows straight through the closing
// quote into the second copy, corrupting the token. fizz/mbt/support/
// world.ts hits the same trap from a different angle (cheerio's whole-page
// .text() swallowing a token's tail into the next label) and works around
// it by reading one <p> at a time instead; here the fix is just bounding
// the match.
const MAGIC_LINK_RE = /https?:\/\/\S+?\/sign-in\/magic\?\S+?(?=["'<\s])/;

/** The CFP form's track radios are the one field extractFields can't give a
 *  name<->slug mapping for on its own (the label lives in a sibling span,
 *  not on the input) — this is the one hand-rolled regex specific to that
 *  one field, the mbt-proven "fetch+regex is enough" idea applied locally
 *  rather than folded into the generic html.mjs surgery. */
function cfpTrackOptions(formHtml) {
  const re =
    /<input type="radio" name="track" value="([^"]*)"[^>]*>[\s\S]*?<span class="rname">([^<]*)<\/span>/g;
  const out = [];
  let m;
  while ((m = re.exec(formHtml))) out.push({ slug: m[1], name: m[2] });
  return out;
}

export function createSagaWorld(baseUrl = STAGING_BASE_URL) {
  const actors = new Map(); // persona -> Actor
  const personaByEmail = new Map();
  const usedPersonas = new Set(['organizer']);

  const world = {
    baseUrl,
    slug: null,
    ids: {
      organizer: null,
      reviewers: {}, // persona -> { email, name, personId }
      submissions: [], // { title, track, email, id? } — index is submissionIndex
      groups: {}, // groupId -> { name, track, members }
    },
  };

  function actorFor(persona) {
    let a = actors.get(persona);
    if (!a) {
      a = new Actor(baseUrl);
      actors.set(persona, a);
    }
    return a;
  }

  /** Exposed for run-station.mjs / capture.mjs: the cookie jar behind a
   *  persona, so a surface can be read as the same person who acted. */
  function jarFor(persona) {
    return actorFor(persona).jar;
  }

  /** A signed-in persona's own personId, read straight off their session
   *  cookie (fs_s=...) rather than a database lookup — the session token is
   *  the same {purpose, subjectId, nonce, exp} shape decodeMagicLink already
   *  reads off a mailed link, just not wrapped in a `t=` query param. Useful
   *  wherever a scene needs a path param (e.g. /connect/:friend/schedule)
   *  for a person the front door never handed an id back for directly. */
  function personIdOf(persona) {
    const header = actorFor(persona).jar.header();
    const m = header.match(/(?:^|;\s*)fs_s=([^;]+)/);
    if (!m) throw new Error(`personIdOf(${persona}): no session cookie set — has this persona signed in yet?`);
    const payload = JSON.parse(Buffer.from(m[1].split('.', 1)[0], 'base64url').toString('utf8'));
    return payload.subjectId;
  }

  // ---- account + conference setup ----

  /** General-purpose sign-up: creates an account bound to any persona name,
   *  not just 'organizer' — the door Act V's attendees walk through, same as
   *  everyone else (docs/sagas/README.md has no separate "attendee" persona
   *  concept; an attendee is just a person who signed up and never opened
   *  /admin/new). Records personaByEmail so a later signInLink(email) reuses
   *  the same identity rather than minting a second one. */
  async function signUpAs(persona, name, email, password) {
    personaByEmail.set(email, persona);
    const actor = actorFor(persona);
    const res = await actor.postForm('/sign-up', (f) => f.action === '/sign-up', {
      name,
      email,
      password,
    });
    if (res.status >= 400) {
      throw new Error(`signUpAs(${persona}) failed for ${email}: ${res.status} (landed on ${res.url})`);
    }
    return persona;
  }

  async function signUp(name, email, password) {
    await signUpAs('organizer', name, email, password);
    world.ids.organizer = { email, name };
    return 'organizer';
  }

  /** General-purpose: sign a persona in by email alone, the same "Email me
   *  a sign-in link instead" path any @example.org account can use. Reuses
   *  the persona already on record for that email (e.g. one inviteReviewer
   *  created) rather than minting a second identity for the same address. */
  async function signInLink(email) {
    let persona = personaByEmail.get(email);
    if (!persona) {
      persona = personaHandle(email.split('@')[0], usedPersonas);
      personaByEmail.set(email, persona);
    }
    const actor = actorFor(persona);
    const { forms, result } = await actor.load('/sign-in');
    const form = forms.find((f) => f.action === '/sign-in');
    if (!form) throw new Error(`No /sign-in form found (status ${result.status})`);
    const fields = { ...form.fields, email };
    delete fields.password;
    const linkRes = await request(actor.jar, baseUrl, '/sign-in/link', {
      method: 'POST',
      body: buildBody(fields),
    });
    const m = linkRes.html.match(MAGIC_LINK_RE);
    if (!m) {
      throw new Error(
        `No sign-in link printed for ${email} on /sign-in/link's response — is it an @example.org address?`
      );
    }
    await actor.get(m[0]);
    const payload = decodeMagicLink(m[0]);
    return { persona, personId: payload.subjectId };
  }

  async function createConference(name, opts = {}) {
    const organizer = actorFor('organizer');
    const slug = opts.slug || `saga-${rid()}`;
    const tracks = opts.tracks ?? [];

    const res = await organizer.postForm('/admin/new', (f) => f.action === '/admin/new', (fields) => {
      fields.name = name;
      fields.slug = slug;
      fields.starts_on = opts.startsOn || future(90);
      fields.ends_on = opts.endsOn || future(91);
      fields.timezone = fields.timezone || 'America/New_York';
      fields.call_open = '1';
      fields.cfp_closes_on = opts.cfpClosesAt || future(60);
      fields.decide_by = opts.decideBy || future(75);
      fields.rooms = fields.rooms || 'Main stage';
      fields.tracks = tracks.join('\n');
      if (opts.venueName) fields.venue_name = opts.venueName;
    });
    if (res.status !== 200 || res.url !== `${baseUrl}/admin/${slug}`) {
      throw new Error(
        `createConference "${name}" did not land on /admin/${slug} (landed on ${res.url}, status ${res.status})`
      );
    }
    world.slug = slug;
    return { slug };
  }

  // ---- team ----

  async function inviteReviewer(email, name) {
    const persona = personaHandle(name, usedPersonas);
    personaByEmail.set(email, persona);
    const organizer = actorFor('organizer');
    const settings = `/admin/${world.slug}/settings`;
    const res = await organizer.postForm(
      settings,
      (f) => f.action.endsWith('/team/add'),
      { email, name, role: 'reviewer' }
    );
    const key = new URL(res.url).searchParams.get('key');
    if (!key) {
      throw new Error(`Team invite for ${email} did not hand back a sign-in link (landed on ${res.url})`);
    }
    const link = decodeURIComponent(key);
    const payload = decodeMagicLink(link);

    const actor = actorFor(persona);
    await actor.get(link);

    // res.url is the settings page Dana actually landed on, key= and all —
    // the GET handler reads that same query param on any later visit too
    // (settings.ts: `const key = c.req.query('key')`), so a scene wanting
    // to snap "what Dana sees right after inviting" can just re-fetch this
    // exact URL rather than needing the raw token threaded through by hand.
    world.ids.reviewers[persona] = { email, name, personId: payload.subjectId, inviteLandingUrl: res.url };
    return persona;
  }

  // ---- CFP ----

  async function cfpSubmit(n, opts = {}) {
    const cfpPath = `/${world.slug}/cfp`;
    const created = [];
    let trackOptions = null;

    for (let i = 0; i < n; i++) {
      const speaker = new Actor(baseUrl); // a fresh, unauthenticated identity per submission — the CFP needs no account
      const { forms, result } = await speaker.load(cfpPath);
      const form = forms.find((f) => f.class.split(/\s+/).includes('cfpform'));
      if (!form) throw new Error(`No form.cfpform on ${cfpPath} (status ${result.status})`);
      if (trackOptions === null) trackOptions = cfpTrackOptions(form.body);

      let trackName = null;
      const fields = { ...form.fields };
      if (trackOptions.length) {
        const picked = opts.track
          ? trackOptions.find((t) => t.name === opts.track)
          : trackOptions[world.ids.submissions.length % trackOptions.length];
        if (!picked) throw new Error(`Track "${opts.track}" is not on ${cfpPath}'s form`);
        fields.track = picked.slug;
        trackName = picked.name;
      }
      const formatOptions = optionsOf(form.body, 'format');
      const levelOptions = optionsOf(form.body, 'level');
      if (formatOptions.length) fields.format = firstRealOption(formatOptions) ?? fields.format;
      if (levelOptions.length) fields.level = firstRealOption(levelOptions) ?? fields.level;

      const stamp = `${rid()}-${i}`;
      const title = opts.title ? `${opts.title} ${stamp}` : `Saga proposal ${stamp}`;
      // opts.email lets a scene submit under a deliberately different address
      // than the one it will later try signing in with (the lost-identity
      // scenes — a mistyped CFP address, filed under a name nobody owns).
      // Left unset, the harness's own generated address is used, as before.
      const speakerEmail = opts.email || `speaker-${stamp}@example.org`;
      fields.title = title;
      fields.abstract =
        'A synthetic proposal submitted by the saga tools. Not a real talk — used only to ' +
        'exercise the review workflow end to end.';
      fields.name = opts.name || `Saga Speaker ${stamp}`;
      fields.org = 'Saga Harness';
      fields.email = speakerEmail;

      const action = form.action || cfpPath;
      const method = form.method || 'POST';
      const postUrl = new URL(action, result.url).toString();
      const postRes = await request(speaker.jar, baseUrl, postUrl, { method, body: buildBody(fields) });
      if (!postRes.url.includes('/cfp/thanks')) {
        throw new Error(
          `CFP submission "${title}" did not land on /cfp/thanks (landed on ${postRes.url}, status ${postRes.status})`
        );
      }

      const submission = { title, track: trackName, email: speakerEmail, id: null };
      world.ids.submissions.push(submission);
      created.push(submission);
    }
    return created;
  }

  // ---- reviewer groups + dealing ----

  async function createGroup(name, members, track = null) {
    const organizer = actorFor('organizer');
    const memberIds = members.map((persona) => {
      const r = world.ids.reviewers[persona];
      if (!r) throw new Error(`createGroup: "${persona}" is not a reviewer persona (call inviteReviewer first)`);
      return r.personId;
    });

    const groupsPath = `/admin/${world.slug}/reviews/reviewers`;
    const res = await organizer.postForm(
      groupsPath,
      (f) => f.action.endsWith('/reviews/reviewers/groups'),
      (fields, form) => {
        fields.name = name;
        fields.member = memberIds;
        if (track) {
          const options = optionsOf(form.body, 'track');
          const picked = options.find((o) => o.text.trim() === track);
          if (!picked) throw new Error(`createGroup: track "${track}" is not on the new-group form`);
          fields.track = picked.value;
        }
      }
    );
    const gid = new URL(res.url).searchParams.get('gid');
    if (!gid) throw new Error(`createGroup "${name}" did not hand back a group id (landed on ${res.url})`);
    world.ids.groups[gid] = { name, track, members };
    return gid;
  }

  async function dealTo({ group = null, who = null, each = 1 } = {}) {
    const organizer = actorFor('organizer');
    const handOutPath = `/admin/${world.slug}/reviews/reviewers`;
    const res = await organizer.postForm(
      handOutPath,
      (f) => f.action.endsWith('/reviews/hand-out'),
      (fields) => {
        fields.each = String(each);
        if (group) {
          fields.group = group;
        } else {
          fields.group = '';
          if (who) fields.who = who.map((persona) => world.ids.reviewers[persona].personId);
          // else: leave the scraped default, which is every current reviewer checked — true "everyone".
        }
      }
    );
    if (res.status >= 400) throw new Error(`dealTo failed: ${res.status} (landed on ${res.url})`);
    return res.url;
  }

  /** Name the round, set its dates, flip blind on/off — the same form
   *  whichever screen it renders on (Reviewers view). Fields match
   *  reviews.ts's round-config handler exactly: round, name, opens, closes,
   *  blind ('1'/'0'). */
  async function roundConfig({ round = '1', name = '', opens = '', closes = '', blind = '0' } = {}) {
    const organizer = actorFor('organizer');
    const path = `/admin/${world.slug}/reviews/reviewers`;
    const res = await organizer.postForm(
      path,
      (f) => f.action.endsWith('/reviews/round-config'),
      (fields) => {
        fields.round = String(round);
        fields.name = name;
        fields.opens = opens;
        fields.closes = closes;
        fields.blind = blind;
      }
    );
    if (res.status >= 400) throw new Error(`roundConfig failed: ${res.status} (landed on ${res.url})`);
    return res.url;
  }

  /** Seal the current round and open the next one, named and dated in the
   *  same confirm (reviews.ts's open-round handler). */
  async function openRound({ from = '1', to = '2', name = '', opens = '', closes = '', blind = '0' } = {}) {
    const organizer = actorFor('organizer');
    const path = `/admin/${world.slug}/reviews/reviewers`;
    const res = await organizer.postForm(
      path,
      (f) => f.action.endsWith('/reviews/open-round'),
      (fields) => {
        fields.from = String(from);
        fields.to = String(to);
        fields.name = name;
        fields.opens = opens;
        fields.closes = closes;
        fields.blind = blind;
      }
    );
    if (res.status >= 400) throw new Error(`openRound failed: ${res.status} (landed on ${res.url})`);
    return res.url;
  }

  /** The rescuer's act: take back one reviewer's untouched assignments. The
   *  page renders one retractForm per reviewer with untouched work, each
   *  carrying that reviewer's own personId in a hidden field — matched here
   *  by body text the same way stageReview matches a submission's title.
   *  expected left unset uses the form's own scraped count (the number the
   *  chair actually read on screen), which is the safe default — takeBack
   *  only ever succeeds when what it reads back matches what it acts on
   *  (review.ts's own UNTOUCHED_SQL). */
  async function takeBack(reviewerPersona, expected) {
    const r = world.ids.reviewers[reviewerPersona];
    if (!r) throw new Error(`takeBack: "${reviewerPersona}" is not a reviewer persona (call inviteReviewer first)`);
    const organizer = actorFor('organizer');
    const path = `/admin/${world.slug}/reviews/reviewers`;
    const res = await organizer.postForm(
      path,
      (f) => f.action.endsWith('/reviews/take-back') && f.body.includes(r.personId),
      (fields) => {
        if (expected !== undefined) fields.expected = String(expected);
      }
    );
    if (res.status >= 400) {
      throw new Error(
        `takeBack("${reviewerPersona}") failed: ${res.status} — does ${reviewerPersona} actually hold ` +
          `untouched assignments? (landed on ${res.url})`
      );
    }
    return res.url;
  }

  // ---- reviewing ----

  async function stageReview(reviewer, submissionIndex, score) {
    const submission = world.ids.submissions[submissionIndex];
    if (!submission) throw new Error(`stageReview: no submission at index ${submissionIndex}`);
    const actor = actorFor(reviewer);
    const reviewsPath = `/admin/${world.slug}/reviews`;
    const res = await actor.postForm(
      reviewsPath,
      (f) => f.action.endsWith('/reviews/stage') && f.body.includes(submission.title),
      (fields) => {
        for (const key of Object.keys(fields)) {
          if (key.startsWith('score_')) fields[key] = String(score);
        }
      }
    );
    if (res.status >= 400) {
      throw new Error(
        `stageReview("${reviewer}", ${submissionIndex}) failed: ${res.status} — is "${submission.title}" ` +
          `actually assigned to ${reviewer}? (landed on ${res.url})`
      );
    }
    return res.url;
  }

  async function submitReviews(reviewer) {
    const actor = actorFor(reviewer);
    const res = await actor.postForm(
      `/admin/${world.slug}/reviews?confirm=1`,
      (f) => f.action.endsWith('/reviews/submit')
    );
    if (res.status >= 400) throw new Error(`submitReviews("${reviewer}") failed: ${res.status} (landed on ${res.url})`);
    return res.url;
  }

  // ---- deciding + letters ----

  async function resolveSubmissionId(index) {
    const submission = world.ids.submissions[index];
    if (!submission) throw new Error(`No submission at index ${index}`);
    if (submission.id) return submission.id;
    const organizer = actorFor('organizer');
    const pilePath = `/admin/${world.slug}/submissions?q=${encodeURIComponent(submission.title)}`;
    const { result } = await organizer.load(pilePath);
    const re = new RegExp(
      `href="/admin/${world.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/submissions/([^"]+)">${submission.title.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )}<`
    );
    const m = re.exec(result.html);
    if (!m) throw new Error(`Could not find submission "${submission.title}" on the pile page`);
    submission.id = decodeURIComponent(m[1]);
    return submission.id;
  }

  async function decide(submissionIndex, verdict) {
    const decision = verdict === 'accept' ? 'accepted' : verdict === 'decline' ? 'rejected' : verdict;
    const id = await resolveSubmissionId(submissionIndex);
    const organizer = actorFor('organizer');
    const decidePath = `/admin/${world.slug}/submissions/${id}`;
    const res = await organizer.postForm(
      decidePath,
      (f) => f.action.endsWith(`/submissions/${id}/decide`),
      (fields) => {
        fields.decision = decision;
      }
    );
    if (res.status >= 400) throw new Error(`decide(${submissionIndex}, ${verdict}) failed: ${res.status} (landed on ${res.url})`);
    return res.url;
  }

  async function releaseLetters() {
    const organizer = actorFor('organizer');
    const outboxPath = `/admin/${world.slug}/outbox`;
    const { forms, result } = await organizer.load(outboxPath);
    const askForm = forms.find((f) => f.method === 'GET' && f.action.endsWith('/outbox'));
    const n = askForm?.fields?.confirm;
    if (!n || n === '0') return { released: 0 }; // nothing staged — nothing to send, and nothing to confirm
    const confirmPath = `${outboxPath}?confirm=${encodeURIComponent(n)}`;
    const res = await organizer.postForm(confirmPath, (f) => f.action.endsWith('/outbox/release'));
    if (res.status >= 400) throw new Error(`releaseLetters failed: ${res.status} (landed on ${res.url}, from ${result.url})`);
    return { url: res.url };
  }

  // ---- agenda: placing an accepted talk on the grid, then publishing ----

  /** Put an accepted talk on the grid. The builder is a two-step GUI (click
   *  a waiting talk, then click an open cell) that only a script drives
   *  normally; the front-door equivalent is the same GET-with-?pick=
   *  the rail's own link uses (agenda.ts's `here(view.slug, {pick: t.id})`),
   *  which renders every open cell as its own real <form action=".../place">
   *  with talk/room/at/day already filled in as hidden fields (agenda.ts's
   *  `hidden()` helper) — the first one found is posted back untouched, so
   *  this always lands the talk in *some* free room and slot, never a
   *  specific one a scene can assert by name. */
  async function placeSession(submissionIndex) {
    const id = await resolveSubmissionId(submissionIndex);
    const organizer = actorFor('organizer');
    const pickPath = `/admin/${world.slug}/agenda?pick=${encodeURIComponent(id)}`;
    const res = await organizer.postForm(pickPath, (f) => f.action.endsWith('/agenda/place'));
    if (res.status >= 400) {
      throw new Error(
        `placeSession(${submissionIndex}) failed: ${res.status} — is that submission Accepted yet? ` +
          `(landed on ${res.url})`
      );
    }
    return res.url;
  }

  /** Second pass: the publish form only renders at all once asked for once
   *  (agenda.ts gates publishStrip on `?confirm=publish`, the same "Publish
   *  the agenda" link a person clicks first) — so this GETs that confirming
   *  state itself before reading the form back. The hidden `placed` count
   *  inside it is read straight off the page (agenda.ts: "the number she
   *  read is the number that goes public") — never invented here. */
  async function publishAgenda() {
    const organizer = actorFor('organizer');
    const path = `/admin/${world.slug}/agenda?confirm=publish`;
    const res = await organizer.postForm(path, (f) => f.action.endsWith('/agenda/publish'));
    if (res.status >= 400) throw new Error(`publishAgenda failed: ${res.status} (landed on ${res.url})`);
    return res.url;
  }

  /** The first session's own public-page slug findable on the published
   *  agenda — good enough for a scene that just needs *a* session's own
   *  page, not a specific one. Works unauthenticated; the agenda is public
   *  once published. */
  async function agendaSessionSlug(persona = 'organizer') {
    const actor = actorFor(persona);
    const { result } = await actor.load(`/${world.slug}/agenda`);
    const m = result.html.match(new RegExp(`/${world.slug}/s/([a-zA-Z0-9_-]+)`));
    if (!m) throw new Error(`No session link found on /${world.slug}/agenda — is the agenda published?`);
    return m[1];
  }

  /** The first speaker personId findable on a published session's own
   *  page — routes/public/agenda.ts's speakerBlock links a speaker's name
   *  only there, never inline on the agenda's own list view (checked
   *  against the live route, not assumed). Follows agendaSessionSlug to
   *  find a session to read. */
  async function agendaSpeakerId(persona = 'organizer') {
    const slug = await agendaSessionSlug(persona);
    const actor = actorFor(persona);
    const { result } = await actor.load(`/${world.slug}/s/${slug}`);
    const m = result.html.match(/\/speakers\/([a-zA-Z0-9_-]+)/);
    if (!m) throw new Error(`No speaker link found on /${world.slug}/s/${slug}`);
    return m[1];
  }

  // ---- attendee: welcome, starring, sharing, connecting, following ----
  // Every one of these is a real form on a real public page, read and posted
  // back the same way the organizer- and reviewer-side primitives above do —
  // no field here is invented either.

  /** GET /welcome hands back one <form> per open conference, the whole card
   *  itself the submit button (welcome.ts's `choice()`); matched by the
   *  conference's own name appearing in that form's body, same idiom as
   *  stageReview's title match. */
  async function chooseConference(persona, conferenceName) {
    const actor = actorFor(persona);
    const res = await actor.postForm('/welcome', (f) => f.action === '/welcome' && f.body.includes(conferenceName));
    if (res.status >= 400) {
      throw new Error(`chooseConference(${persona}, "${conferenceName}") failed: ${res.status} (landed on ${res.url})`);
    }
    // A name match is not a slug match: /welcome lists every open conference
    // on the whole instance (no tenant scoping there), so a same-named
    // leftover from an earlier run is a real risk, not a hypothetical one —
    // caught here rather than silently landing a persona on the wrong
    // conference. A successful choice redirects to /:slug/agenda
    // (index.ts's POST /welcome), so the world's own slug must appear in it.
    if (!res.url.includes(`/${world.slug}/`)) {
      throw new Error(
        `chooseConference(${persona}, "${conferenceName}") landed on ${res.url}, not /${world.slug}/... — ` +
          `another conference sharing that name (a leftover fixture?) matched first`
      );
    }
    return res.url;
  }

  /** Star (or unstar) a session from the public, published agenda — the
   *  signed-in branch of routes/public/agenda.ts's own per-card form, one
   *  session id and an explicit `on`, never trusting the page's own toggle
   *  default (a scene should get the direction it asked for, not whichever
   *  way the card happened to be facing). */
  async function star(persona, submissionIndex, on = true) {
    const id = await resolveSubmissionId(submissionIndex);
    const actor = actorFor(persona);
    const agendaPath = `/${world.slug}/agenda`;
    const res = await actor.postForm(
      agendaPath,
      (f) => f.action.endsWith('/my-schedule/star') && f.fields.session === id,
      (fields) => {
        fields.on = on ? '1' : '0';
      }
    );
    if (res.status >= 400) {
      throw new Error(`star(${persona}, ${submissionIndex}, ${on}) failed: ${res.status} (landed on ${res.url})`);
    }
    return res.url;
  }

  /** The share choice (routes/public/schedule.ts's shareForm): on/off, plus
   *  whichever opt-in facts this persona actually has to offer — a fact
   *  they don't have is never in the scraped form to begin with (optIn()'s
   *  own null guard), so only overriding what's present is the honest
   *  thing to do here too. */
  async function shareSchedule(persona, { on = true, work = false, links = false, email = false } = {}) {
    const actor = actorFor(persona);
    const path = `/${world.slug}/my-schedule`;
    const res = await actor.postForm(
      path,
      (f) => f.action.endsWith('/my-schedule/share'),
      (fields) => {
        fields.on = on ? '1' : '0';
        for (const [key, want] of [['work', work], ['links', links], ['email', email]]) {
          if (!(key in fields)) continue; // no such fact for this persona — nothing to offer
          if (want) fields[key] = '1';
          else delete fields[key];
        }
      }
    );
    if (res.status >= 400) throw new Error(`shareSchedule(${persona}) failed: ${res.status} (landed on ${res.url})`);
    return res.url;
  }

  /** Find someone by name and send the request — connect.ts's matchCard
   *  form, read off the search results page itself. */
  async function sendFriendRequest(fromPersona, query) {
    const actor = actorFor(fromPersona);
    const path = `/${world.slug}/connect?q=${encodeURIComponent(query)}`;
    const res = await actor.postForm(path, (f) => f.action.endsWith('/connect/request'));
    if (res.status >= 400) {
      throw new Error(`sendFriendRequest(${fromPersona}, "${query}") failed: ${res.status} (landed on ${res.url})`);
    }
    return res.url;
  }

  /** Accept the (first) incoming request on this persona's own /connect
   *  page — connect.ts's incomingCard form. */
  async function acceptFriendRequest(persona) {
    const actor = actorFor(persona);
    const path = `/${world.slug}/connect`;
    const res = await actor.postForm(path, (f) => f.action.endsWith('/connect/accept'));
    if (res.status >= 400) throw new Error(`acceptFriendRequest(${persona}) failed: ${res.status} (landed on ${res.url})`);
    return res.url;
  }

  /** Follow (or unfollow) a speaker from her own public page — speakers.ts's
   *  followControl form, which lives at exactly that page's own address. */
  async function followSpeaker(persona, speakerPersonId, on = true) {
    const actor = actorFor(persona);
    const backHere = `/${world.slug}/speakers/${speakerPersonId}`;
    const action = on ? 'follow' : 'unfollow';
    const res = await actor.postForm(backHere, (f) => f.action.endsWith(`/${action}`));
    if (res.status >= 400) {
      throw new Error(`followSpeaker(${persona}, ${speakerPersonId}, ${on}) failed: ${res.status} (landed on ${res.url})`);
    }
    return res.url;
  }

  // ---- teardown ----

  async function teardown() {
    if (!world.slug) throw new Error('teardown(): no conference was created in this world');
    if (!world.slug.startsWith('saga-')) {
      throw new Error(
        `teardown(): refusing to drop "${world.slug}" — only saga- conferences may be torn down (docs/sagas/README.md law)`
      );
    }
    const key = process.env.SAGA_RESEED_KEY || process.env.RESEED_KEY;
    if (!key) {
      throw new Error(
        'teardown(): set SAGA_RESEED_KEY (or RESEED_KEY) in the environment to the staging RESEED_KEY secret — ' +
          'not something this tool sources itself'
      );
    }
    const res = await fetch(`${baseUrl}/__cp0/drop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-reseed': key },
      body: JSON.stringify({ slug: world.slug }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status !== 200 || body?.event?.ok !== true) {
      throw new Error(`teardown(): drop of "${world.slug}" failed: ${res.status} ${JSON.stringify(body)}`);
    }
    return body.event;
  }

  return {
    world,
    jarFor,
    personIdOf,
    signUp,
    signUpAs,
    signInLink,
    createConference,
    inviteReviewer,
    cfpSubmit,
    createGroup,
    dealTo,
    roundConfig,
    openRound,
    takeBack,
    stageReview,
    submitReviews,
    decide,
    releaseLetters,
    placeSession,
    publishAgenda,
    agendaSpeakerId,
    agendaSessionSlug,
    chooseConference,
    star,
    shareSchedule,
    sendFriendRequest,
    acceptFriendRequest,
    followSpeaker,
    teardown,
  };
}
