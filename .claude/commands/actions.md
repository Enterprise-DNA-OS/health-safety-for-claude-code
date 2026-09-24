---
description: The corrective actions list - what changes because of incidents, hazards and inspections - overdue first, with the ones born from notifiable events flagged.
---

1. Run `npm run safety -- actions` (add `--overdue` for just the late ones, `--all` for done history).
2. Overdue first. An action written down and left overdue is a risk the business knew about, dated, in its own records; one from a notifiable event is flagged and worse. For each: do it (`action done <match>`), or re-date it deliberately with the reason logged. Silence is the one wrong answer.
3. Adding one: `action add "what changes" --incident=INC-xxx | --hazard=HAZ-xxx | --inspection-site="<site>" --owner= --due=`. Every action gets an owner and a date; undated actions die.
4. When an action closes a loop, say which loop: the incident that can now close, the hazard whose control level just climbed, the inspection finding now fixed.
