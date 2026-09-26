# franse-woorden

Franse woordenlijst voor een lockscreen-widget op iPhone (via de app Scriptable).

## Hoe het in elkaar zit

```
Le Train du Vocabulaire (artifact)
        │  2x per dag (6:52 en 22:52) leest een geplande taak de woorden
        ▼
woorden.json in deze repo
        │  de widget downloadt dit alleen kort na zo'n sync (of na 6 uur)
        ▼
kopie op je iPhone  ──►  lockscreen-widget toont elke refresh 1 woord
```

| Bestand | Wat |
|---|---|
| `woorden.json` | De woordenlijst. Nooit met de hand aanpassen: de sync overschrijft het. |
| `frans-lockscreen.js` | Het Scriptable-script. Alle uitleg staat als commentaar in de code. |
| `tools/build_woorden.py` | Gebruikt door de sync: zet de export van het artifact om naar `woorden.json`. |

## Widget installeren

1. Installeer **Scriptable** uit de App Store.
2. Open `frans-lockscreen.js` hierboven en kopieer de code (kopieer-icoon rechtsboven).
3. Scriptable → `+` → plak de code → tik bovenaan op de titel en noem het script **Frans** → Done.
4. Tik één keer op het script om te testen: je ziet een voorbeeld van de lockscreen-widget.
5. Lockscreen lang indrukken → **Aanpassen** → **Toegangsscherm** → tik op het vak onder de klok → kies **Scriptable** → de rechthoekige widget.
6. Tik op de nieuwe widget (nog in bewerkmodus) → **Script** → kies **Frans**.

Een nieuwe versie van het script installeren = stap 2 en 3 herhalen, en de oude code volledig vervangen.

## Batterij

- Het script downloadt de lijst maar 2-4 keer per dag (±10 kB). Alle andere refreshes lezen een bestandje op de iPhone en duren enkele milliseconden.
- Zonder bereik probeert het hoogstens 1x per half uur opnieuw.
- iOS beslist zelf hoe vaak widgets verversen en houdt daar een dagbudget voor bij. Het script vraagt alleen "niet vaker dan elke 15 minuten".

## Troubleshooting

| Probleem | Oplossing |
|---|---|
| Widget toont "Geen woorden" | Nog nooit een lijst gedownload en geen internet. Open het script 1x in Scriptable met internet aan. |
| Widget verandert (bijna) niet | iOS ververst minder vaak bij Laag stroomverbruik-modus of als je je telefoon weinig gebruikt. Dat is iOS, niet het script. |
| Nieuwe woorden verschijnen niet | 1) Kijk op GitHub of `woorden.json` die ochtend/avond bijgewerkt is (commits "Woordenlijst bijwerken"). Zo niet: de geplande sync-taak liep niet, kijk in de run-geschiedenis ervan. 2) Wel bijgewerkt: zet `VERPLICHT_DOWNLOADEN` in het script op `true`, voer het 1x uit in de app, zet terug op `false`. |
| Wat deed het script precies? | Voer het uit in Scriptable en open de log (icoon rechtsboven in de editor): je ziet of er gedownload werd, hoeveel woorden, en welk woord gekozen werd. |
