// =============================================================================
//  FRANS OP JE LOCKSCREEN — Scriptable-widget
//  Bron: https://github.com/Skinner-765/franse-woorden
// =============================================================================
//
//  WAT DOET DIT SCRIPT?
//  Elke keer dat iOS de widget ververst, toont het 1 Frans woord (groot) met
//  de Nederlandse vertaling (klein) eronder. Moeilijke woorden komen vaker
//  langs, en hetzelfde woord komt nooit vlak na elkaar terug.
//  Tik op de widget om Le Train du Vocabulaire te openen.
//
//  WAAROM IS HET BATTERIJZUINIG?
//  1. Internet wordt zelden gebruikt. De woordenlijst op GitHub verandert maar
//     2x per dag (de sync om 6:52 en 22:52). Het script haalt de lijst dus
//     alleen op kort na zo'n sync, of als de laatste download ouder is dan
//     6 uur. Alle andere keren leest het de lijst uit een bestandje op je
//     iPhone. Resultaat: ongeveer 2-4 kleine downloads (±10 kB) per dag.
//     Zonder bereik probeert het hoogstens 1x per half uur opnieuw.
//  2. Een refresh zonder internet duurt enkele milliseconden: bestandje lezen,
//     woord kiezen, tekst tonen. Geen afbeeldingen, geen locatie, geen
//     achtergrondtaken.
//  3. iOS bepaalt zelf hoe vaak widgets mogen verversen en houdt daar een
//     dagelijks budget voor bij. Dit script kan dat budget nooit overschrijden,
//     het vraagt alleen "niet vaker dan elke 15 minuten".
//
//  TROUBLESHOOTING — zie ook de README op GitHub
//  • Voer het script uit in de Scriptable-app (tik erop). Je krijgt een
//    voorbeeld van de widget, en onderaan in de log (icoon rechtsboven in de
//    editor) staat wat er gebeurde: of er gedownload werd, hoeveel woorden,
//    welk woord gekozen werd.
//  • Widget toont "Geen woorden": geen internet én nog nooit een lijst
//    gedownload. Open het script één keer met internet aan.
//  • Widget verandert niet: iOS ververst lockscreen-widgets minder vaak bij
//    Laag stroomverbruik-modus of weinig gebruik. Dat is normaal gedrag van
//    iOS, niet van dit script.
//  • Nieuwe woorden verschijnen niet: zet VERPLICHT_DOWNLOADEN hieronder even
//    op true, voer het script 1x uit in de app, en zet het terug op false.
//
// =============================================================================


// -----------------------------------------------------------------------------
//  INSTELLINGEN — dit zijn de enige regels die je ooit zou moeten aanpassen
// -----------------------------------------------------------------------------

// Waar de woordenlijst staat (de "raw"-versie van woorden.json op GitHub).
const RAW_URL = "https://raw.githubusercontent.com/Skinner-765/franse-woorden/main/woorden.json";

// Wat er opent als je op de widget tikt.
const ARTIFACT_URL = "https://claude.ai/artifact/KT2mJeeJsmTzT1hUD8dyhY";

// Hoe vaak je iOS vraagt om te verversen (in minuten). iOS behandelt dit als
// een minimum, niet als een belofte: het ververst nooit vaker, soms trager.
const REFRESH_MINUTEN = 15;

// Wanneer er nieuwe woorden op GitHub kunnen staan (tijd op je iPhone).
// Dit is het tijdstip van de automatische sync + ±13 minuten marge, omdat de
// sync even duurt en GitHub bestanden ook nog ±5 minuten cachet.
// Verandert het tijdstip van de sync, pas dit dan ook aan.
const NIEUWE_LIJST_VANAF = ["07:05", "23:05"];

// Vangnet: ook als de tijden hierboven niet kloppen (bv. op reis in een
// andere tijdzone), wordt de lijst ten minste om de zoveel uur opnieuw gehaald.
const MAX_LEEFTIJD_UUR = 6;

// Hoeveel recent getoonde woorden worden overgeslagen, zodat je niet twee
// keer kort na elkaar hetzelfde woord ziet.
const GEEN_HERHALING = 5;

// Noodknop voor troubleshooting: op true = altijd opnieuw downloaden.
// Laat dit normaal op false staan (true kost meer batterij).
const VERPLICHT_DOWNLOADEN = false;


// -----------------------------------------------------------------------------
//  BESTANDEN OP JE IPHONE
//  Het script bewaart 2 kleine bestandjes in de map "frans-widget" binnen
//  Scriptable. Je kan die map veilig verwijderen: alles wordt dan opnieuw
//  opgebouwd bij de volgende refresh (met internet).
// -----------------------------------------------------------------------------

const fm = FileManager.local();
const MAP = fm.joinPath(fm.documentsDirectory(), "frans-widget");
if (!fm.fileExists(MAP)) fm.createDirectory(MAP, true);

// woorden.json = de laatst gedownloade woordenlijst (+ wanneer gedownload).
const CACHE = fm.joinPath(MAP, "woorden.json");
// recent.json = welke woorden de laatste keren getoond werden.
const RECENT = fm.joinPath(MAP, "recent.json");

// Leest een JSON-bestand. Bestaat het niet of is het kapot, dan krijg je
// "standaard" terug in plaats van een crash.
function leesJSON(pad, standaard) {
  try {
    return fm.fileExists(pad) ? JSON.parse(fm.readString(pad)) : standaard;
  } catch (e) {
    console.log("Kon " + pad + " niet lezen, gebruik standaardwaarde: " + e);
    return standaard;
  }
}


// -----------------------------------------------------------------------------
//  STAP 1 — MOET ER GEDOWNLOAD WORDEN?
//  Dit is het batterijbesparende deel: meestal is het antwoord "nee".
// -----------------------------------------------------------------------------

// Geeft het meest recente moment (vandaag of gisteren) terug waarop er een
// nieuwe lijst op GitHub kan staan, volgens NIEUWE_LIJST_VANAF.
function laatsteSyncMoment(nu) {
  let laatste = 0;
  for (const dagTerug of [0, 1]) {
    for (const tijd of NIEUWE_LIJST_VANAF) {
      const [uur, minuut] = tijd.split(":").map(Number);
      const d = new Date(nu);
      d.setDate(d.getDate() - dagTerug);
      d.setHours(uur, minuut, 0, 0);
      if (d.getTime() <= nu && d.getTime() > laatste) laatste = d.getTime();
    }
  }
  return laatste;
}

function moetDownloaden(cache, nu) {
  if (VERPLICHT_DOWNLOADEN) return "noodknop staat aan";
  if (!cache || !cache.opgehaaldOp) return "nog geen lijst op de iPhone";
  // Mislukte de vorige poging (geen internet) minder dan 30 min geleden?
  // Dan nu niet opnieuw proberen: bespaart batterij bij slecht bereik.
  if (cache.mislukt && nu - cache.mislukt < 30 * 60 * 1000) return null;
  if (nu - cache.opgehaaldOp > MAX_LEEFTIJD_UUR * 3600 * 1000) return "lijst ouder dan " + MAX_LEEFTIJD_UUR + " uur";
  if (cache.opgehaaldOp < laatsteSyncMoment(nu)) return "er is een sync geweest sinds de laatste download";
  return null; // null = niet downloaden, de lijst op de iPhone is actueel genoeg
}


// -----------------------------------------------------------------------------
//  STAP 2 — WOORDENLIJST OPHALEN (van GitHub of van de iPhone zelf)
// -----------------------------------------------------------------------------

async function haalWoorden() {
  const nu = Date.now();
  const cache = leesJSON(CACHE, null);
  const reden = moetDownloaden(cache, nu);

  if (!reden) {
    console.log("Geen download nodig, lijst van " + new Date(cache.opgehaaldOp).toLocaleString() + " gebruikt.");
    return cache.woorden;
  }

  console.log("Downloaden, want: " + reden);
  try {
    // "?t=..." zorgt ervoor dat je niet een oude, tussentijds bewaarde
    // versie van GitHub krijgt.
    const req = new Request(RAW_URL + "?t=" + nu);
    req.timeoutInterval = 8; // na 8 seconden opgeven, zodat de widget niet blijft hangen
    const data = await req.loadJSON();

    // Controle: een lege of kapotte lijst overschrijft nooit een goede lijst.
    if (!data || !Array.isArray(data.woorden) || data.woorden.length === 0) {
      throw new Error("lijst op GitHub is leeg of ongeldig");
    }

    fm.writeString(CACHE, JSON.stringify({ opgehaaldOp: nu, woorden: data.woorden }));
    console.log("Gedownload: " + data.woorden.length + " woorden (lijst van " + data.updatedAt + ").");
    return data.woorden;
  } catch (e) {
    // Geen internet of GitHub onbereikbaar: gebruik de laatste goede lijst.
    // We noteren het tijdstip van de mislukte poging, zodat het script pas
    // na 30 minuten opnieuw probeert (zie moetDownloaden).
    console.log("Download mislukt (" + e + "), gebruik de lijst op de iPhone.");
    if (cache) {
      cache.mislukt = nu;
      fm.writeString(CACHE, JSON.stringify(cache));
      return cache.woorden;
    }
    return [];
  }
}


// -----------------------------------------------------------------------------
//  STAP 3 — WOORD KIEZEN
//  Elk woord krijgt een gewicht. Hoe hoger het gewicht, hoe groter de kans
//  dat het getoond wordt. Een woord met gewicht 6 komt dus gemiddeld 6x
//  zo vaak langs als een woord met gewicht 1.
// -----------------------------------------------------------------------------

// Datum van vandaag als "2026-09-26", in de tijdzone van je iPhone.
function vandaag() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function gewicht(w, datum) {
  let g = 1;                                             // elk woord: basiskans
  if (w.nextReview && w.nextReview <= datum) g += 3;     // due of achterstallig: +3
  g += 1.5 * (w.incorrect || 0);                         // per keer fout: +1,5
  if ((w.incorrect || 0) > (w.correct || 0)) g += 1;     // vaker fout dan goed: +1
  return g;
}

function kiesWoord(woorden) {
  const sleutel = w => w.id || w.fr;
  const recent = leesJSON(RECENT, []);

  // Recent getoonde woorden tijdelijk uitsluiten (tenzij er dan niets overblijft).
  let pool = woorden.filter(w => !recent.includes(sleutel(w)));
  if (pool.length === 0) pool = woorden;

  // Gewogen loting: trek een getal tussen 0 en het totaal van alle gewichten,
  // en loop door de woorden tot je dat getal "opgebruikt" hebt.
  const datum = vandaag();
  const totaal = pool.reduce((som, w) => som + gewicht(w, datum), 0);
  let lot = Math.random() * totaal;
  let keuze = pool[pool.length - 1];
  for (const w of pool) {
    lot -= gewicht(w, datum);
    if (lot <= 0) { keuze = w; break; }
  }

  // Onthouden dat dit woord net getoond is (nieuwste vooraan, max GEEN_HERHALING).
  const max = Math.min(GEEN_HERHALING, Math.max(0, woorden.length - 1));
  const nieuw = [sleutel(keuze), ...recent.filter(k => k !== sleutel(keuze))].slice(0, max);
  fm.writeString(RECENT, JSON.stringify(nieuw));

  console.log("Gekozen: " + keuze.fr + " (gewicht " + gewicht(keuze, datum) + " van totaal " + totaal + ")");
  return keuze;
}


// -----------------------------------------------------------------------------
//  STAP 4 — WIDGET TEKENEN
//  Lockscreen-widgets zijn altijd eenkleurig (iOS kiest de kleur), dus hier
//  staan alleen lettergroottes en doorzichtigheid.
// -----------------------------------------------------------------------------

function maakWidget(woord) {
  const w = new ListWidget();
  w.url = ARTIFACT_URL;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTEN * 60 * 1000);
  const soort = config.widgetFamily; // welk formaat widget iOS vraagt

  // Smalle regel boven de klok (als je die variant kiest).
  if (soort === "accessoryInline") {
    w.addText(`${woord.fr} · ${woord.nl}`);
    return w;
  }

  // Rond vakje: alleen plaats voor het Franse woord.
  if (soort === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const t = w.addText(woord.fr);
    t.font = Font.boldSystemFont(12);
    t.centerAlignText();
    t.minimumScaleFactor = 0.4;
    t.lineLimit = 3;
    return w;
  }

  // Rechthoekige lockscreen-widget: de hoofdvariant.
  // (Ook gebruikt als voorbeeld wanneer je het script in de app uitvoert.)
  if (soort === "accessoryRectangular" || !config.runsInWidget) {
    const fr = w.addText(woord.fr);
    fr.font = Font.boldSystemFont(17);
    fr.lineLimit = 1;
    fr.minimumScaleFactor = 0.55; // lange woorden krimpen tot 55% in plaats van afgekapt te worden

    w.addSpacer(2);

    const nl = w.addText(woord.nl);
    nl.font = Font.systemFont(13);
    nl.textOpacity = 0.7;         // iets lichter, zodat het Frans de aandacht trekt
    nl.lineLimit = 2;
    nl.minimumScaleFactor = 0.7;
    return w;
  }

  // Home screen-widget (klein/middel), mocht je die ooit willen: ook met
  // voorbeeldzin, want daar is meer plaats.
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


// -----------------------------------------------------------------------------
//  UITVOEREN
// -----------------------------------------------------------------------------

const woorden = await haalWoorden();
const woord = woorden.length
  ? kiesWoord(woorden)
  : { fr: "Geen woorden", nl: "Open het script 1x met internet" };
const widget = maakWidget(woord);

if (config.runsInWidget) {
  Script.setWidget(widget);                    // op je lockscreen
} else {
  await widget.presentAccessoryRectangular();  // voorbeeld in de app
}
Script.complete();
