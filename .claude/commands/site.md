---
description: One site's whole safety position - hazards by risk, recent incidents, open actions, inspections due, the last toolbox talk - read it before the site visit.
---

1. Run `npm run safety -- site "<name>"` (partial names resolve). All sites side by side: `npm run safety -- sites`.
2. Read the card top to bottom and lead with anything red: an unreported notifiable event on this site ends the conversation until it is handled (`/notifiable`).
3. The visit list writes itself: the highest-scored hazard (walk it, look at the control actually working), the overdue actions (stand where they should have happened), the inspection due, and the toolbox talk if the site has gone quiet.
4. Printable versions for the ute or the board pack: `npm run docs -- site-safety-report` and `npm run docs -- hazard-register` (one per site, in the business's brand: the register is made to live on the site office wall).
