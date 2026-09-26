// =============================================================================
//  FRENCH ON YOUR LOCK SCREEN — Scriptable widget
//  Source: https://github.com/Skinner-765/franse-woorden
// =============================================================================
//
//  WHAT THIS SCRIPT DOES
//  Every time iOS refreshes the widget, it shows 1 French word (large) with
//  the Dutch translation (small) underneath. Difficult words show up more
//  often, and the same word never appears twice in a row.
//  Tapping the widget opens Le Train du Vocabulaire.
//
//  WHY IT IS BATTERY FRIENDLY
//  1. The network is rarely used. The word list on GitHub only changes twice
//     a day (the sync at 6:52 and 22:52). The script therefore only downloads
//     it shortly after such a sync, or when the last download is older than
//     6 hours. Every other refresh reads the list from a small file on the
//     iPhone. Result: about 2-4 small downloads (~10 kB) per day.
//     Without signal, it retries at most once every 30 minutes.
//  2. A refresh without network takes a few milliseconds: read a file, pick
//     a word, render text. No images, no location, no background work.
//  3. iOS decides how often widgets may refresh and keeps a daily budget for
//     that. This script can never exceed that budget; it only asks for
//     "not more often than every 15 minutes".
//
//  TROUBLESHOOTING — see also the README on GitHub
//  • Run the script inside the Scriptable app (tap it). You get a preview of
//    the widget, and the log (icon at the top right of the editor) shows what
//    happened: whether it downloaded and why, how many words, which word was
//    picked.
//  • Widget shows "No words": no internet AND never downloaded a list.
//    Run the script once with internet on.
//  • Widget barely changes: iOS refreshes lock screen widgets less often in
//    Low Power Mode or when the phone is used little. That is iOS behavior,
//    not this script.
//  • New words don't appear: set FORCE_DOWNLOAD below to true, run the script
//    once in the app, then set it back to false.
//
// =============================================================================


// -----------------------------------------------------------------------------
//  SETTINGS — the only lines you should ever need to change
// -----------------------------------------------------------------------------

// Where the word list lives (the "raw" version of words.json on GitHub).
const RAW_URL = "https://raw.githubusercontent.com/Skinner-765/franse-woorden/main/words.json";

// What opens when you tap the widget.
const ARTIFACT_URL = "https://claude.ai/artifact/KT2mJeeJsmTzT1hUD8dyhY";

// How often to ask iOS for a refresh (in minutes). iOS treats this as a
// minimum, not a promise: it never refreshes sooner, sometimes later.
const REFRESH_MINUTES = 15;

// When a new list can be on GitHub (iPhone local time).
// This is the time of the automatic sync + ~13 minutes margin, because the
// sync takes a moment and GitHub also caches files for ~5 minutes.
// If the sync schedule changes, update these too.
const NEW_LIST_AFTER = ["07:05", "23:05"];

// Safety net: even if the times above are off (e.g. traveling in another
// time zone), the list is re-downloaded at least every this many hours.
const MAX_CACHE_AGE_HOURS = 6;

// How many recently shown words are skipped, so you don't see the same word
// twice in quick succession.
const NO_REPEAT_COUNT = 5;

// After a failed download (no signal), wait this long before trying again.
const RETRY_AFTER_MINUTES = 30;

// Emergency switch for troubleshooting: true = always download.
// Keep this false normally (true costs more battery).
const FORCE_DOWNLOAD = false;


// -----------------------------------------------------------------------------
//  FILES ON THE IPHONE
//  The script keeps 2 small files in a "french-widget" folder inside
//  Scriptable's local storage. They are rebuilt automatically if missing.
// -----------------------------------------------------------------------------

const fm = FileManager.local();
const DIR = fm.joinPath(fm.documentsDirectory(), "french-widget");
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true);

// cache.json = the last downloaded word list (+ when it was downloaded).
const CACHE_PATH = fm.joinPath(DIR, "cache.json");
// recent.json = which words were shown most recently.
const RECENT_PATH = fm.joinPath(DIR, "recent.json");

// Reads a JSON file. If it is missing or corrupt, returns `fallback`
// instead of crashing.
function readJSON(path, fallback) {
  try {
    return fm.fileExists(path) ? JSON.parse(fm.readString(path)) : fallback;
  } catch (e) {
    console.log("Could not read " + path + ", using fallback: " + e);
    return fallback;
  }
}


// -----------------------------------------------------------------------------
//  STEP 1 — DO WE NEED TO DOWNLOAD?
//  This is the battery-saving part: the answer is usually "no".
// -----------------------------------------------------------------------------

// Returns the most recent moment (today or yesterday) at which a new list
// may be on GitHub, based on NEW_LIST_AFTER.
function lastSyncMoment(now) {
  let latest = 0;
  for (const daysBack of [0, 1]) {
    for (const time of NEW_LIST_AFTER) {
      const [hour, minute] = time.split(":").map(Number);
      const d = new Date(now);
      d.setDate(d.getDate() - daysBack);
      d.setHours(hour, minute, 0, 0);
      if (d.getTime() <= now && d.getTime() > latest) latest = d.getTime();
    }
  }
  return latest;
}

// Returns the reason to download (a string), or null if the local copy is
// fresh enough.
function downloadReason(cache, now) {
  if (FORCE_DOWNLOAD) return "FORCE_DOWNLOAD is on";
  if (!cache || !cache.fetchedAt) return "no list on the iPhone yet";
  // Did the previous attempt fail less than RETRY_AFTER_MINUTES ago?
  // Then don't try again yet: saves battery when signal is bad.
  if (cache.failedAt && now - cache.failedAt < RETRY_AFTER_MINUTES * 60 * 1000) return null;
  if (now - cache.fetchedAt > MAX_CACHE_AGE_HOURS * 3600 * 1000) return "list older than " + MAX_CACHE_AGE_HOURS + " hours";
  if (cache.fetchedAt < lastSyncMoment(now)) return "a sync has run since the last download";
  return null;
}


// -----------------------------------------------------------------------------
//  STEP 2 — GET THE WORD LIST (from GitHub or from the iPhone itself)
// -----------------------------------------------------------------------------

async function loadWords() {
  const now = Date.now();
  const cache = readJSON(CACHE_PATH, null);
  const reason = downloadReason(cache, now);

  if (!reason) {
    console.log("No download needed, using list from " + new Date(cache.fetchedAt).toLocaleString() + ".");
    return cache.words;
  }

  console.log("Downloading, because: " + reason);
  try {
    // "?t=..." makes sure we don't get an old, intermediately cached copy.
    const req = new Request(RAW_URL + "?t=" + now);
    req.timeoutInterval = 8; // give up after 8 seconds so the widget never hangs
    const data = await req.loadJSON();

    // Guard: an empty or broken list never overwrites a good one.
    if (!data || !Array.isArray(data.words) || data.words.length === 0) {
      throw new Error("list on GitHub is empty or invalid");
    }

    fm.writeString(CACHE_PATH, JSON.stringify({ fetchedAt: now, words: data.words }));
    console.log("Downloaded " + data.words.length + " words (list from " + data.updatedAt + ").");
    return data.words;
  } catch (e) {
    // No internet or GitHub unreachable: use the last good list, and record
    // the failed attempt so we wait RETRY_AFTER_MINUTES before retrying.
    console.log("Download failed (" + e + "), using the list on the iPhone.");
    if (cache) {
      cache.failedAt = now;
      fm.writeString(CACHE_PATH, JSON.stringify(cache));
      return cache.words;
    }
    return [];
  }
}


// -----------------------------------------------------------------------------
//  STEP 3 — PICK A WORD
//  Every word gets a weight. The higher the weight, the bigger the chance it
//  is shown. A word with weight 6 appears on average 6x as often as a word
//  with weight 1.
// -----------------------------------------------------------------------------

// Today's date as "2026-09-26", in the iPhone's time zone.
function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function weight(word, date) {
  let w = 1;                                                  // every word: base chance
  if (word.nextReview && word.nextReview <= date) w += 3;     // due or overdue: +3
  w += 1.5 * (word.incorrect || 0);                           // per wrong answer: +1.5
  if ((word.incorrect || 0) > (word.correct || 0)) w += 1;    // wrong more often than right: +1
  return w;
}

function pickWord(words) {
  const key = w => w.id || w.fr;
  const recent = readJSON(RECENT_PATH, []);

  // Temporarily exclude recently shown words (unless nothing would be left).
  let pool = words.filter(w => !recent.includes(key(w)));
  if (pool.length === 0) pool = words;

  // Weighted draw: pick a random number between 0 and the sum of all
  // weights, then walk through the words until that number is "used up".
  const date = today();
  const total = pool.reduce((sum, w) => sum + weight(w, date), 0);
  let ticket = Math.random() * total;
  let choice = pool[pool.length - 1];
  for (const w of pool) {
    ticket -= weight(w, date);
    if (ticket <= 0) { choice = w; break; }
  }

  // Remember that this word was just shown (newest first, max NO_REPEAT_COUNT).
  const max = Math.min(NO_REPEAT_COUNT, Math.max(0, words.length - 1));
  const updated = [key(choice), ...recent.filter(k => k !== key(choice))].slice(0, max);
  fm.writeString(RECENT_PATH, JSON.stringify(updated));

  console.log("Picked: " + choice.fr + " (weight " + weight(choice, date) + " of total " + total + ")");
  return choice;
}


// -----------------------------------------------------------------------------
//  STEP 4 — RENDER THE WIDGET
//  Lock screen widgets are always monochrome (iOS picks the color), so only
//  font sizes and opacity are set here.
// -----------------------------------------------------------------------------

function buildWidget(word) {
  const widget = new ListWidget();
  widget.url = ARTIFACT_URL;
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  const family = config.widgetFamily; // which widget size iOS is asking for

  // Single line above the clock (if you choose that variant).
  if (family === "accessoryInline") {
    widget.addText(`${word.fr} · ${word.nl}`);
    return widget;
  }

  // Circular slot: only room for the French word.
  if (family === "accessoryCircular") {
    widget.addAccessoryWidgetBackground = true;
    const text = widget.addText(word.fr);
    text.font = Font.boldSystemFont(12);
    text.centerAlignText();
    text.minimumScaleFactor = 0.4;
    text.lineLimit = 3;
    return widget;
  }

  // Rectangular lock screen widget: the main variant.
  // (Also used as the preview when you run the script in the app.)
  if (family === "accessoryRectangular" || !config.runsInWidget) {
    const french = widget.addText(word.fr);
    french.font = Font.boldSystemFont(17);
    french.lineLimit = 1;
    french.minimumScaleFactor = 0.55; // long words shrink to 55% instead of being cut off

    widget.addSpacer(2);

    const dutch = widget.addText(word.nl);
    dutch.font = Font.systemFont(13);
    dutch.textOpacity = 0.7;          // slightly dimmer so the French stands out
    dutch.lineLimit = 2;
    dutch.minimumScaleFactor = 0.7;
    return widget;
  }

  // Home screen widget (small/medium), should you ever want one: includes
  // the example sentence, since there is more room.
  widget.backgroundColor = new Color("#1c1c1e");
  const french = widget.addText(word.fr);
  french.font = Font.boldSystemFont(20);
  french.textColor = Color.white();
  french.minimumScaleFactor = 0.5;
  widget.addSpacer(4);
  const dutch = widget.addText(word.nl);
  dutch.font = Font.systemFont(14);
  dutch.textColor = new Color("#a0a0a5");
  if (word.example) {
    widget.addSpacer(8);
    const example = widget.addText(word.example);
    example.font = Font.italicSystemFont(12);
    example.textColor = new Color("#7a7a80");
    example.lineLimit = 3;
  }
  return widget;
}


// -----------------------------------------------------------------------------
//  RUN
// -----------------------------------------------------------------------------

const words = await loadWords();
const word = words.length
  ? pickWord(words)
  : { fr: "No words", nl: "Run the script once with internet" };
const widget = buildWidget(word);

if (config.runsInWidget) {
  Script.setWidget(widget);                    // on the lock screen
} else {
  await widget.presentAccessoryRectangular();  // preview inside the app
}
Script.complete();
