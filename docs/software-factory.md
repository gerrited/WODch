# Software Factory

Agenten erledigen Arbeitspakete aus GitHub-Issues: planen, umsetzen, reviewen,
nachbessern. Gesteuert wird alles über Labels; der Merge auf `main` bleibt
beim Menschen, weil jeder Push auf `main` Images baut.

## Ablauf

```
Issue ──agent:plan──▶ Plan-Kommentar ──(Mensch prüft)──▶ agent:build
                                                            │
                                     PR (Branch agent/issue-<n>)
                                                            │
                                    ┌──────────▶ agent:review ─────────┐
                                    │                 │                 │
                              agent:fix          APPROVE           CHANGES ≥ 3×
                           (max. 3 Runden)          │                 │
                                    └── CHANGES ◀───┘                 ▼
                                                     ▼            needs-human
                                              agent:approved
                                                     │
                                            Mensch merged → Deploy
```

| Workflow | Auslöser | Ergebnis |
|---|---|---|
| [agent-plan.yml](../.github/workflows/agent-plan.yml) | Label `agent:plan` am Issue | Kommentar mit Spec, Plan, Risiken; Label → `agent:planned` |
| [agent-build.yml](../.github/workflows/agent-build.yml) | Label `agent:build` am Issue, oder Dispatch aus dem Review | PR mit Tests + Spec/Plan unter `docs/superpowers/`, startet Review |
| [agent-review.yml](../.github/workflows/agent-review.yml) | Dispatch aus dem Build, oder Label `agent:review` an jedem eigenen PR | Review gegen die [Checkliste](../.github/factory/review-checklist.md); `agent:approved`, `agent:fix` oder `needs-human` |
| [agent-nightly.yml](../.github/workflows/agent-nightly.yml) | täglich 03:17 UTC / montags 04:43 UTC | höchstens 3 Issues mit `agent:triage` (Sicherheit, Abhängigkeiten, Aufräumen, Doku-Drift) |
| [test.yml](../.github/workflows/test.yml) | jeder PR, und vom Image-Build wiederverwendet | `npm test` + `npm run build` in beiden Paketen |

## Labels

| Label | Bedeutung |
|---|---|
| `agent:plan` | Plan erstellen lassen |
| `agent:planned` | Plan liegt als Kommentar vor, wartet auf Freigabe |
| `agent:build` | Umsetzen lassen (Freigabe) |
| `agent:review` | Review läuft / anstoßen |
| `agent:fix` | Review hat Blocker gefunden, Agent bessert nach |
| `agent:approved` | Review bestanden, bereit für menschlichen Merge |
| `needs-human` | Agent kommt nicht weiter (Rückfrage, rotes Gate, 3 Runden ohne Erfolg) |
| `agent:triage` | Von der Wartung gefundenes Thema, noch nicht eingeplant |

## Sicherheitsmodell

Das Repo ist öffentlich, deshalb:

- **Nur der Repo-Owner** startet Agent-Läufe per Label. Issues von Fremden
  werden nie automatisch bearbeitet — vor `agent:plan`/`agent:build` den
  Issue-Text lesen (Prompt-Injection).
- Fork-PRs werden weder reviewt noch gefixt; der Fix-Modus fasst nur Branches
  unter `agent/` an.
- Agenten haben eine feste Werkzeugliste (`--allowedTools`), dürfen
  `.github/` nicht ändern und nicht auf `main` pushen. Kein Agent hat
  `packages: write`.
- Schleifen sind begrenzt: maximal 3 Fix-Runden, `timeout-minutes` und
  `--max-turns` pro Lauf, eine `concurrency`-Gruppe pro Issue bzw. PR.

## Einrichtung (einmalig)

1. **Claude-GitHub-App installieren** (<https://github.com/apps/claude>) für
   dieses Repo. Commits und PRs der App lösen — anders als `GITHUB_TOKEN` —
   den Test-Workflow auf PRs aus.
2. **Secret `ANTHROPIC_API_KEY`** unter *Settings → Secrets and variables →
   Actions* anlegen (getrennt vom Key des Backends, damit sich Kosten
   zuordnen lassen und ein Limit gesetzt werden kann).
3. **Branch-Schutz für `main`** (empfohlen): PR-Pflicht und Status-Check
   „Tests" erforderlich.
4. Labels anlegen (sind bereits angelegt; zum Wiederherstellen):

   ```bash
   for l in agent:plan agent:planned agent:build agent:review agent:fix agent:approved needs-human agent:triage; do
     gh label create "$l" --force
   done
   ```

## Bekannte Grenzen

- Die Chain nutzt `workflow_dispatch`, weil Label-Änderungen über
  `GITHUB_TOKEN` keine weiteren Workflows auslösen. Dispatches laufen mit der
  Workflow-Version von `main` — Änderungen an den Factory-Workflows greifen
  also erst nach dem Merge.
- GitHub-Cron ist unpünktlich und pausiert in Repos ohne Aktivität nach
  60 Tagen.
- Kosten: Jeder Lauf verbraucht API-Tokens; ein Build mit drei Fix-Runden
  bedeutet acht Agent-Läufe (Build, 3× Fix, 4× Review).
