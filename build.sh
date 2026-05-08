bun build --compile --target=browser ./client/index.html --outdir=server
pyinstaller command-runners.spec --noconfirm
