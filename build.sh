bun build --compile --target=browser ./client/index.html --outdir=ts_server
bun build --compile ./ts_server/src/index.ts --outfile ./dist/command-runners
