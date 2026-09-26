// Frans op je lockscreen — Scriptable-widget
// Bron: https://github.com/Skinner-765/franse-woorden
//
// Toont 1 Frans woord (groot) met de Nederlandse vertaling (klein) eronder.
// Bij elke refresh een nieuw woord. Woorden die "due" zijn of die je eerder
// fout had komen vaker langs, en hetzelfde woord komt nooit vlak na elkaar.
// Tik op de widget om Le Train du Vocabulaire te openen.

const RAW_URL = "https://raw.githubusercontent.com/Skinner-765/franse-woorden/main/woorden.json";
const ARTIFACT_URL = "https://claude.ai/artifact/KT2mJeeJsmTzT1hUD8dyhY";
const REFRESH_MINUTEN = 15;   // een wens aan iOS; iOS beslist zelf wanneer het echt ververst
const GEEN_HERHALING = 5;     // zoveel recent getoonde woorden worden overgeslagen

const fm = FileManager.local();
const MAP = fm.joinPath(fm.documentsDirectory(), "frans-widget");
if (!fm.fileExists(MAP)) fm.createDirectory(MAP, true);
const CACHE = fm.joinPath(MAP, "woorden.json");
const STATE = fm.joinPath(MAP, "recent.json");

function leesJSON(pad, standaard) {
  try { return fm.fileExists(pad) ? JSON.parse(fm.readString(pad)) : standaard; }
  catch (e) { return standaard; }
}

async function haalWoorden() {
  try {
    const req = new Request(RAW_URL + "?t=" + Date.now());
    req.timeoutInterval = 8;
    const data = await req.loadJSON();
    if (!data || !Array.isArray(data.woorden) || data.woorden.length === 0) throw new Error("lege lijst");
    fm.writeString(CACHE, JSON.stringify(data));
    return data.woorden;
  } catch (e) {
    const cache = leesJSON(CACHE, null);   // offline: laatst opgehaalde lijst
    return cache ? cache.woorden : [];
  }
}

function vandaag() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function gewicht(w, datum) {
  let g = 1;
  if (w.nextReview && w.nextReview <= datum) g += 3;       // due of achterstallig
  g += 1.5 * (w.incorrect || 0);                            // vaker fout = vaker tonen
  if ((w.incorrect || 0) > (w.correct || 0)) g += 1;        // nog niet onder de knie
  return g;
}

function kiesWoord(woorden) {
  const recent = leesJSON(STATE, []);
  const sleutel = w => w.id || w.fr;
  let pool = woorden.filter(w => !recent.includes(sleutel(w)));
  if (pool.length === 0) pool = woorden;

  const datum = vandaag();
  const totaal = pool.reduce((s, w) => s + gewicht(w, datum), 0);
  let r = Math.random() * totaal;
  let keuze = pool[pool.length - 1];
  for (const w of pool) {
    r -= gewicht(w, datum);
    if (r <= 0) { keuze = w; break; }
  }

  const max = Math.min(GEEN_HERHALING, Math.max(0, woorden.length - 1));
  const nieuw = [sleutel(keuze), ...recent.filter(k => k !== sleutel(keuze))].slice(0, max);
  fm.writeString(STATE, JSON.stringify(nieuw));
  return keuze;
}

function maakWidget(woord) {
  const w = new ListWidget();
  w.url = ARTIFACT_URL;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTEN * 60 * 1000);
  const soort = config.widgetFamily;

  if (soort === "accessoryInline") {
    w.addText(`${woord.fr} · ${woord.nl}`);
    return w;
  }

  if (soort === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const t = w.addText(woord.fr);
    t.font = Font.boldSystemFont(12);
    t.centerAlignText();
    t.minimumScaleFactor = 0.4;
    t.lineLimit = 3;
    return w;
  }

  if (soort === "accessoryRectangular" || !config.runsInWidget) {
    // De lockscreen-widget waar het om draait
    const fr = w.addText(woord.fr);
    fr.font = Font.boldSystemFont(17);
    fr.lineLimit = 1;
    fr.minimumScaleFactor = 0.55;

    w.addSpacer(2);

    const nl = w.addText(woord.nl);
    nl.font = Font.systemFont(13);
    nl.textOpacity = 0.7;
    nl.lineLimit = 2;
    nl.minimumScaleFactor = 0.7;
    return w;
  }

  // Home screen-widget (klein/middel): ook het voorbeeldzinnetje
  w.backgroundColor = new Color("#1c1c1e");
  const fr = w.addText(woord.fr);
  fr.font = Font.boldSystemFont(20);
  fr.textColor = Color.white();
  fr.minimumScaleFactor = 0.5;
  w.addSpacer(4);
  const nl = w.addText(woord.nl);
  nl.font = Font.systemFont(14);
  nl.textColor = new Color("#a0a0a5");
  if (woord.example) {
    w.addSpacer(8);
    const vb = w.addText(woord.example);
    vb.font = Font.italicSystemFont(12);
    vb.textColor = new Color("#7a7a80");
    vb.lineLimit = 3;
  }
  return w;
}

const woorden = await haalWoorden();
const woord = woorden.length
  ? kiesWoord(woorden)
  : { fr: "Geen woorden", nl: "Geen internet en nog geen opgeslagen lijst" };
const widget = maakWidget(woord);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentAccessoryRectangular();   // voorbeeld als je het script in de app uitvoert
}
Script.complete();
