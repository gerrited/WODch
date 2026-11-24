# Prompt für Claude Code

Entpacke das Paket ins Repo als `docs/redesign/` und gib Claude Code diesen Text:

---

Setze das Redesign aus `docs/redesign/` im Frontend um.

1. Lies zuerst `AGENTS.md`, dann `docs/redesign/HANDOFF.md` komplett. Schau dir die Bilder in `docs/redesign/screenshots/` an und nutze die Mockups in `docs/redesign/mockups/*.html` als Referenz für genaue Masse, Farben und Abstände (Inline-Styles im Markup).
2. Arbeite die Reihenfolge aus HANDOFF.md §4 Schritt für Schritt ab. Nach jedem Schritt in `frontend/`: `npm test` und `npm run build`. Erst weiter, wenn beides grün ist.
3. Nur Präsentationsschicht: keine Änderungen an Sync, Stores, Wire-Format oder Server. Wenn du denkst, dass doch eine nötig ist, halte an und frag mich.
4. Texte aus `docs/redesign/copy.md`, mit der Schreibweise des Repos (ß).
5. Lege einen eigenen Branch `redesign` an und committe pro Schritt. Kein Push.
6. Zum Schluss: Abnahmekriterien aus HANDOFF.md §7 durchgehen und mir eine kurze Liste geben, was erfüllt ist und was offen bleibt.
