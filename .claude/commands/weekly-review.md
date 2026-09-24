---
description: The Monday review, written from three commands. What needs a decision, the open events, the calendar, then the five things that matter this week.
---

Run these three, in this order, and write the review from what they return. Do not write anything they do not support.

```
npm run safety -- attention
npm run safety -- incidents
npm run safety -- inspections
```

Then write it in this shape, no more than a page:

1. **The week in one line.** Open incidents, open actions and how many are overdue, high or critical hazards, induction gaps, sites quiet on toolbox talks.
2. **The one that cannot wait.** Any notifiable event WorkSafe has not been told about, by name, with the phone number. This section existing at all is an emergency; empty is the system working.
3. **The events.** Each open incident with its days-open count and its next verb: notify, investigate, act, close. Anything past thirty days is failing `/compliance` and says so.
4. **The actions.** Overdue first, each with its owner and its source. An action from a notifiable event that is overdue gets named twice.
5. **The people.** Who is on the tools without a current induction, and whose tickets expire inside 30 days, with the booking that fixes each.
6. **The calendar.** Inspections overdue and due this fortnight, and which sites have not had a toolbox talk.
7. **The five things to do this week.** Picked from the attention list, weighted by what hurts a person first and costs the business second, and say why each made the list.
8. **One thing to decide.** The single item that needs a person, not a process.

Add `npm run view -- safety-board` and `npm run view -- registers` if the operator wants pages for a management meeting: same numbers, the business's brand, and they print.

Numbers come from the commands. If a number is not in the output, it does not go in the review.
