# Working on the city models

The project is one file, `city-models.html`: 3D models of Philadelphia and New York, with
their transit and our proposals, on one shared engine (pick the city on its start menu).
`README.md` has the overview, and `docs/PHL.md` and `docs/NYC.md` describe each city and how
to rebuild its data. The Git repository lives on the office share:

```
\\192.168.168.72\tsptemp\sean\test
```

## What you need

- Git for Windows (https://git-scm.com/download/win)
- To be on the office network
- Chrome or Edge, with internet access (the page loads three.js from a CDN)

## One-time setup

Run these in Git Bash or PowerShell.

1. Tell Git to trust the share. Files on it are owned by the server's guest account, so Git
   refuses to use the repository without this:

   ```
   git config --global --add safe.directory //192.168.168.72/tsptemp/sean/test/.git
   ```

2. Clone it to your own computer:

   ```
   git clone //192.168.168.72/tsptemp/sean/test city-models
   cd city-models
   ```

3. If you haven't used Git on this computer before, set your name and email:

   ```
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

## Looking at the models

Double-click `city-models.html` to open it in your browser, then pick a city. There is no
server or build step.

## Making changes

Work in your own clone, not in the share folder.

```
git pull                          # get everyone's latest changes first
# ... edit city-models.html ...
git add city-models.html
git commit -m "Short description of the change"
git push
```

Read the **EDITING GUIDE** comment at the top of `city-models.html` before you edit.
It explains each city's coordinates, the data blocks and where each feature lives in the code.
The file is about 28 MB, so use an editor that handles large files well, such as VS Code.
If you have the sources, edit those instead and rebuild (see `README.md`).

### If `git push` is refused

- **"Updates were rejected … fetch first"**: someone pushed before you. Run `git pull`
  (resolve any conflicts it reports), then `git push` again.
- **"Working directory has unstaged changes"** (or similar): someone has edits in
  progress in the share copy. Ask Sean, or try again later. Your commits are safe in your clone.

## Good to know

- The share is not password-protected. Anyone on the office network can open or change it,
  so keep anything sensitive out of this repository.
- Big edits to the same part of the file by two people at once cause merge conflicts. Say
  in chat what you're working on.
- Questions go to Sean.
