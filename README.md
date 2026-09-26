# franse-woorden

Franse woordenlijst voor een lockscreen-widget op iPhone (via de app Scriptable).

- `woorden.json`: de woordenlijst. Wordt elke ochtend automatisch bijgewerkt vanuit Le Train du Vocabulaire.
- `frans-lockscreen.js`: het Scriptable-script voor de widget.
- `tools/build_woorden.py`: zet een export van de woordendatabase om naar `woorden.json`.

## Widget installeren

1. Installeer **Scriptable** uit de App Store.
2. Open `frans-lockscreen.js` hierboven, tik op het kopieer-icoon (Copy raw file).
3. Scriptable → `+` → plak de code → tik bovenaan op de titel en noem het script **Frans** → Done.
4. Tik één keer op het script om te testen: je ziet een voorbeeld van de lockscreen-widget.
5. Lockscreen lang indrukken → **Aanpassen** → **Toegangsscherm** → tik op het vak onder de klok → kies **Scriptable** → de rechthoekige widget.
6. Tik op de nieuwe widget (nog in bewerkmodus) → **Script** → kies **Frans**.
