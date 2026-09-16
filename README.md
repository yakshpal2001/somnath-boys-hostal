# Somnath Boys Hostal - Student Records

A simple local website to keep permanent records of hostel students: their
personal details and every check-in / check-out date, searchable by name.

## How to run it

**Easiest way:** double-click `Start Hostal Records.bat`. It opens the site
in your browser automatically at http://localhost:4173

**Manual way** (from a terminal in this folder):

```
npm start
```

Then open http://localhost:4173 in your browser.

Leave the black terminal window open while you use the site — closing it
stops the website. Your browser tab can be closed and reopened any time
without losing data.

## How it works

- Click **+ Add Student** to add a new student along with their first
  check-in details.
- Type a name in the search box to instantly find a student and see all
  their details and full stay history (every check-in/check-out over time).
- Open a student and click **+ New Check-in Record** if the same student
  returns later (e.g. next year) - their old history is kept, not overwritten.
- Edit or delete any individual stay record, or edit/delete the student
  entirely, from the student detail view.

## Where the data is stored

All records are saved permanently in `data/hostel.db` (a SQLite database
file) inside this folder. Back this file up occasionally (copy the `data`
folder somewhere safe) so you never lose your records.
